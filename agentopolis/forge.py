"""Forge a city from a public GitHub URL: shallow-clone, seed, cache, clean up."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.parse import urlparse

from .seed import seed
from .timeline import build_timeline
from .zone import load_zone

forged: dict[str, dict] = {}        # normalized url -> city data, cached for process lifetime
forged_tl: dict[str, dict] = {}     # normalized url -> {data, timeline}, for the history time-lapse

# disk cache so a shared demo link survives restarts: first visitor pays, the rest are instant.
# disk_cache=False keeps forged bundles in memory only (the `agentopolis movie` CLI flips it off).
CACHE_DIR = Path(os.environ.get("AGENTOPOLIS_FORGE_CACHE",
                                Path(tempfile.gettempdir()) / "agentopolis-forge"))
disk_cache = True


def _disk(url: str, kind: str) -> Path:
    return CACHE_DIR / f"{kind}-{og_hash(url)}.json"


# ---- shared-link OG images: the browser captures the rendered city and uploads it; we cache the PNG
# keyed by repo identity (forge url, or "SPICE" for the demo) so the shared link unfurls with that skyline.
OG_DIR = Path(os.environ.get("AGENTOPOLIS_OG_CACHE", Path(tempfile.gettempdir()) / "agentopolis-og"))
OG_MAX_BYTES = 2 * 1024 * 1024
OG_MAX_FILES = 200
_PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def og_hash(key: str) -> str:
    return hashlib.sha256(key.encode()).hexdigest()[:16]


def og_path(key: str) -> Path:
    return OG_DIR / f"{og_hash(key)}.png"


def og_exists(key: str) -> bool:
    return og_path(key).exists()


def save_og(key: str, data: bytes) -> str:
    """Validate + cache a captured PNG; prune oldest over the cap. Returns the hash; raises ValueError on bad input."""
    if len(data) > OG_MAX_BYTES or not data.startswith(_PNG_MAGIC):
        raise ValueError("not a small png")
    OG_DIR.mkdir(parents=True, exist_ok=True)
    pngs = sorted(OG_DIR.glob("*.png"), key=lambda p: p.stat().st_mtime)
    for old in pngs[: max(0, len(pngs) - OG_MAX_FILES + 1)]:   # keep room for the one we're about to write
        old.unlink(missing_ok=True)
    p = og_path(key)
    p.write_bytes(data)
    return p.stem


def _load(url: str, kind: str, mem: dict) -> dict | None:
    """Cache lookup: memory, then disk (warming memory). Returns the bundle or None."""
    if url in mem:
        return mem[url]
    path = _disk(url, kind)
    if disk_cache and path.exists():
        mem[url] = json.loads(path.read_text())
        return mem[url]
    return None


def _save(url: str, kind: str, mem: dict, bundle: dict) -> dict:
    mem[url] = bundle
    if disk_cache:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        _disk(url, kind).write_text(json.dumps(bundle))
    return bundle


def peek(url: str) -> dict | None:
    return _load(url, "city", forged)


def peek_tl(url: str) -> dict | None:
    return _load(url, "tl", forged_tl)


def clone_url(url: str) -> str:
    """Validate a public github.com/owner/repo url; return the https clone url or raise."""
    u = urlparse(url.strip())
    parts = [p for p in u.path.split("/") if p]
    if u.scheme not in ("http", "https") or u.netloc != "github.com" or len(parts) != 2:
        raise ValueError("not a github.com/owner/repo url")
    owner, repo = parts[0], parts[1].removesuffix(".git")
    if ".." in (owner + repo) or not owner or not repo:
        raise ValueError("bad owner/repo")
    return f"https://github.com/{owner}/{repo}.git"


def forge(url: str) -> dict:
    hit = _load(url, "city", forged)
    if hit is not None:
        return hit
    src = clone_url(url)
    tmp = tempfile.mkdtemp(prefix="agentopolis-")
    try:
        subprocess.run(["git", "clone", "--depth", "1", "--single-branch",
                        "--filter=blob:none", src, tmp],
                       capture_output=True, timeout=30, check=True)
        return _save(url, "city", forged, seed(tmp, load_zone(tmp, None)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


_PROGRESS = re.compile(r"(Receiving objects|Resolving deltas):\s+(\d+)%")


def _clone_progress(src: str, tmp: str, timeout: int = 120):
    """Full clone (all blobs, no --depth/--filter) so build_timeline's -M rename detection stays local.
    A full clone is git's own parallel packfile download — measured ~6x faster end-to-end than a
    blob:none clone whose history walk then refetches blobs one batch at a time (11s vs 64s on fastapi).
    Yields clone percent parsed from git --progress (\\r-separated on stderr): Receiving is the network
    download (the real wait, 0–0.85), Resolving is the CPU tail (0.85–1.0). Raises on failure/timeout."""
    proc = subprocess.Popen(["git", "clone", "--progress", "--single-branch", src, tmp],
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    start, buf, last = time.time(), "", -1.0
    while chunk := proc.stderr.read(256):
        if time.time() - start > timeout:
            proc.kill()
            raise RuntimeError("clone timed out")
        buf += chunk
        parts = re.split(r"[\r\n]", buf)
        buf = parts.pop()
        for part in parts:
            if m := _PROGRESS.search(part):
                pct = int(m.group(2)) / 100
                frac = round(pct * 0.85 if m.group(1).startswith("Receiving") else 0.85 + pct * 0.15, 3)
                if frac != last:
                    last = frac
                    yield json.dumps({"progress": frac, "phase": "clone"}) + "\n"
    proc.wait()
    if proc.returncode:
        raise RuntimeError("clone failed")


def forge_timelapse_stream(url: str, release):
    """Streaming forge: NDJSON clone-progress lines, then the final {data, timeline} bundle line.
    `release` frees the concurrency gate the endpoint acquired, once the whole stream is done."""
    try:
        src = clone_url(url)
        tmp = tempfile.mkdtemp(prefix="agentopolis-tl-")
        try:
            yield from _clone_progress(src, tmp)
            yield json.dumps({"progress": 0.92, "phase": "seed"}) + "\n"
            # walk_history=False: the movie derives commits/centrality/dead from the timeline below,
            # so the one git-history walk is build_timeline's — not four.
            bundle = {"data": seed(tmp, load_zone(tmp, None), walk_history=False),
                      "timeline": build_timeline(tmp)}
            _save(url, "tl", forged_tl, bundle)
            yield json.dumps(bundle) + "\n"
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    except Exception:
        yield json.dumps({"error": "forge failed"}) + "\n"
    finally:
        release()
