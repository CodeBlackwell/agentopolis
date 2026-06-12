"""Build a city snapshot from a git repo + zoning manifest.

Per building: loc (mass), commits + age (attention), centrality (how many
other components it has co-committed with). A component may set "group": N
to aggregate files into one building per N-segment path prefix.
"""
import subprocess
import time
from collections import Counter
from fnmatch import fnmatch
from pathlib import Path


def git(repo: str, *args: str) -> str:
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True).stdout


def component_of(path: str, components: list) -> str | None:
    for c in components:
        if any(fnmatch(path, g) for g in c["globs"]):
            return c["id"]
    return None


def count_lines(path: Path) -> int:
    try:
        return sum(1 for _ in open(path, errors="ignore"))
    except OSError:
        return 0


def seed(repo: str, zone: dict) -> dict:
    comp = {f: component_of(f, zone["components"]) for f in git(repo, "ls-files").splitlines()}
    files = [f for f, c in comp.items() if c]

    commits = dict.fromkeys(files, 0)
    last = dict.fromkeys(files, 0)
    cocomp = {f: set() for f in files}
    timestamp = 0
    touched: list[str] = []
    for line in git(repo, "log", "--name-only", "--pretty=%ct").splitlines() + [""]:
        if line.isdigit() or not line:                  # commit boundary: flush previous
            comps = {comp[f] for f in touched}
            for f in touched:
                commits[f] += 1
                last[f] = max(last[f], timestamp)
                if len(touched) <= 15:                  # mega-commits aren't coupling signal
                    cocomp[f] |= comps - {comp[f]}
            touched = []
            if line.isdigit():
                timestamp = int(line)
        elif line in commits:
            touched.append(line)

    group = {c["id"]: c.get("group") for c in zone["components"]}
    buildings: dict[str, dict] = {}
    exts: dict[str, Counter] = {}
    now = time.time()
    for f in sorted(files):
        depth = group[comp[f]]
        key = "/".join(f.split("/")[:depth]) if depth else f
        b = buildings.setdefault(key, {"path": key, "component": comp[f], "loc": 0,
                                       "commits": 0, "centrality": 0, "age_days": 9999, "files": 0})
        b["loc"] += count_lines(Path(repo, f))
        b["commits"] += commits[f]
        b["centrality"] = max(b["centrality"], len(cocomp[f]))
        if last[f]:
            b["age_days"] = min(b["age_days"], round((now - last[f]) / 86400))
        b["files"] += 1
        exts.setdefault(key, Counter())[Path(f).suffix.lstrip(".").lower()] += 1
    for key, b in buildings.items():
        b["ext"] = exts[key].most_common(1)[0][0]
    return {"zone": zone, "buildings": list(buildings.values())}
