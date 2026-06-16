"""Walk a repo's git history into an ordered commit stream for the time-lapse.

Each commit: timestamp, author, subject, and the files it added/modified/
deleted/renamed. The browser replays this over the HEAD city layout, revealing
buildings in birth order. Cheap: one `git log` pass, no per-commit checkout.
"""
import math

from .seed import git


def decimate(commits: list[dict]) -> list[dict]:
    """Thin dense modify-only runs by a factor that grows with the order of magnitude of history size
    (k = floor(log10(commits))), so a huge repo stays light WITHOUT a fixed cap — small repos keep
    everything (k=1). Structural commits (add/delete/rename) and the first/last are always kept, so every
    building's birth/death and the HEAD state survive; only redundant floor-growth churn is dropped."""
    n = len(commits)
    k = max(1, math.floor(math.log10(n))) if n else 1   # 0–99 commits → 1, 100s → 2, 1000s → 3, …
    if k == 1:
        return commits
    out, seen_modify = [], 0
    for i, c in enumerate(commits):
        structural = any(f["c"] in ("A", "D", "R") for f in c["files"])
        if structural or i == 0 or i == n - 1:
            out.append(c)
        else:                                           # pure modify: keep every k-th
            if seen_modify % k == 0:
                out.append(c)
            seen_modify += 1
    return out


def build_timeline(repo: str) -> dict:
    log = git(repo, "log", "--reverse", "--first-parent", "-M",
              "--name-status", "--pretty=format:%x00%ct%x1f%an%x1f%s")
    commits: list[dict] = []
    cur: dict | None = None
    for line in log.split("\n"):
        if line.startswith("\x00"):                     # commit header (NUL-prefixed, never a path)
            ts, author, subject = (line[1:].split("\x1f") + ["", "", ""])[:3]
            cur = {"ts": int(ts) if ts.isdigit() else 0, "author": author,
                   "subject": subject, "files": []}
            commits.append(cur)
        elif line and cur:                              # "A\tpath" / "M\tpath" / "R100\told\tnew"
            parts = line.split("\t")
            code = parts[0][0]
            if code in ("R", "C") and len(parts) >= 3:
                cur["files"].append({"p": parts[2], "c": "R", "from": parts[1]})
            elif len(parts) >= 2:
                cur["files"].append({"p": parts[1], "c": code})
    return {"head": git(repo, "rev-parse", "HEAD").strip(), "commits": decimate(commits)}
