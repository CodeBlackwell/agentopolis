"""Forge a city from a public GitHub URL: shallow-clone, seed, cache, clean up."""
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

from .seed import git, seed
from .timeline import build_timeline
from .zone import load_zone

forged: dict[str, dict] = {}        # normalized url -> city data, cached for process lifetime
forged_tl: dict[str, dict] = {}     # normalized url -> {data, timeline}, for the history time-lapse
MAX_FILES = 5000

# disk cache so a shared demo link survives restarts: first visitor pays, the rest are instant
CACHE_DIR = Path(os.environ.get("AGENTOPOLIS_FORGE_CACHE",
                                Path(tempfile.gettempdir()) / "agentopolis-forge"))


def _disk(url: str, kind: str) -> Path:
    return CACHE_DIR / f"{kind}-{hashlib.sha256(url.encode()).hexdigest()[:16]}.json"


def _load(url: str, kind: str, mem: dict) -> dict | None:
    """Cache lookup: memory, then disk (warming memory). Returns the bundle or None."""
    if url in mem:
        return mem[url]
    path = _disk(url, kind)
    if path.exists():
        mem[url] = json.loads(path.read_text())
        return mem[url]
    return None


def _save(url: str, kind: str, mem: dict, bundle: dict) -> dict:
    mem[url] = bundle
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
        if len(git(tmp, "ls-files").splitlines()) > MAX_FILES:
            raise ValueError("repo too large")
        return _save(url, "city", forged, seed(tmp, load_zone(tmp, None)))
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def forge_timelapse(url: str) -> dict:
    """Like forge() but keeps full history (no --depth 1) so the time-lapse can replay it.
    blob:none still skips file-content history; the HEAD checkout fetches the blobs seed() reads."""
    hit = _load(url, "tl", forged_tl)
    if hit is not None:
        return hit
    src = clone_url(url)
    tmp = tempfile.mkdtemp(prefix="agentopolis-tl-")
    try:
        subprocess.run(["git", "clone", "--single-branch", "--filter=blob:none", src, tmp],
                       capture_output=True, timeout=120, check=True)
        if len(git(tmp, "ls-files").splitlines()) > MAX_FILES:
            raise ValueError("repo too large")
        bundle = {"data": seed(tmp, load_zone(tmp, None)), "timeline": build_timeline(tmp)}
        return _save(url, "tl", forged_tl, bundle)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
