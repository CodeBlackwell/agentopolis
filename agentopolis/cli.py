"""agentopolis — see any repo as a living isometric city: watch Claude Code agents build it live,
or replay its git history as a time-lapse movie (one repo, or a marathon of a whole folder)."""
import argparse
import subprocess
import threading
import time
import webbrowser
from importlib.metadata import version
from pathlib import Path

import uvicorn

import json
from urllib.parse import quote

from . import forge, hooks, nation, scout, server, survey
from .seed import git


def is_url(target: str) -> bool:
    return target.startswith(("http://", "https://"))


def repo_problem(repo: str) -> str | None:
    """A friendly message if `repo` can't be mapped as a city (not a git repo / no commits), else None."""
    path = Path(repo).resolve()
    if git(repo, "rev-parse", "--is-inside-work-tree").strip() != "true":
        return (f"\n  🏙️  agentopolis maps a git repository as a city — but this isn't one:\n"
                f"\n        {path}\n"
                f"\n     Try one of these:\n"
                f"       • cd into a git repo, then run:  agentopolis\n"
                f"       • point at a repo:               agentopolis /path/to/repo\n"
                f"       • map a folder of repos:         agentopolis --root /path/to/projects\n"
                f"       • play any github repo's movie:  agentopolis movie https://github.com/owner/repo\n"
                f"\n     Starting fresh? Run `git init` and make a commit first.\n")
    if not git(repo, "rev-list", "--count", "HEAD").strip():
        return (f"\n  🏙️  agentopolis builds the city from git history — but this repo has no commits yet:\n"
                f"\n        {path}\n"
                f"\n     Make your first commit, then run `agentopolis` again.\n")
    return None


def valid_target(args) -> bool:
    """Friendly guard for `serve`: needs a git repo (or a --root folder of them), else print help and bow out."""
    if args.root:                                        # --root maps every git repo under a folder
        if nation.discover_repos(args.root):
            return True
        print(f"\n  🗺️  agentopolis --root maps every git repo inside a folder — but none were found under:\n"
              f"\n        {Path(args.root).resolve()}\n"
              f"\n     Point --root at a folder whose subdirectories are git repositories.\n")
        return False
    msg = repo_problem(args.repo)
    if msg:
        print(msg)
        return False
    return True


def free_port(port: int) -> None:
    def holders():                                       # pids currently bound to the port
        return subprocess.run(["lsof", "-ti", f":{port}"],
                              capture_output=True, text=True).stdout.split()
    pids = holders()
    if not pids:
        return
    print(f"freeing port {port} (pid {', '.join(pids)})")
    for sig in ("-TERM", "-KILL"):
        subprocess.run(["kill", sig, *pids], capture_output=True)
        for _ in range(20):
            if not holders():
                return
            time.sleep(.1)


def serve(port: int) -> None:
    # SSE streams end on client disconnect / lifespan shutdown; the graceful-shutdown
    # timeout is the backstop that force-closes any still-open stream on Ctrl+C
    runner = uvicorn.Server(uvicorn.Config(server.app, port=port,
                                           log_level="warning", timeout_graceful_shutdown=2))
    try:
        runner.run()
    except KeyboardInterrupt:               # uvicorn re-raises the Ctrl+C after shutdown
        pass


COMMANDS = ("serve", "movie", "marathon", "scout", "attach", "detach")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="agentopolis",
        description="See any repo as a living isometric city — watch Claude Code agents build it live, "
                    "or replay its git history as a time-lapse movie.")
    parser.add_argument("command", nargs="?", default="serve",
                        help="serve the live city (default — also auto-reports Claude Code sessions), "
                             "play one repo's movie, run a marathon of every repo's movie, or attach/detach "
                             "hooks for good. A bare path serves that repo: `agentopolis /path/to/repo`")
    parser.add_argument("target", nargs="?",
                        help="for `movie`: a local repo dir or a github url; for `marathon`: a folder of "
                             "repos to scan (default: current dir)")
    parser.add_argument("--version", action="version", version=f"%(prog)s {version('agentopolis')}")
    parser.add_argument("--list", action="store_true", help="for `marathon`: rank the repos as a table instead of playing them")
    parser.add_argument("--json", action="store_true", help="for `marathon --list`: emit the ranking as JSON")
    parser.add_argument("--top", type=int, help="for `marathon`: cap the playlist to the top N movies; "
                                                "for `scout`: how many repos to fetch + rank (default 20)")
    parser.add_argument("--since", default="daily", help="for `scout` trending: daily|weekly|monthly")
    parser.add_argument("--lang", help="for `scout` trending: filter by language (e.g. python)")
    parser.add_argument("--repo", default=".", help="git repo to map (default: cwd; or pass it as a bare path)")
    parser.add_argument("--zone", help="zoning manifest (default: <repo>/.agentopolis.json, else auto-zoned)")
    parser.add_argument("--root", help="map every git repo under this dir as a nation of cities")
    parser.add_argument("--showcase", help="serve a baked showcase dir (nation fixtures, no live git)")
    parser.add_argument("--port", type=int, default=4242)
    parser.add_argument("--no-open", action="store_true", help="don't open the city in a browser")
    args = parser.parse_args()
    if args.command not in COMMANDS:                     # a bare path → serve that repo (`agentopolis ~/code/x`)
        args.repo, args.command = args.command, "serve"
    elif args.command == "serve" and args.target:        # explicit `agentopolis serve ~/code/x`
        args.repo = args.target

    if args.command == "attach":
        hooks.attach(args.port)
        return
    if args.command == "detach":
        hooks.detach()
        return
    if args.command == "marathon":
        if args.list:
            run_crawl(args.target or ".", args.json)
        else:
            run_marathon(args.target or ".", args.port, args.no_open, args.top)
        return
    if args.command == "scout":                          # no target → trending; a target is a search query
        run_scout(args.target, args.since, args.lang, args.top, args.json)
        return

    open_path, label, live = "", "City", False          # open_path is appended to the base url; live → auto-hooks
    if args.command == "movie":
        if not configure_movie(args):                    # prints a friendly note + returns False on bad target
            return
        target = args.target or args.repo
        open_path = ("/?forge=" + quote(target, safe="")) if is_url(target) else "/?timelapse"
        where, label = f"movie: {target}", "Movie"
    elif args.showcase:
        server.configure_showcase(args.showcase)
        where = f"showcase: {args.showcase}"
    elif not valid_target(args):                         # nothing to map → friendly note, no blank city
        return
    else:
        server.configure(args.repo, args.zone)
        root = args.root or (nation.is_mother(args.repo) and args.repo)   # a mother repo is a nation
        if root:
            server.configure_nation(root, None)
        where, label, live = (f"nation: {root}", "Nation", True) if root else (f"repo: {args.repo}", "City", True)

    # the live city auto-attaches hooks for this run only, detaching on exit — unless they're already
    # attached for good (`agentopolis attach`), in which case we leave the user's config untouched
    auto_attached = live and not hooks.is_attached()
    if auto_attached:
        hooks.attach(args.port)

    free_port(args.port)
    url = f"http://localhost:{args.port}"
    print(f"Agentopolis {label} on {url} ({where})")
    if not args.no_open:
        opener = threading.Timer(1, lambda: webbrowser.open(url + open_path))
        opener.daemon = True
        opener.start()
    try:
        serve(args.port)
    finally:
        if auto_attached:
            hooks.detach()


def run_crawl(root: str, as_json: bool) -> None:
    """Scan a folder of repos and rank them by time-lapse 'movie' potential."""
    rows = survey.crawl(root)
    if as_json:
        print(json.dumps(rows, indent=2))
        return
    if not rows:
        print(f"\n  🎬  no git repos with history found under {Path(root).resolve()}\n")
        return
    print(f"\n  🎬  movie potential under {Path(root).resolve()} — best first:\n")
    print(f"  {'repo':24} {'score':>6} {'commits':>7} {'bld':>5} {'trans':>5} {'deaths':>6}  formation ladder")
    print(f"  {'-'*24} {'-'*6} {'-'*7} {'-'*5} {'-'*5} {'-'*6}  {'-'*40}")
    for r in rows:
        print(f"  {r['repo'][:24]:24} {r['score']:>6} {r['commits']:>7} {r['buildings']:>5} "
              f"{r['transitions']:>5} {r['deaths']:>6}  {_phases(r)}")
    best = rows[0]
    print(f"\n  ▶ best: {best['repo']} — play it with  agentopolis movie {best['path']}\n")


def _phases(row: dict) -> str:
    """Formation ladder with each phase's share of history, e.g. village·42% → spine·33% → grid·25%."""
    return " → ".join(f"{p['formation']}·{p['pct']}%" for p in row["phases"])


def run_scout(query: str | None, since: str, language: str | None, top: int | None, as_json: bool) -> None:
    """Scout GitHub (trending, or a search query) and rank repos by time-lapse 'movie' potential."""
    rows = scout.scout(query=query, since=since, language=language, limit=top or 20)
    if as_json:
        print(json.dumps(rows, indent=2))
        return
    if not rows:
        print("\n  🎬  scout found no repos with playable history\n")
        return
    src = f"search “{query}”" if query else f"github trending ({since}{', ' + language if language else ''})"
    print(f"\n  🎬  movie potential from {src} — best first:\n")
    print(f"  {'repo':30} {'score':>6} {'commits':>7} {'trans':>5}  formation ladder (phase share)")
    print(f"  {'-'*30} {'-'*6} {'-'*7} {'-'*5}  {'-'*44}")
    for r in rows:
        print(f"  {r['slug'][:30]:30} {r['score']:>6} {r['commits']:>7} {r['transitions']:>5}  {_phases(r)}")
    print(f"\n  ▶ best: {rows[0]['slug']} — play it with  agentopolis movie {rows[0]['slug']}\n")


def run_marathon(root: str, port: int, no_open: bool, top: int | None) -> None:
    """Grab every repo's movie under `root` (cached per repo+HEAD), then serve a ranked, auto-advancing
    playlist with a selection bar — fully local and offline."""
    repos = survey.find_repos(root)
    if not repos:
        print(f"\n  🎬  no git repos found under {Path(root).resolve()}\n")
        return
    print(f"\n  🎬  grabbing movies from {len(repos)} repos under {Path(root).resolve()} "
          f"(cached — instant next time):")
    rows, bundles = [], {}
    for i, repo in enumerate(repos, 1):
        try:
            metrics, bundle = survey.movie_cached(repo)
        except Exception as exc:                              # one unreadable repo shouldn't sink the marathon
            print(f"     [{i:>2}/{len(repos)}] {Path(repo).name[:26]:26} skipped — {exc}")
            continue
        if not metrics or not bundle:
            continue
        slug, base, k = metrics["repo"], metrics["repo"], 2     # unique id per playlist entry
        while slug in bundles:
            slug, k = f"{base}-{k}", k + 1
        metrics["id"] = slug
        rows.append(metrics)
        bundles[slug] = bundle
        print(f"     [{i:>2}/{len(repos)}] {metrics['repo'][:26]:26} {metrics['ladder']}")
    if not rows:
        print(f"\n  🎬  no repos with playable history under {Path(root).resolve()}\n")
        return
    rows.sort(key=lambda r: r["score"], reverse=True)
    if top:
        rows = rows[:top]
        bundles = {r["id"]: bundles[r["id"]] for r in rows}
    server.configure_marathon(rows, bundles)
    free_port(port)
    url = f"http://localhost:{port}"
    print(f"\n  ▶ marathon of {len(rows)} movies on {url}  (best first: {rows[0]['repo']})\n")
    if not no_open:
        opener = threading.Timer(1, lambda: webbrowser.open(url + "/?marathon"))
        opener.daemon = True
        opener.start()
    serve(port)


def configure_movie(args) -> bool:
    """Set up movie mode for a local repo dir or a github url. github urls are cloned to a temp dir
    (removed after seeding) and the city is held in memory only."""
    target = args.target or args.repo
    if is_url(target):
        try:
            forge.clone_url(target)                      # validate github.com/owner/repo shape, fail fast
        except ValueError as exc:
            print(f"\n  🎬  agentopolis movie needs a github.com/owner/repo url — {exc}:\n\n        {target}\n")
            return False
        forge.disk_cache = False                         # minimal download, held in memory only
        return True
    problem = repo_problem(target)
    if problem:
        print(problem)
        return False
    server.configure(target, args.zone)
    return True


if __name__ == "__main__":
    main()
