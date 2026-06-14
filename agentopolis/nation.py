"""Nation view: many repos as one map, grouped into states.

discover_repos() finds git repos one level under a root. summarize() reads
cheap git stats per repo (no file-content reads, so it scales to dozens).
load_nation() folds in an optional .agentopolis-nation.json that names the
states (repo clusters).
"""
import json
import time
from collections import Counter
from pathlib import Path

from .seed import git, tracked

PALETTE = ["#16a085", "#5b8dd9", "#c0395b", "#d4a953", "#8e5d9f",
           "#b5651d", "#2980b9", "#4a6b5c", "#c9b78a", "#5c6b73"]

FAMILY_NAMES = {
    "backend":  "Logic Highlands",
    "frontend": "Interface Coast",
    "infra":    "Iron Province",
    "data":     "The Mines",
    "docs":     "The Scriptorium",
    "neutral":  "The Hinterlands",
}
FAMILY_COLOR = {
    "backend":  "#2980b9",
    "frontend": "#27ae60",
    "infra":    "#7f8c8d",
    "data":     "#d4a953",
    "docs":     "#c9b78a",
    "neutral":  "#7d6b8a",
}

# extension → archetype family; picks the family with the most tracked files (assets ignored)
FAMILY_EXT = {
    "backend": {"py", "go", "rb", "rs", "java", "php", "cs", "kt", "scala", "ex", "clj"},
    "frontend": {"js", "ts", "jsx", "tsx", "vue", "svelte"},
    "docs": {"md", "rst", "txt", "adoc"},
    "infra": {"tf", "yml", "yaml", "sh", "toml", "dockerfile"},
    "data": {"sql", "csv", "parquet", "ipynb"},
}


def family_of(exts: Counter) -> str:
    best, score = "neutral", 0
    for fam, group in FAMILY_EXT.items():
        n = sum(exts[e] for e in group)
        if n > score:
            best, score = fam, n
    return best


def discover_repos(root: str) -> list[str]:
    out = []
    for entry in sorted(Path(root).iterdir()):
        if entry.is_symlink() or not entry.is_dir():
            continue
        if (entry / ".git").exists():
            out.append(entry.name)
    return out


def is_mother(repo: str) -> bool:
    """A git repo that nests ≥2 git repos of its own — a metropolis, not a city."""
    return (Path(repo) / ".git").exists() and len(discover_repos(repo)) >= 2


def summarize(repo: str, exclude: set | None = None) -> dict:
    files = tracked(repo, exclude)
    last = git(repo, "log", "-1", "--format=%ct").strip()
    commits = git(repo, "rev-list", "--count", "HEAD").strip()
    exts = Counter(Path(f).suffix.lstrip(".").lower() for f in files if "." in f)
    age = round((time.time() - int(last)) / 86400) if last else 9999
    low = [f.lower() for f in files]
    return {"files": len(files), "commits": int(commits or 0), "age_days": age,
            "lang": (exts.most_common(1) or [("", 0)])[0][0],
            "family": family_of(exts),
            "hasInfra": any(f.endswith(".tf") or f.rsplit("/", 1)[-1].startswith("dockerfile")
                            or ".github/workflows/" in f for f in low),
            "hasFrontend": any(f.endswith((".html", ".css", ".jsx", ".tsx", ".scss", ".vue")) for f in low),
            "hasDocs": any(f.endswith(".md") for f in low)}


CAPITAL = "."                                  # capital city id == the mother repo's own path


def mother_nation(root: str) -> dict:
    """A mother repo as a one-state metropolis: a capital (its own glue) + each subrepo a city."""
    subs = discover_repos(root)
    name = Path(root).resolve().name
    cities = [{"repo": CAPITAL, "name": "⊙ capital", "state": name, **summarize(root, set(subs))}]
    cities += [{"repo": r, "state": name, **summarize(str(Path(root) / r))} for r in subs]
    states = [{"id": name, "name": name, "color": PALETTE[0], "repos": [CAPITAL, *subs]}]
    return {"root": name, "states": states, "cities": cities}


def load_nation(root: str, manifest_path: str | None) -> dict:
    path = Path(manifest_path) if manifest_path else Path(root) / ".agentopolis-nation.json"
    if not path.exists() and is_mother(root):   # an explicit manifest wins; a bare mother is a metropolis
        return mother_nation(root)
    repos = discover_repos(root)
    man = json.loads(path.read_text()) if path.exists() else {}

    summaries = {r: summarize(str(Path(root) / r)) for r in repos}

    state_of, states = {}, []
    for i, st in enumerate(man.get("states", [])):
        members = [r for r in st["repos"] if r in repos]
        if not members:
            continue
        for r in members:
            state_of[r] = st["id"]
        states.append({"id": st["id"], "name": st.get("name", st["id"]),
                       "color": st.get("color", PALETTE[i % len(PALETTE)]), "repos": members})

    by_family: dict[str, list[str]] = {}
    for r in repos:
        if r not in state_of:
            by_family.setdefault(summaries[r]["family"], []).append(r)
    for fam, members in sorted(by_family.items()):
        sid = f"auto_{fam}"
        for r in members:
            state_of[r] = sid
        states.append({"id": sid, "name": FAMILY_NAMES[fam],
                       "color": FAMILY_COLOR[fam], "repos": members})

    cities = [{"repo": r, "state": state_of[r], **summaries[r]} for r in repos]
    return {"root": Path(root).resolve().name, "states": states, "cities": cities}
