"""Bake a static showcase from a workspace (run locally, never on the server).

Seeds the nation + each city once and writes fixtures the server serves with
zero live git. Private cities are sanitized: real shape + stats, but file
paths are anonymized so nothing private leaks. Near-duplicate repos
(specter-1, specter-1-private, specter-1-wave2 ...) collapse to one city.

    python -m agentopolis.bake [WORKSPACE_ROOT] [OUT_DIR]
"""
import json
import re
import sys
import tempfile
from pathlib import Path

from .nation import discover_repos, load_nation
from .seed import seed
from .zone import load_zone

# Only these ship real file paths; everything else is sanitized (safe default).
PUBLIC = {"PROVE", "PANEL", "veridatum", "bloodtrail", "codeblackwell.github.io",
          "botapest", "code-review-graph", "C.R.A.C.K."}

VARIANT = re.compile(r"-(private|integration|wave\d+|mvp)$")


def canonical(repo: str) -> str:
    return VARIANT.sub("", repo)


def dedup(nat: dict) -> dict:
    """Collapse variant repos to their base city (first one seen wins)."""
    seen: dict[str, str] = {}
    drop = set()
    for c in nat["cities"]:
        key = canonical(c["repo"])
        if key in seen:
            drop.add(c["repo"])
        else:
            seen[key] = c["repo"]
    nat["cities"] = [c for c in nat["cities"] if c["repo"] not in drop]
    for st in nat["states"]:
        st["repos"] = [r for r in st["repos"] if r not in drop]
    nat["states"] = [st for st in nat["states"] if st["repos"]]
    return nat


def anonymize(data: dict) -> dict:
    """Strip a private city to district + shape: real stats, fake file names."""
    for i, b in enumerate(data["buildings"]):
        b["path"] = f"{b['component']}/{i:03d}"
    data["dead"] = [{"path": f"deleted/{i}", "born": d.get("born"), "died": d.get("died")}
                    for i, d in enumerate(data["dead"])]
    # keep the harbor (a ship per docker file) but hide the service / image names it runs
    data["docker"] = [{"kind": d["kind"], "items": [], "path": f"ship-{i}"}
                      for i, d in enumerate(data["docker"])]
    return data


def build_nation(root: str) -> dict:
    # an empty manifest skips the mother-metropolis path, so repos group into family biomes
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        f.write('{"states": []}')
        manifest = f.name
    nat = load_nation(root, manifest)
    Path(manifest).unlink()
    return dedup(nat)


def main() -> None:
    root = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(__file__).parent / "showcase"
    (out / "cities").mkdir(parents=True, exist_ok=True)

    nat = build_nation(root)
    (out / "nation.json").write_text(json.dumps(nat))

    for c in nat["cities"]:
        repo = c["repo"]
        data = seed(str(Path(root) / repo), load_zone(str(Path(root) / repo), None))
        if repo not in PUBLIC:
            data = anonymize(data)
        (out / "cities" / f"{repo}.json").write_text(json.dumps(data))
        print(f"  {'pub ' if repo in PUBLIC else 'priv'} {repo} ({len(data['buildings'])} buildings)")

    print(f"baked {len(nat['cities'])} cities → {out}")


if __name__ == "__main__":
    main()
