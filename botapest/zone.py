"""Zoning: use the repo's .botapest.json if present, else derive one.

Auto-zoning maps each top-level directory to a component, guesses its
layer from the name, and lumps root files into a Commons district.
"""
import json
from collections import Counter
from pathlib import Path

from .seed import tracked

LAYERS = ["back", "mid", "front", "under"]
FRONT = ("frontend", "front", "ui", "web", "client", "www", "app", "site", "landing", "docs", "doc", "examples")
BACK = ("db", "database", "storage", "data", "store", "migrations", "models")
UNDER = ("tests", "test", "testing", "github", "scripts", "infra", "ci", "tools", "build",
         "deploy", "docker", "tmp")
PALETTE = ["#5b8dd9", "#b5651d", "#16a085", "#d4a953", "#8e5d9f", "#2980b9",
           "#c0395b", "#4a6b5c", "#c9b78a", "#5c6b73"]
KINDS = [(("tests", "test", "testing"), "tests"),
         (UNDER, "infra"),                       # before docs: "docker" must not match "doc"
         (("docs", "doc", "examples"), "docs"),
         (("api",), "api"),
         (BACK, "storage"),
         (FRONT, "frontend")]


def guess_kind(name: str) -> str:
    n = name.lower().lstrip(".")
    for prefixes, kind in KINDS:
        if any(n.startswith(k) for k in prefixes):
            return kind
    return "service"


def guess_layer(name: str) -> str:
    n = name.lower().lstrip(".")
    if any(n.startswith(k) for k in UNDER):
        return "under"
    if any(n.startswith(k) for k in FRONT):
        return "front"
    if any(n.startswith(k) for k in BACK):
        return "back"
    return "mid"


def auto_zone(repo: str, exclude: set | None = None) -> dict:
    files = tracked(repo, exclude)
    counts = Counter(f.split("/")[0] for f in files if "/" in f)
    components = []
    for i, (d, n) in enumerate(counts.most_common()):
        if n < 3:
            continue
        comp = {"id": d, "name": d, "layer": guess_layer(d), "kind": guess_kind(d),
                "color": PALETTE[i % len(PALETTE)], "globs": [f"{d}/*"]}
        if n > 150:
            comp["group"] = 3                       # huge dirs: one building per subdir
        components.append(comp)
    components.append({"id": "civic", "name": "Civic Plaza", "layer": "front",
                       "kind": "civic", "color": "#d4a953", "globs": []})
    components.append({"id": "commons", "name": "Commons", "layer": "under",
                       "kind": "auto", "color": "#3a3f4a", "globs": ["*"]})
    return {"repo": Path(repo).resolve().name, "layers": LAYERS,
            "components": components, "clouds": []}


def load_zone(repo: str, zone_path: str | None, exclude: set | None = None) -> dict:
    path = Path(zone_path) if zone_path else Path(repo) / ".botapest.json"
    if path.exists():
        return json.loads(path.read_text())
    return auto_zone(repo, exclude)
