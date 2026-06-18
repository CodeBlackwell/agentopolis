"""Fast regression proof for the core repo→city pipeline.

No browser, no network. Pure functions get hand-built inputs; the end-to-end
smoke seeds THIS repo (a real git repo, small → sub-second). These lock the
parsers, the formation ladder, and rename-folding against silent corruption.
Run: `uv run --extra test pytest tests/test_lib.py`.
"""
import subprocess
from pathlib import Path

from agentopolis.seed import (compose_services, component_of, detect_clouds,
                              dockerfile_images, parse_deps, seed)
from agentopolis.survey import _formation
from agentopolis.timeline import build_timeline, decimate
from agentopolis.zone import auto_zone, guess_kind, guess_layer

REPO = str(Path(__file__).resolve().parent.parent)


# ---- formation ladder: the algorithm that decides every city's shape ----------

def _zone(*layers):
    return {"components": [{"id": f"c{i}", "layer": layer, "kind": "service"}
                           for i, layer in enumerate(layers)]}


def _alive(comps, centrality=1, commits=1):
    return [{"component": c, "centrality": centrality, "commits": commits} for c in comps]


def test_small_city_is_a_village():
    assert _formation(_zone("mid", "mid", "mid"), _alive(["c0"] * 5)) == "village"


def test_one_or_two_districts_above_the_floor_is_an_acropolis():
    assert _formation(_zone("mid", "mid"), _alive(["c0"] * 41)) == "acropolis"


def test_one_dominant_district_is_radial():
    # all coupling mass in c0, two empty peers → dominance clears the cut
    assert _formation(_zone("mid", "mid", "mid"), _alive(["c0"] * 41, centrality=10)) == "radial"


def test_even_low_coupling_peers_form_a_grid():
    comps = [f"c{i % 3}" for i in range(42)]                 # spread across 3 districts
    assert _formation(_zone("mid", "mid", "mid"), _alive(comps, centrality=2)) == "grid"


# ---- timeline: decimation + rename folding (recently reworked, -M) ------------

def test_decimate_keeps_everything_for_small_history():
    commits = [{"files": [{"c": "M"}]} for _ in range(50)]
    assert decimate(commits) is commits                      # k=1 → untouched


def test_decimate_thins_churn_but_keeps_structure_and_ends():
    commits = [{"files": [{"c": "M"}], "id": i} for i in range(150)]
    commits[50]["files"] = [{"c": "A"}]                      # a structural commit mid-run
    out = decimate(commits)
    ids = {c["id"] for c in out}
    assert len(out) < 150                                    # churn was thinned
    assert {0, 50, 149} <= ids                               # first, structural, last survive


def test_timeline_folds_a_rename_onto_one_path(tmp_path):
    r = tmp_path / "r"
    r.mkdir()
    def run(*a):
        return subprocess.run(["git", "-C", str(r), *a], check=True, capture_output=True)
    run("init", "-q")
    run("config", "user.email", "t@t")
    run("config", "user.name", "t")
    (r / "old.py").write_text("a\nb\nc\nd\ne\n")
    run("add", "-A")
    run("commit", "-q", "-m", "add")
    (r / "new.py").write_text("a\nb\nc\nd\ne\n")
    (r / "old.py").unlink()
    run("add", "-A")
    run("commit", "-q", "-m", "rename")
    renames = [f for c in build_timeline(str(r))["commits"] for f in c["files"] if f["c"] == "R"]
    assert renames == [{"p": "new.py", "c": "R", "from": "old.py"}]


# ---- manifest parsers: no yaml dep, multi-stage Dockerfiles, deps -------------

def test_compose_lists_only_top_level_services(tmp_path):
    (tmp_path / "docker-compose.yml").write_text(
        "services:\n  web:\n    image: x\n  db:\n    image: y\nvolumes:\n  v:\n")
    assert compose_services(str(tmp_path), "docker-compose.yml") == ["web", "db"]


def test_dockerfile_skips_stage_names_and_scratch(tmp_path):
    (tmp_path / "Dockerfile").write_text(
        "FROM python:3.11 AS builder\nFROM builder\nFROM scratch\nFROM node:20\n")
    assert dockerfile_images(str(tmp_path), "Dockerfile") == ["python:3.11", "node:20"]


def test_parse_deps_reads_pyproject_and_requirements(tmp_path):
    (tmp_path / "pyproject.toml").write_text('[project]\ndependencies = ["fastapi>=1", "anthropic"]\n')
    (tmp_path / "requirements.txt").write_text("# comment\nredis==5\n-e .\n")
    assert parse_deps(str(tmp_path), ["pyproject.toml", "requirements.txt"]) == \
        ["anthropic", "fastapi", "redis"]                    # sorted, version specs stripped


def test_detect_clouds_tethers_a_dep_to_its_district(tmp_path):
    (tmp_path / "pyproject.toml").write_text('[project]\ndependencies = ["anthropic"]\n')
    comp = {"pyproject.toml": "api", "api/x.py": "api"}
    assert {"name": "Anthropic", "tether": "api"} in detect_clouds(str(tmp_path), comp)


def test_component_of_matches_globs_else_none():
    comps = [{"id": "api", "globs": ["api/*"]}, {"id": "web", "globs": ["web/*"]}]
    assert component_of("api/server.py", comps) == "api"
    assert component_of("README.md", comps) is None


# ---- zoning classification (ordering: "docker" must not match "doc") ----------

def test_guess_kind_orders_infra_before_docs():
    assert guess_kind("docker") == "infra"
    assert guess_kind("docs") == "docs"
    assert guess_kind("tests") == "tests"
    assert guess_kind("anything-else") == "service"


def test_guess_layer_maps_names_to_pipeline_layers():
    assert guess_layer("frontend") == "front"
    assert guess_layer("database") == "back"
    assert guess_layer("tests") == "under"
    assert guess_layer("core") == "mid"


# ---- end-to-end smoke: the real pipeline on a real repo ----------------------

def test_seed_builds_a_coherent_city_from_this_repo():
    data = seed(REPO, auto_zone(REPO))
    assert data["buildings"], "seeded no buildings"
    assert all(b["files"] > 0 for b in data["buildings"])    # every building owns ≥1 file
    assert sum(b["loc"] for b in data["buildings"]) > 0      # the city has real mass
    assert sum(b["commits"] for b in data["buildings"]) > 0  # history walk attributed commits


def test_timeline_is_head_anchored_and_chronological():
    tl = build_timeline(REPO)
    assert len(tl["head"]) == 40                             # full HEAD sha
    timestamps = [c["ts"] for c in tl["commits"]]
    assert timestamps == sorted(timestamps)                 # --reverse → ascending
