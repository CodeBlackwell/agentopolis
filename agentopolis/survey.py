"""Crawl a folder of git repos and score each one's time-lapse 'movie' potential.

A good movie *transforms*: it climbs the formation ladder (village → radial / spine → grid) as it grows,
over enough history to be watchable, with deletions for drama. This ports the renderer's epoch detection
(city-timelapse.js detectEpochs + city-render.js statsOf/chooseFormation) so the reported ladder matches
what the movie actually plays — validated against the live engine."""
import hashlib
import json
import os

from . import forge
from .seed import git, seed
from .timeline import build_timeline
from .zone import load_zone

PIPE = {"back", "mid", "front"}
FORM_CUT = {"districts": 2, "files": 40, "mass": 5, "dominance": 2.5, "spineFiles": 180}


def _resolver(commits):
    alias = {f["from"]: f["p"] for c in commits for f in c["files"] if f["c"] == "R" and f.get("from")}

    def resolve(p):
        seen = set()
        while p in alias and p not in seen:
            seen.add(p)
            p = alias[p]
        return p
    return resolve


def _glob_match(path, g):
    if g.startswith("*"):
        return path.endswith(g[1:])
    if "*" in g:
        return path.startswith(g.split("*")[0])
    return path == g


def _comp_for(path, zone, head):                         # district for a dead path (glob, else sibling, else first real)
    for comp in zone["components"]:
        if any(_glob_match(path, g) for g in comp["globs"]):
            return comp["id"]
    top = path.split("/")[0]
    sib = next((b for b in head if b["path"].split("/")[0] == top), None)
    if sib:
        return sib["component"]
    nonciv = next((c for c in zone["components"] if c["kind"] != "civic"), None)
    return (nonciv or zone["components"][0])["id"]


def _finder(buildings, resolve):
    exact = {b["path"]: i for i, b in enumerate(buildings)}
    cache = {}

    def find(p):
        if p not in cache:
            r = resolve(p)
            idx = exact.get(r)
            if idx is None:
                idx = next((i for i, b in enumerate(buildings)
                            if r == b["path"] or r.startswith(b["path"] + "/")), None)
            cache[p] = idx
        return cache[p]
    return find


def _formation(zone, alive):                             # statsOf + chooseFormation (city-render.js)
    real = [c for c in zone["components"] if c["kind"] not in ("civic", "auto")]
    wsum, wt = {}, {}
    for b in alive:
        wsum[b["component"]] = wsum.get(b["component"], 0) + b["centrality"] * b["commits"]
        wt[b["component"]] = wt.get(b["component"], 0) + b["commits"]
    coup = [(wsum.get(c["id"], 0) / wt[c["id"]]) if wt.get(c["id"]) else 0 for c in real]
    mass = sum(coup)
    dominance = (max(coup) / mass * len(real)) if mass and coup else 0
    tier = {}
    for c in real:
        if c["layer"] in PIPE:
            tier[c["layer"]] = tier.get(c["layer"], 0) + 1
    t = list(tier.values())
    balanced = len(t) >= 2 and min(t) / max(t) >= 0.4
    nbuild = len(alive)
    if len(real) <= FORM_CUT["districts"] or nbuild <= FORM_CUT["files"]:
        return "village"
    if mass >= FORM_CUT["mass"] and dominance >= FORM_CUT["dominance"]:
        return "radial"
    if balanced and nbuild <= FORM_CUT["spineFiles"]:
        return "spine"
    return "grid"


def evaluate(repo: str) -> dict | None:
    """Movie metrics for one repo (ladder matches the renderer), or None if it has no mappable history."""
    zone = load_zone(repo, None)
    data = seed(repo, zone, walk_history=False)
    commits = build_timeline(repo)["commits"]
    m = _metrics(zone, data["buildings"], commits)
    return _label(m, repo) if m else None


def build_movie(repo: str):
    """Return (metrics, bundle) for marathon: the same metrics as evaluate() plus the {data, timeline}
    bundle the time-lapse engine plays — computed in one pass so nothing is seeded twice."""
    zone = load_zone(repo, None)
    data = seed(repo, zone, walk_history=False)
    tl = build_timeline(repo)
    m = _metrics(zone, data["buildings"], tl["commits"])
    if not m:
        return None, None
    return _label(m, repo), {"data": data, "timeline": tl}


def _label(m: dict, repo: str) -> dict:
    return {"repo": os.path.basename(repo.rstrip("/")), "path": os.path.abspath(repo), **m}


def movie_cached(repo: str):
    """build_movie() with a disk cache keyed by repo path + HEAD — re-runs are instant until the repo
    gains new commits (a new HEAD → a new key → a rebuild). Returns (metrics, bundle)."""
    head = git(repo, "rev-parse", "HEAD").strip()
    key = hashlib.sha256((os.path.abspath(repo) + "@" + head).encode()).hexdigest()[:16]
    path = forge.CACHE_DIR / f"movie-{key}.json"
    if forge.disk_cache and head and path.exists():
        obj = json.loads(path.read_text())
        return obj["metrics"], obj["bundle"]
    metrics, bundle = build_movie(repo)
    if metrics and forge.disk_cache and head:
        forge.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({"metrics": metrics, "bundle": bundle}))
    return metrics, bundle


def _metrics(zone: dict, head: list, commits: list) -> dict | None:
    """The ladder/score computation shared by evaluate() and build_movie(); None if no history."""
    n = len(commits)
    if not head or not n:
        return None
    resolve = _resolver(commits)

    # reconstructDead: paths that lived in history but are gone at HEAD become ruins (born i, die at delete)
    head_paths = {b["path"] for b in head}

    def is_head(r):
        return r in head_paths or any(r == b["path"] or r.startswith(b["path"] + "/") for b in head)
    life = {}
    for i, c in enumerate(commits):
        for f in c["files"]:
            r = resolve(f["p"])
            if is_head(r):
                continue
            L = life.setdefault(r, {"death": None, "touches": 0})
            L["touches"] += 1
            if f["c"] == "D":
                L["death"] = i
    dead = [{"path": p, "component": _comp_for(p, zone, head), "death": L["death"], "_t": L["touches"]}
            for p, L in life.items() if L["death"] is not None]
    dead.sort(key=lambda b: b["_t"], reverse=True)
    dead = dead[:80]                                      # ruin budget (matches city-timelapse.js)
    buildings = head + dead

    # index(): per-building touch indices → commits, centrality (rename-folded), birth
    find = _finder(buildings, resolve)
    counts = [0] * len(buildings)
    coupled = [set() for _ in buildings]
    birth = {}
    mega = max(15, round(len(buildings) / 50))
    for i, c in enumerate(commits):
        hit = []
        for f in c["files"]:
            idx = find(f["p"])
            if idx is not None and idx not in hit:
                hit.append(idx)
                counts[idx] += 1
                birth.setdefault(idx, i)
        if len(hit) <= mega:
            comp_ids = {buildings[j]["component"] for j in hit}
            for j in hit:
                coupled[j] |= comp_ids - {buildings[j]["component"]}
    for j, b in enumerate(buildings):
        b["commits"], b["centrality"] = counts[j], len(coupled[j])
    death_at = {j: buildings[j].get("death") for j in range(len(buildings))}

    # detectEpochs(): formation per commit over the alive set, with dwell hysteresis to seal boundaries
    def alive_at(i):
        return [buildings[j] for j in birth
                if birth[j] <= i and not (death_at.get(j) is not None and i >= death_at[j])]
    dwell = max(2, round(n * 0.01))
    epochs = []
    cur = pend = pend_since = None
    for i in range(n):
        alive = alive_at(i)
        if not alive:
            continue
        form = _formation(zone, alive)
        if cur is None:
            cur = form
            continue
        if form == cur:
            pend = None
            continue
        if pend != form:
            pend, pend_since = form, i
        if i - pend_since + 1 >= dwell:
            epochs.append(cur)
            cur, pend = form, None
    if cur is not None:
        epochs.append(cur)

    ladder = [f for i, f in enumerate(epochs) if i == 0 or f != epochs[i - 1]]   # collapse repeats
    transitions = max(0, len(ladder) - 1)
    deaths = len(dead)
    peak = len(birth)
    score = (len(set(ladder)) * 12                       # variety of shapes it wears (the main draw)
             + min(transitions, 5) * 8                   # re-formations, capped so noisy flappers don't dominate
             + min(n, 3000) / 40                         # length: more history to watch (capped)
             + min(deaths, 150) / 5)                     # ruins add drama
    return {"commits": n, "buildings": len(head), "peak": peak, "deaths": deaths,
            "transitions": transitions, "ladder": " → ".join(ladder), "score": round(score, 1)}


def find_repos(root: str) -> list[str]:
    """Git repos directly under `root`, plus one level of nested repos (mother repos like methodproof)."""
    root = os.path.abspath(root)
    out = []
    if os.path.isdir(os.path.join(root, ".git")):
        out.append(root)
    for entry in sorted(os.listdir(root)):
        path = os.path.join(root, entry)
        if not os.path.isdir(path) or os.path.islink(path):
            continue
        if os.path.isdir(os.path.join(path, ".git")):
            out.append(path)
            for sub in sorted(os.listdir(path)):         # nested repos of a mother repo
                subp = os.path.join(path, sub)
                if os.path.isdir(os.path.join(subp, ".git")) and not os.path.islink(subp):
                    out.append(subp)
    return out


def crawl(root: str) -> list[dict]:
    rows = []
    for repo in find_repos(root):
        try:
            row = evaluate(repo)
            if row:
                rows.append(row)
        except Exception as exc:                         # a repo we can't read shouldn't sink the crawl
            print(f"  skipped {os.path.basename(repo)} — {exc}")
    rows.sort(key=lambda r: r["score"], reverse=True)
    return rows
