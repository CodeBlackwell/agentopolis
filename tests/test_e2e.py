"""Load-bearing e2e validations for the orchestration layer: cli, hooks, forge,
nation, bake.

These drive the real code paths — real tiny git repos built in tmp, the real
settings.json hook lifecycle, the real cache machinery — but never hit the
network or boot a server. They guard the things that, if they break, break an
actual `agentopolis` command. Run: `uv run --extra test pytest tests/test_e2e.py`.
"""
import json
import subprocess
from types import SimpleNamespace

import pytest

from agentopolis import bake, cli, forge, hooks, nation, survey


# ---- shared: build real git repos -------------------------------------------

def _git(cwd, *args):
    subprocess.run(["git", "-C", str(cwd), *args], check=True, capture_output=True)


def _make_repo(path, files):
    path.mkdir(parents=True, exist_ok=True)
    _git(path, "init", "-q")
    _git(path, "config", "user.email", "t@t"); _git(path, "config", "user.name", "t")
    for name, body in files.items():
        (path / name).write_text(body)
    _git(path, "add", "-A"); _git(path, "commit", "-q", "-m", "init")
    return path


@pytest.fixture(scope="module")
def workspace(tmp_path_factory):
    """A folder of real git repos — a nation root (no .git of its own)."""
    ws = tmp_path_factory.mktemp("nation")
    _make_repo(ws / "alpha", {"a.py": "x=1\n", "b.py": "y=2\n", "c.py": "z=3\n"})
    _make_repo(ws / "beta", {"app.js": "a\n", "ui.jsx": "b\n", "main.ts": "c\n"})
    return ws


@pytest.fixture(scope="module")
def history_repo(tmp_path_factory):
    """One repo with real history — two districts, churn, a rename, and a deletion —
    enough for the movie scorer (_metrics) to run every loop: resolve, reconstruct
    ruins, index coupling, detect epochs, build the ladder."""
    r = tmp_path_factory.mktemp("hist")
    _git(r, "init", "-q")
    _git(r, "config", "user.email", "t@t"); _git(r, "config", "user.name", "t")

    def commit(msg):
        _git(r, "add", "-A"); _git(r, "commit", "-q", "-m", msg)

    base = {"api/server.py": "import os\n" + "x=1\n" * 20, "api/db.py": "q=1\n" * 15,
            "api/util.py": "u=1\n" * 10, "web/app.js": "a\n" * 12, "web/ui.js": "b\n" * 8,
            "web/page.js": "c\n" * 6, "web/extra.js": "d\n" * 6, "legacy.py": "l\n" * 30}
    for p, b in base.items():
        f = r / p; f.parent.mkdir(parents=True, exist_ok=True); f.write_text(b)
    commit("init")
    for i in range(3):                                   # churn → commit depth for epochs
        (r / "api/server.py").write_text("import os\n" + f"x={i}\n" * 20); commit(f"edit {i}")
    (r / "tools").mkdir()
    (r / "legacy.py").rename(r / "tools" / "new.py")     # a rename to fold (-M)
    commit("rename legacy")
    (r / "web/page.js").unlink()                         # a deletion → a ruin
    commit("drop page")
    return str(r)


# ---- hooks: the ~/.claude/settings.json attach/detach lifecycle ---------------

@pytest.fixture
def settings(tmp_path, monkeypatch):
    s = tmp_path / "settings.json"
    monkeypatch.setattr(hooks, "SETTINGS", s)
    monkeypatch.setattr(hooks, "BACKUP", s.with_suffix(".json.bak"))
    return s


def test_attach_then_detach_restores_the_user_config(settings, capsys):
    settings.write_text(json.dumps({"theme": "dark", "hooks": {"Stop": [{"matcher": "x",
                        "hooks": [{"type": "command", "command": "echo mine"}]}]}}))
    hooks.attach(9999)
    assert hooks.is_attached()
    assert hooks.BACKUP.exists()                         # the user's original is backed up
    after = json.loads(settings.read_text())
    assert after["theme"] == "dark"                      # untouched
    assert any("echo mine" in hk["command"]              # the user's own hook is preserved
               for e in after["hooks"]["Stop"] for hk in e["hooks"])
    hooks.detach()
    assert not hooks.is_attached()
    restored = json.loads(settings.read_text())
    assert restored["hooks"] == {"Stop": [{"matcher": "x",
        "hooks": [{"type": "command", "command": "echo mine"}]}]}      # back to exactly the user's


def test_attach_is_idempotent(settings):
    hooks.attach(4242)
    hooks.attach(4242)                                   # second run must not duplicate
    stop_hooks = json.loads(settings.read_text())["hooks"]["Stop"]
    city = [e for e in stop_hooks if hooks.has_hotel_hook([e])]
    assert len(city) == 1


def test_is_attached_false_without_settings(settings):
    assert not settings.exists()
    assert hooks.is_attached() is False


def test_detach_is_a_noop_without_settings(settings):
    hooks.detach()                                       # must not raise when nothing was attached
    assert not settings.exists()


# ---- forge: url validation (a security boundary) + the cache machinery --------

@pytest.mark.parametrize("url,expected", [
    ("https://github.com/facebook/react", "https://github.com/facebook/react.git"),
    ("https://github.com/facebook/react.git", "https://github.com/facebook/react.git"),
    ("https://github.com/facebook/react/", "https://github.com/facebook/react.git"),
    ("http://github.com/a/b", "https://github.com/a/b.git"),
])
def test_clone_url_accepts_and_normalizes_github(url, expected):
    assert forge.clone_url(url) == expected


@pytest.mark.parametrize("bad", [
    "https://gitlab.com/a/b", "git@github.com:a/b.git", "https://github.com/onlyowner",
    "https://github.com/a/b/c", "https://github.com/../etc", "not-a-url", "",
])
def test_clone_url_rejects_everything_else(bad):
    with pytest.raises(ValueError):
        forge.clone_url(bad)


def test_save_og_validates_then_caches(tmp_path, monkeypatch):
    monkeypatch.setattr(forge, "OG_DIR", tmp_path / "og")
    png = forge._PNG_MAGIC + b"\x00" * 64
    forge.save_og("facebook/react", png)
    assert forge.og_exists("facebook/react")
    assert forge.og_path("facebook/react").read_bytes() == png
    with pytest.raises(ValueError):
        forge.save_og("k", b"not a png")                 # bad magic
    monkeypatch.setattr(forge, "OG_MAX_BYTES", 10)
    with pytest.raises(ValueError):
        forge.save_og("k", png)                          # over the size cap


def test_save_og_prunes_oldest_over_the_cap(tmp_path, monkeypatch):
    monkeypatch.setattr(forge, "OG_DIR", tmp_path / "og")
    monkeypatch.setattr(forge, "OG_MAX_FILES", 3)
    png = forge._PNG_MAGIC + b"\x00"
    for i in range(6):
        forge.save_og(f"key{i}", png)
    assert len(list((tmp_path / "og").glob("*.png"))) == 3   # bounded, not unbounded growth


def test_disk_cache_survives_a_fresh_process(tmp_path, monkeypatch):
    monkeypatch.setattr(forge, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(forge, "disk_cache", True)
    url, bundle = "https://github.com/test/repo", {"buildings": [{"loc": 1}]}
    forge._save(url, "city", {}, bundle)
    assert forge._load(url, "city", {}) == bundle        # a fresh (empty) memory dict reads it off disk


# ---- nation: real repos → one grouped map ------------------------------------

@pytest.mark.parametrize("exts,family", [
    ({"py": 10}, "backend"),
    ({"py": 10, "ts": 8}, "fullstack"),
    ({"md": 10}, "docs"),
    ({"md": 3, "py": 10}, "backend"),                    # docs lose to code unless they outweigh it
    ({}, "neutral"),
])
def test_classify_picks_the_archetype_family(exts, family):
    from collections import Counter
    assert nation.classify(Counter(exts)) == family


def test_discover_repos_and_is_mother(workspace, tmp_path):
    assert nation.discover_repos(str(workspace)) == ["alpha", "beta"]
    assert not nation.is_mother(str(workspace))          # the root itself isn't a git repo
    mother = _make_repo(tmp_path / "m", {"README.md": "hi\n"})
    _make_repo(tmp_path / "m" / "s1", {"a.py": "1\n"})
    _make_repo(tmp_path / "m" / "s2", {"b.py": "2\n"})
    assert nation.is_mother(str(mother))                 # a git repo nesting ≥2 git repos


def test_summarize_reads_real_git_stats(workspace):
    s = nation.summarize(str(workspace / "alpha"))
    assert s["files"] == 3 and s["commits"] == 1
    assert s["lang"] == "py" and s["family"] == "backend"


def test_load_nation_groups_every_repo(workspace, monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", False)      # compute formations, don't pollute the cache
    nat = json.loads(json.dumps(nation.load_nation(str(workspace), None)))
    assert {c["repo"] for c in nat["cities"]} == {"alpha", "beta"}
    assert all(c["state"] for c in nat["cities"])         # every city lands in a state
    assert all(c.get("formation") for c in nat["cities"])
    members = {r for st in nat["states"] for r in st["repos"]}
    assert members == {"alpha", "beta"}                   # states cover the whole nation


def test_load_nation_honors_a_manifest_defined_state(workspace, tmp_path, monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", False)
    man = tmp_path / "n.json"
    man.write_text(json.dumps({"states": [{"id": "core", "name": "Core", "repos": ["alpha"]}]}))
    nat = nation.load_nation(str(workspace), str(man))
    core = next(st for st in nat["states"] if st["id"] == "core")
    assert core["name"] == "Core" and core["repos"] == ["alpha"]        # manifest names win
    assert next(c for c in nat["cities"] if c["repo"] == "alpha")["state"] == "core"


def test_mother_nation_has_a_capital(tmp_path, monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", False)
    mother = _make_repo(tmp_path / "m", {"README.md": "hi\n"})
    _make_repo(tmp_path / "m" / "s1", {"a.py": "1\n"})
    _make_repo(tmp_path / "m" / "s2", {"b.py": "2\n"})
    nat = nation.load_nation(str(mother), None)
    assert any(c["repo"] == nation.CAPITAL and "capital" in c["name"] for c in nat["cities"])
    assert {c["repo"] for c in nat["cities"]} == {nation.CAPITAL, "s1", "s2"}


# ---- bake: the showcase transforms + a real seed -----------------------------

def test_canonical_strips_variant_suffixes():
    assert bake.canonical("specter-1-private") == "specter-1"
    assert bake.canonical("app-wave2") == "app"
    assert bake.canonical("plain") == "plain"            # no suffix → unchanged


def test_dedup_collapses_variants_across_cities_and_states():
    nat = {"cities": [{"repo": "specter-1"}, {"repo": "specter-1-private"}, {"repo": "alpha"}],
           "states": [{"repos": ["specter-1", "specter-1-private", "alpha"]}]}
    out = bake.dedup(nat)
    assert {c["repo"] for c in out["cities"]} == {"specter-1", "alpha"}
    assert out["states"][0]["repos"] == ["specter-1", "alpha"]   # the variant is pruned from states too


def test_protect_docker_redacts_only_unknown_images():
    data = {"docker": [{"items": ["postgres:16", "mycorp/secret:1", "redis"]}]}
    bake.protect_docker(data)
    assert data["docker"][0]["items"] == ["postgres", "service", "redis"]


def test_curate_trims_to_keep_set_and_renames():
    nat = {"cities": [{"repo": "a"}, {"repo": "b"}, {"repo": "c"}],
           "states": [{"id": "s1", "name": "S1", "repos": ["a", "b"]},
                      {"id": "s2", "name": "S2", "repos": ["c"]}]}
    out = bake.curate(nat, {"keep": ["a", "c"], "cities": {"a": "Alpha City"}, "states": {"s1": "First"}})
    assert [c["repo"] for c in out["cities"]] == ["a", "c"]       # b dropped
    assert next(c for c in out["cities"] if c["repo"] == "a")["name"] == "Alpha City"
    assert out["states"][0] == {"id": "s1", "name": "First", "repos": ["a"]}


def test_build_nation_seeds_a_real_workspace(workspace, monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", False)
    nat = bake.build_nation(str(workspace))
    assert {c["repo"] for c in nat["cities"]} == {"alpha", "beta"}


# ---- survey: the movie scorer, reached through `crawl` (its cli entry) --------

def test_evaluate_scores_a_repo_with_history(history_repo, monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", False)
    m = survey.evaluate(history_repo)
    assert m["commits"] >= 6 and m["buildings"] > 0 and m["score"] > 0
    assert m["ladder"]                                   # the formation ladder it plays
    assert m["deaths"] >= 1                              # the deleted page.js became a ruin


def test_crawl_command_ranks_repos_as_a_table(history_repo, capsys, monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", False)
    cli.run_crawl(history_repo, as_json=False)           # the `agentopolis crawl` path
    out = capsys.readouterr().out
    assert "movie potential" in out and "best:" in out


def test_crawl_command_emits_json(history_repo, capsys, monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", False)
    cli.run_crawl(history_repo, as_json=True)
    rows = json.loads(capsys.readouterr().out)
    assert rows and rows[0]["commits"] >= 6


def test_crawl_command_handles_an_empty_folder(tmp_path, capsys):
    cli.run_crawl(str(tmp_path), as_json=False)
    assert "no git repos" in capsys.readouterr().out


def test_build_movie_returns_metrics_and_a_playable_bundle(history_repo, monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", False)
    metrics, bundle = survey.build_movie(history_repo)
    assert metrics["commits"] >= 6
    assert bundle["data"]["buildings"] and bundle["timeline"]["commits"]


def test_movie_cached_reuses_the_disk_cache(history_repo, tmp_path, monkeypatch):
    monkeypatch.setattr(forge, "CACHE_DIR", tmp_path / "c")
    monkeypatch.setattr(forge, "disk_cache", True)
    first = survey.movie_cached(history_repo)
    assert list((tmp_path / "c").glob("movie-*.json"))  # the rebuild was persisted
    assert survey.movie_cached(history_repo) == first    # the second call reads it back


def test_head_formation_is_cached_per_head(workspace, tmp_path, monkeypatch):
    monkeypatch.setattr(forge, "CACHE_DIR", tmp_path / "c")
    monkeypatch.setattr(forge, "disk_cache", True)
    form = survey.head_formation(str(workspace / "alpha"))
    assert form and list((tmp_path / "c").glob("form-*.json"))
    assert survey.head_formation(str(workspace / "alpha")) == form   # served from cache


# ---- cli: the friendly guards + command routing (no server boot) -------------

def test_is_url():
    assert cli.is_url("https://x") and cli.is_url("http://x")
    assert not cli.is_url("/local/path") and not cli.is_url("git@github.com:a/b")


def test_repo_problem_catches_the_unmappable_and_clears_the_real(tmp_path):
    assert "isn't one" in cli.repo_problem(str(tmp_path))          # not a git repo
    empty = tmp_path / "empty"; empty.mkdir(); _git(empty, "init", "-q")
    assert "no commits" in cli.repo_problem(str(empty))            # git repo, no history
    good = _make_repo(tmp_path / "good", {"a.py": "1\n"})
    assert cli.repo_problem(str(good)) is None                     # a real repo passes


def test_configure_movie_rejects_a_non_github_url(capsys):
    args = SimpleNamespace(target="https://gitlab.com/a/b", repo=".", zone=None)
    assert cli.configure_movie(args) is False
    assert "github.com/owner/repo" in capsys.readouterr().out


def test_configure_movie_url_holds_the_clone_in_memory(monkeypatch):
    monkeypatch.setattr(forge, "disk_cache", True)
    args = SimpleNamespace(target="https://github.com/facebook/react", repo=".", zone=None)
    assert cli.configure_movie(args) is True
    assert forge.disk_cache is False                              # url movies never touch disk


def test_configure_movie_accepts_a_local_repo(history_repo, monkeypatch):
    seen = {}
    monkeypatch.setattr(cli.server, "configure", lambda repo, zone: seen.update(repo=repo))
    args = SimpleNamespace(target=history_repo, repo=".", zone=None)
    assert cli.configure_movie(args) is True
    assert seen["repo"] == history_repo                   # the local repo is wired into the server


def test_configure_movie_rejects_a_non_git_local_path(tmp_path, capsys):
    args = SimpleNamespace(target=str(tmp_path), repo=".", zone=None)
    assert cli.configure_movie(args) is False
    assert "isn't one" in capsys.readouterr().out


def test_valid_target_accepts_a_root_of_repos(workspace):
    assert cli.valid_target(SimpleNamespace(root=str(workspace), repo=".")) is True


def test_main_routes_subcommands_without_booting_a_server(monkeypatch):
    calls = {}
    monkeypatch.setattr(hooks, "attach", lambda port: calls.setdefault("attach", port))
    monkeypatch.setattr(hooks, "detach", lambda: calls.setdefault("detach", True))
    monkeypatch.setattr(cli, "run_crawl", lambda root, as_json: calls.setdefault("crawl", (root, as_json)))
    for argv, key in ([["agentopolis", "attach"], "attach"],
                      [["agentopolis", "detach"], "detach"],
                      [["agentopolis", "crawl", "somedir", "--json"], "crawl"]):
        monkeypatch.setattr("sys.argv", argv)
        cli.main()
    assert calls == {"attach": 4242, "detach": True, "crawl": ("somedir", True)}
