"""Nation view: many repos as one map, grouped into states by architecture.

discover_repos() finds git repos one level under a root. summarize() reads cheap git stats per repo.
load_nation() groups the repos into states by the *formation* each one grows into (radial / spine /
grid / constellation …) — the same shape its city wears — so the map teaches architecture, not just
language. Formation needs one seed per repo, cached by repo+HEAD (survey.head_formation), so the cost
is paid once. An optional .agentopolis-nation.json can pre-name/override states; a bare mother repo is
still a single metropolis.
"""
import json
import time
from collections import Counter
from pathlib import Path

from .seed import git, tracked

PALETTE = ["#16a085", "#5b8dd9", "#c0395b", "#d4a953", "#8e5d9f",
           "#b5651d", "#2980b9", "#4a6b5c", "#c9b78a", "#5c6b73"]

# province biome by the shape a city grows into (chooseFormation) — the nation groups by architecture,
# which is what Agentopolis teaches. Names/colors are defaults; a manifest can rename per state id.
FORMATION_NAMES = {
    "radial":        "Hub Reach",
    "spine":         "The Layered Mile",
    "grid":          "The Latticeworks",
    "constellation": "Scattered Isles",
    "acropolis":     "Acropolis Heights",
    "village":       "The Frontier",
}
FORMATION_COLOR = {
    "radial":        "#c0395b",
    "spine":         "#5b8dd9",
    "grid":          "#16a085",
    "constellation": "#8e5d9f",
    "acropolis":     "#d4a953",
    "village":       "#4a6b5c",
}

# extension → archetype family (assets ignored). Code families characterize a repo; auxiliary families
# (docs/infra/data) only win when they outweigh all code — else every doc-heavy code repo misreads as docs.
FAMILY_EXT = {
    "backend": {"py", "go", "rb", "rs", "java", "php", "cs", "kt", "scala", "ex", "clj"},
    "frontend": {"js", "ts", "jsx", "tsx", "vue", "svelte"},
    "docs": {"md", "rst", "txt", "adoc"},
    "infra": {"tf", "yml", "yaml", "sh", "toml", "dockerfile"},
    "data": {"sql", "csv", "parquet", "ipynb"},
}
CODE = ("backend", "frontend")
AUX = ("docs", "infra", "data")
FULLSTACK_MARGIN = 0.6        # lesser code family ≥ 60% of the greater → a full-stack repo, not a coin-flip


def classify(exts: Counter) -> str:
    """A repo's archetype family. An auxiliary family (docs/infra/data) wins only when it outweighs all
    code combined (a true notes/IaC repo); among code, a co-dominant second family makes it 'fullstack'."""
    fc = {fam: sum(exts[e] for e in grp) for fam, grp in FAMILY_EXT.items()}
    code_total = fc["backend"] + fc["frontend"]
    aux = max(AUX, key=lambda f: fc[f])
    if fc[aux] and fc[aux] > code_total:
        return aux
    if not code_total:
        return "neutral"
    lead, other = max(CODE, key=lambda f: fc[f]), min(CODE, key=lambda f: fc[f])
    return "fullstack" if fc[other] / fc[lead] >= FULLSTACK_MARGIN else lead


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
            "family": classify(exts),
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

    from .survey import head_formation                # local import: keeps the cheap summarize path import-light
    by_form: dict[str, list[str]] = {}
    for r in repos:
        if r in state_of:
            continue
        try:
            form = head_formation(str(Path(root) / r)) or "village"
        except Exception:                             # a repo we can't seed shouldn't sink the whole nation
            form = "village"
        summaries[r]["formation"] = form
        by_form.setdefault(form, []).append(r)
    for form, members in sorted(by_form.items()):
        sid = f"auto_{form}"
        for r in members:
            state_of[r] = sid
        states.append({"id": sid, "name": FORMATION_NAMES.get(form, form.title()),
                       "color": FORMATION_COLOR.get(form, PALETTE[0]), "repos": members})

    cities = [{"repo": r, "state": state_of[r], **summaries[r]} for r in repos]
    return {"root": Path(root).resolve().name, "states": states, "cities": cities}
