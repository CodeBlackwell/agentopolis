"""Walk a repo's git history into an ordered commit stream for the time-lapse.

Each commit: timestamp, author, subject, and the files it added/modified/
deleted/renamed. The browser replays this over the HEAD city layout, revealing
buildings in birth order. Cheap: one `git log` pass, no per-commit checkout.
"""
from .seed import git


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
    return {"head": git(repo, "rev-parse", "HEAD").strip(), "commits": commits}
