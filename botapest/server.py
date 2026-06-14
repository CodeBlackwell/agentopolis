"""Botapest City — event relay + city seeding.

Receives Claude Code hook payloads on POST /hook, normalizes them, and
broadcasts to browsers over SSE at GET /events. GET /city-data.json
seeds the configured repo's city on demand (cached per git HEAD).
"""
import asyncio
import json
import os
from collections import deque
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .nation import CAPITAL, discover_repos, is_mother, load_nation
from .seed import git, seed
from .zone import load_zone

app = FastAPI()
subscribers: set[asyncio.Queue] = set()
history: deque = deque(maxlen=100)
city = {"repo": ".", "zone_path": None}
nation = {"root": None, "manifest": None}

# dev mode: env vars survive uvicorn --reload cycles; cli.py still wins when used directly
if _root := os.environ.get("BOTAPEST_ROOT"):
    nation.update(root=_root, manifest=os.environ.get("BOTAPEST_MANIFEST"))
if _repo := os.environ.get("BOTAPEST_REPO"):
    city.update(repo=_repo, zone_path=os.environ.get("BOTAPEST_ZONE"))
seeded: dict[str, dict] = {}        # repo path -> {head, data}, cached per git HEAD
runner = None       # uvicorn.Server, set by cli — lets SSE streams end on Ctrl+C


def configure(repo: str, zone_path: str | None) -> None:
    city.update(repo=repo, zone_path=zone_path)


def configure_nation(root: str, manifest: str | None) -> None:
    nation.update(root=root, manifest=manifest)


def seed_cached(repo: str, zone_path: str | None = None, exclude: set | None = None) -> dict:
    key = repo + ("|capital" if exclude else "")    # capital seed differs from a full seed of the same path
    head = git(repo, "rev-parse", "HEAD").strip()
    cur = seeded.get(key)
    if not cur or cur["head"] != head:
        cur = seeded[key] = {"head": head,
                             "data": seed(repo, load_zone(repo, zone_path, exclude), exclude)}
    return cur["data"]

MAX_DETAIL = 80


def normalize(raw: dict) -> dict:
    event = {
        "event": raw.get("hook_event_name", "unknown"),
        "session": (raw.get("session_id") or "")[:8],
    }
    if raw.get("agent_id"):                    # event fired inside a subagent
        event["agent_id"] = raw["agent_id"][:8]
        event["agent_type"] = raw.get("agent_type", "agent")
    tool = raw.get("tool_name")
    if tool:
        event["tool"] = tool
        tool_input = raw.get("tool_input") or {}
        detail = (
            tool_input.get("file_path")
            or tool_input.get("command")
            or tool_input.get("pattern")
            or tool_input.get("query")
            or tool_input.get("url")
            or tool_input.get("description")
            or ""
        )
        if detail.startswith("/"):
            detail = os.path.basename(detail)
        event["detail"] = str(detail)[:MAX_DETAIL]
        file_path, cwd = tool_input.get("file_path") or "", raw.get("cwd") or ""
        if cwd and file_path.startswith(cwd + "/"):
            event["path"] = file_path[len(cwd) + 1:]
        if tool == "Bash" and "git commit" in str(tool_input.get("command") or ""):
            event["commit"] = True
        if tool in ("Task", "Agent"):
            event["agent_type"] = tool_input.get("subagent_type", "agent")
            event["agent_name"] = str(tool_input.get("description", "agent"))[:40]
    if event["event"] == "UserPromptSubmit":
        event["detail"] = str(raw.get("prompt") or "")[:MAX_DETAIL]
    if event["event"] == "Notification":
        event["detail"] = str(raw.get("message") or "")[:MAX_DETAIL]
    return event


@app.post("/hook")
async def hook(request: Request) -> dict:
    raw = await request.json()
    event = normalize(raw)
    history.append(event)
    for queue in subscribers:
        queue.put_nowait(event)
    return {"ok": True}


@app.get("/nation-data.json")
def nation_data() -> dict:
    return load_nation(nation["root"], nation["manifest"])


@app.get("/city-data.json")
def city_data(repo: str | None = None):
    root = nation["root"]
    if repo:                                    # nation drill-down
        if root and repo == CAPITAL and is_mother(root):   # the mother's own glue, minus its subrepos
            return seed_cached(root, exclude=set(discover_repos(root)))
        if not root or repo not in discover_repos(root):
            return Response(status_code=404)
        return seed_cached(str(Path(root) / repo))
    return seed_cached(city["repo"], city["zone_path"])


@app.get("/events")
async def events() -> StreamingResponse:
    queue: asyncio.Queue = asyncio.Queue()
    for event in history:                       # replay so late joiners see state
        queue.put_nowait(event)
    subscribers.add(queue)

    async def stream():
        try:
            yield "retry: 2000\n\n"
            while not (runner and runner.should_exit):
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            subscribers.discard(queue)

    return StreamingResponse(stream(), media_type="text/event-stream")


@app.get("/dev-stamp")
def dev_stamp():
    static = Path(__file__).parent / "static"
    stamp = sum(f.stat().st_mtime_ns for f in static.rglob("*") if f.is_file())
    return {"s": stamp}


@app.middleware("http")
async def no_stale_assets(request: Request, call_next):
    # static files change on every botapest upgrade; force revalidation (304s keep it cheap)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/")
def root() -> HTMLResponse:
    # one shell, two map engines: stamp the mode + inject the matching engine script
    mode = "nation" if nation["root"] else "city"
    engine = "nation.js" if mode == "nation" else "city-live.js"
    html = (Path(__file__).parent / "static" / "index.html").read_text()
    return HTMLResponse(html.replace("{{MODE}}", mode).replace("{{ENGINE}}", engine))


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
