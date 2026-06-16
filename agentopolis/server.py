"""Agentopolis — event relay + city seeding.

Receives Claude Code hook payloads on POST /hook, normalizes them, and
broadcasts to browsers over SSE at GET /events. GET /city-data.json
seeds the configured repo's city on demand (cached per git HEAD).
"""
import asyncio
import json
import os
import threading
from collections import Counter, deque
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import quote

from fastapi import FastAPI, Request, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import forge as forge_mod
from . import og as og_mod
from .nation import CAPITAL, discover_repos, is_mother, load_nation
from .seed import git, seed
from .timeline import build_timeline
from .zone import load_zone

shutting_down = asyncio.Event()                  # set on lifespan shutdown; SSE streams watch it to end


@asynccontextmanager
async def lifespan(_app: "FastAPI"):
    yield
    shutting_down.set()


app = FastAPI(lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=1024)   # timeline JSON compresses ~10x on the wire
subscribers: set[asyncio.Queue] = set()
history: deque = deque(maxlen=100)
city = {"repo": ".", "zone_path": None}
nation = {"root": None, "manifest": None}
showcase = {"dir": os.environ.get("AGENTOPOLIS_SHOWCASE"),    # serve baked fixtures, no live git
            "city": os.environ.get("AGENTOPOLIS_DEMO_CITY")}  # demo-only: land on this city, not the nation
forge_gate = threading.BoundedSemaphore(2)                    # cap concurrent clones on a public box
marathon = {"rows": [], "bundles": {}}                        # `agentopolis marathon`: ranked movies + in-memory bundles

# viral-loop funnel counters (no PII): land -> forge -> share_tapped -> share_completed -> install.
# Edges let us read the loop's conversion; client beacons (/e/<edge>) cover the share + install half.
# AGENTOPOLIS_STATS_FILE persists counts across restarts (set on the hosted demo; unset = in-memory only).
LOOP_EDGES = {"land", "forge", "share_tapped", "share_completed", "build_your_own", "install"}
STATS_FILE = Path(p) if (p := os.environ.get("AGENTOPOLIS_STATS_FILE")) else None
STATS_TOKEN = os.environ.get("AGENTOPOLIS_STATS_TOKEN")
PLAYER_CARD = os.environ.get("AGENTOPOLIS_PLAYER_CARD")   # X player cards need per-account approval; off by default
loop = Counter(json.loads(STATS_FILE.read_text())) if STATS_FILE and STATS_FILE.exists() else Counter()


def bump(edge: str) -> None:
    loop[edge] += 1
    if STATS_FILE:                                   # write-through; human-action volume is low
        tmp = STATS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(dict(loop)))
        tmp.replace(STATS_FILE)

# dev mode: env vars survive uvicorn --reload cycles; cli.py still wins when used directly
if showcase["dir"]:                              # showcase is nation mode fed by fixtures
    nation.update(root=json.loads((Path(showcase["dir"]) / "nation.json").read_text())["root"])
if _root := os.environ.get("AGENTOPOLIS_ROOT"):
    nation.update(root=_root, manifest=os.environ.get("AGENTOPOLIS_MANIFEST"))
if _repo := os.environ.get("AGENTOPOLIS_REPO"):
    city.update(repo=_repo, zone_path=os.environ.get("AGENTOPOLIS_ZONE"))
seeded: dict[str, dict] = {}        # repo path -> {head, data}, cached per git HEAD
timelines: dict[str, dict] = {}     # repo path -> {head, data}, cached per git HEAD


def configure(repo: str, zone_path: str | None) -> None:
    city.update(repo=repo, zone_path=zone_path)


def configure_marathon(rows: list, bundles: dict) -> None:
    marathon.update(rows=rows, bundles=bundles)


def configure_nation(root: str, manifest: str | None) -> None:
    nation.update(root=root, manifest=manifest)


def configure_showcase(directory: str) -> None:
    showcase["dir"] = directory                  # nation mode, but data comes from baked fixtures
    nation.update(root=json.loads((Path(directory) / "nation.json").read_text())["root"], manifest=None)


def seed_cached(repo: str, zone_path: str | None = None, exclude: set | None = None) -> dict:
    key = repo + ("|capital" if exclude else "")    # capital seed differs from a full seed of the same path
    head = git(repo, "rev-parse", "HEAD").strip()
    cur = seeded.get(key)
    if not cur or cur["head"] != head:
        cur = seeded[key] = {"head": head,
                             "data": seed(repo, load_zone(repo, zone_path, exclude), exclude)}
    return cur["data"]


def timeline_cached(repo: str) -> dict:
    head = git(repo, "rev-parse", "HEAD").strip()
    cur = timelines.get(repo)
    if not cur or cur["head"] != head:
        cur = timelines[repo] = {"head": head, "data": build_timeline(repo)}
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
    if d := showcase["dir"]:
        return json.loads((Path(d) / "nation.json").read_text())
    return load_nation(nation["root"], nation["manifest"])


@app.get("/city-data.json")
def city_data(repo: str | None = None):
    if d := showcase["dir"]:
        f = Path(d) / "cities" / ((repo or "_capital").replace("/", "%2F") + ".json")
        return json.loads(f.read_text()) if f.exists() else Response(status_code=404)
    root = nation["root"]
    if repo:                                    # nation drill-down
        if root and repo == CAPITAL and is_mother(root):   # the mother's own glue, minus its subrepos
            return seed_cached(root, exclude=set(discover_repos(root)))
        if not root or repo not in discover_repos(root):
            return Response(status_code=404)
        return seed_cached(str(Path(root) / repo))
    return seed_cached(city["repo"], city["zone_path"])


@app.get("/timeline.json")
def timeline_data(repo: str | None = None):
    if d := showcase["dir"]:                         # baked fixtures: only the demo city has a baked timeline
        f = Path(d) / "timelines" / ((repo or "_capital").replace("/", "%2F") + ".json")
        return json.loads(f.read_text()) if f.exists() else Response(status_code=404)
    root = nation["root"]
    if repo:                                        # nation drill-down, mirrors /city-data.json
        if root and repo == CAPITAL and is_mother(root):
            return timeline_cached(root)
        if not root or repo not in discover_repos(root):
            return Response(status_code=404)
        return timeline_cached(str(Path(root) / repo))
    return timeline_cached(city["repo"])


@app.get("/e/{edge}")                            # client beacon for the share half of the loop; 204, no body
def loop_beacon(edge: str):
    if edge in LOOP_EDGES:
        bump(edge)
    return Response(status_code=204)


@app.get("/stats")                               # private read of the viral-loop funnel counters
def loop_stats(token: str | None = None):
    if STATS_TOKEN and token != STATS_TOKEN:     # public on the hosted demo unless a token is set
        return Response(status_code=404)
    return dict(loop)


@app.get("/health")                              # liveness probe for the Docker healthcheck + uptime cron
def health():
    return {"status": "ok"}


@app.get("/forge")
def forge_city(url: str):
    bump("forge")
    if (hit := forge_mod.peek(url)) is not None:  # memory or disk cache: skip the clone gate entirely
        return hit
    if not forge_gate.acquire(blocking=False):
        return Response(status_code=429)
    try:
        return forge_mod.forge(url)
    except ValueError:
        return Response(status_code=400)
    except Exception:
        return Response(status_code=502)
    finally:
        forge_gate.release()


@app.get("/forge-timelapse")
def forge_timelapse_city(url: str):              # NDJSON: clone-progress lines, then the {data, timeline} bundle
    bump("forge")
    if (hit := forge_mod.peek_tl(url)) is not None:                     # cached: one bundle line, instant
        return StreamingResponse(iter([json.dumps(hit) + "\n"]), media_type="application/x-ndjson")
    try:
        forge_mod.clone_url(url)                                        # validate before taking the gate
    except ValueError:
        return Response(status_code=400)
    if not forge_gate.acquire(blocking=False):
        return Response(status_code=429)
    return StreamingResponse(forge_mod.forge_timelapse_stream(url, forge_gate.release),
                             media_type="application/x-ndjson")


@app.get("/marathon/movie/{mid}")
def marathon_movie(mid: str):                    # in-memory {data, timeline} bundle for one playlist entry
    bundle = marathon["bundles"].get(mid)
    return bundle if bundle is not None else Response(status_code=404)


@app.post("/og")                                 # the browser uploads a captured skyline PNG for a shared link
async def og_upload(key: str, request: Request):
    if not request.headers.get("content-type", "").startswith("image/png"):
        return Response(status_code=400)
    body = await request.body()
    try:
        return {"ok": True, "hash": forge_mod.save_og(key, body)}
    except ValueError:
        return Response(status_code=400)


@app.get("/og-card")                             # generated card for a forge link before its skyline is captured
def og_card(url: str):
    png = og_mod.card_png(url)                    # None when Pillow is absent (CLI installs) → generic card
    if png is None:
        return FileResponse(Path(__file__).parent / "static" / "og-image.png", media_type="image/png")
    return Response(png, media_type="image/png", headers={"Cache-Control": "public, max-age=600"})


@app.get("/og/{name}")                           # serve a cached skyline PNG (name = <16-hex>.png)
def og_image(name: str):
    h = name[:-4] if name.endswith(".png") else name
    if len(h) != 16 or any(c not in "0123456789abcdef" for c in h):   # hash only — no path traversal
        return Response(status_code=404)
    p = forge_mod.OG_DIR / f"{h}.png"
    return FileResponse(p, media_type="image/png") if p.exists() else Response(status_code=404)


@app.get("/events")
async def events(request: Request) -> StreamingResponse:
    queue: asyncio.Queue = asyncio.Queue()
    for event in history:                       # replay so late joiners see state
        queue.put_nowait(event)
    subscribers.add(queue)

    async def stream():
        try:
            yield "retry: 2000\n\n"
            while not shutting_down.is_set() and not await request.is_disconnected():
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
    # static files change on every agentopolis upgrade; force revalidation (304s keep it cheap)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-cache"
    return response


def _og_block(title: str, desc: str, img: str, url: str, player: str | None = None) -> str:
    e = lambda s: s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
    t, d, i, u = e(title), e(desc), e(img), e(url)
    # player card plays the build inline in-feed; falls back to the still image where it isn't honored.
    if player:
        card = (f'<meta name="twitter:card" content="player">\n'
                f'<meta name="twitter:player" content="{e(player)}">\n'
                f'<meta name="twitter:player:width" content="1200">\n'
                f'<meta name="twitter:player:height" content="630">\n')
    else:
        card = '<meta name="twitter:card" content="summary_large_image">\n'
    return (f'<link rel="canonical" href="{u}">\n'
            f'<meta property="og:type" content="website">\n'
            f'<meta property="og:url" content="{u}">\n'
            f'<meta property="og:title" content="{t}">\n'
            f'<meta property="og:description" content="{d}">\n'
            f'<meta property="og:image" content="{i}">\n'
            f'<meta property="og:image:width" content="1200">\n'
            f'<meta property="og:image:height" content="630">\n'
            f'<meta property="og:image:alt" content="{t}">\n'
            + card +
            f'<meta name="twitter:title" content="{t}">\n'
            f'<meta name="twitter:description" content="{d}">\n'
            f'<meta name="twitter:image" content="{i}">')


def _canon_path(forge_url: str) -> str | None:
    # github.com/owner/repo -> /c/owner/repo, the clean canonical a shared link unfurls + reads as
    owner, repo = forge_mod.owner_repo(forge_url)
    return f"/c/{owner}/{repo}" if owner else None


def _forge_url(owner: str, repo: str) -> str:
    return f"https://github.com/{owner}/{repo.removesuffix('.git')}"


@app.get("/c/{owner}/{repo}")                    # clean canonical: /c/owner/repo == ?forge=github.com/owner/repo
def canonical(owner: str, repo: str, request: Request) -> HTMLResponse:
    return _page(request, _forge_url(owner, repo))


@app.get("/player/{owner}/{repo}")               # chromeless autoplaying movie — the player-card iframe + embeds
def player(owner: str, repo: str, request: Request) -> HTMLResponse:
    return _page(request, _forge_url(owner, repo), embed=True)


@app.get("/")
def root(request: Request) -> HTMLResponse:
    return _page(request, request.query_params.get("forge"), embed="embed" in request.query_params)


def _page(request: Request, forge: str | None, embed: bool = False) -> HTMLResponse:
    # one shell, two map engines. ?forge=<github url> opens the city engine on the forge endpoint.
    # Otherwise the showcase opens the nation map; AGENTOPOLIS_DEMO_CITY auto-drills into one city on
    # load (so zoom-out + the tier breadcrumb still reach the nation), and ?nation skips the drill.
    qp = request.query_params
    if forge:
        bump("land")                             # someone opened a shared/forge link — top of the loop
    auto_city = bool(showcase["dir"] and showcase["city"]) and "nation" not in qp
    timeline_src = "timeline.json"
    marathon_json = "null"
    movie = False
    demo_movie = False                       # the curated showcase landing: a meme-mode movie of one city
    if "marathon" in qp and marathon["rows"]:    # playlist of pre-built movies, switched without re-seeding
        rows = marathon["rows"]
        cur = qp.get("m") if qp.get("m") in marathon["bundles"] else rows[0]["id"]
        name, mode, movie = next(r["repo"] for r in rows if r["id"] == cur), "city", True
        src = "/marathon/movie/" + quote(cur, safe="")
        keep = ("id", "repo", "ladder", "transitions", "commits", "score")
        marathon_json = json.dumps({"movies": [{k: r[k] for k in keep} for r in rows], "current": cur})
    elif forge:
        name = forge.rstrip("/").split("/")[-1].removesuffix(".git")   # heading: "<repo> City"
        mode = "city"
        movie = "static" not in qp           # a forged repo plays its history by default; ?static = the quick city
        src = ("/forge-timelapse?url=" if movie else "/forge?url=") + quote(forge, safe="")
    elif auto_city:                          # showcase demo: land on a grow-from-start movie of the pinned city
        # brand the landing "Agentopolis" (title + social card), not the repo it's built from; the repo id
        # still keys the data sources and OG cache (og_key below), so warming + serving stay in sync.
        mode, name, movie, demo_movie = "city", "Agentopolis", True, True
        src = "/city-data.json?repo=" + quote(showcase["city"], safe="")
        timeline_src = "/timeline.json?repo=" + quote(showcase["city"], safe="")
    elif nation["root"]:
        mode, name, src = "nation", Path(nation["root"]).name, "city-data.json"
    else:
        mode, name, src = "city", Path(city["repo"]).resolve().name, "city-data.json"
        movie = "timelapse" in qp            # a local city replays its history only on request
    engine = "nation.js" if mode == "nation" else ("city-timelapse.js" if movie else "city-live.js")

    # per-repo social card: a shared link unfurls with that repo's name + its captured skyline (warmed by share.js)
    base = os.environ.get("AGENTOPOLIS_PUBLIC_URL") or str(request.base_url).rstrip("/")
    if forge:
        og_key = forge
        og_url = base + (_canon_path(forge) or f"/?forge={quote(forge, safe='')}")
    elif auto_city:
        og_key, og_url = showcase["city"], f"{base}/"
    else:
        og_key, og_url = None, f"{base}/"
    if og_key:
        og_title = f"{name} — a codebase as a living isometric city"
        og_desc = (f"Watch {name}'s git history build itself as an isometric city — "
                   "Claude Code agents are pixel workers on the dispatch floor.")
    else:
        og_title = "Agentopolis — Claude Code as a living isometric city"
        og_desc = ("Watch Claude Code build your codebase as a living isometric city — agents are pixel "
                   "workers on a dispatch floor and the skyline grows from your git history.")
    if og_key and forge_mod.og_exists(og_key):           # warmed real skyline capture wins
        og_img = f"{base}/og/{forge_mod.og_hash(og_key)}.png"
    elif forge:                                          # cold forge link: generated card still names the repo
        og_img = f"{base}/og-card?url={quote(forge, safe='')}"
    else:
        og_img = f"{base}/og-image.png"
    # player card (inline-playing build in-feed) only when this deploy has X player-card approval; the
    # reliable still-image card stays the default. embed pages never advertise themselves as a card.
    cp = _canon_path(forge) if forge else None
    player_url = base + cp.replace("/c/", "/player/") if (PLAYER_CARD and cp and not embed) else None
    og_tags = _og_block(og_title, og_desc, og_img, og_url, player_url)

    repo_url = forge or ""           # forge cities link their title back to the source repo; private/local cities don't
    html = (Path(__file__).parent / "static" / "index.html").read_text()
    return HTMLResponse(html.replace("{{MODE}}", mode).replace("{{ENGINE}}", engine)
                        .replace("{{REPO_URL}}", repo_url)
                        .replace("{{HALL_LEVEL}}", mode).replace("{{HALL_NAME}}", name)
                        .replace("{{CITY_SRC}}", src).replace("{{TIMELINE_SRC}}", timeline_src)
                        .replace("{{DEMO}}", "1" if showcase["dir"] else "")
                        .replace("{{DEMO_CITY}}", showcase["city"] if auto_city else "")
                        .replace("{{DEMO_MOVIE}}", "1" if demo_movie else "")
                        .replace("{{EMBED}}", "1" if embed else "")
                        .replace("{{OG_TAGS}}", og_tags)
                        .replace("{{MARATHON}}", marathon_json))


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
