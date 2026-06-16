"""agentopolis — see any repo as a living isometric city: watch Claude Code agents build it live,
replay its git history as a time-lapse movie, or crawl a folder of repos to find the best movies."""
import argparse
import subprocess
import threading
import time
import webbrowser
from pathlib import Path

import uvicorn

import json
from urllib.parse import quote

from . import forge, hooks, nation, server, survey
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
                f"       • point at a repo:               agentopolis --repo /path/to/repo\n"
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


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="agentopolis",
        description="See any repo as a living isometric city — watch Claude Code agents build it live, "
                    "replay its git history as a time-lapse movie, or crawl a folder of repos for the "
                    "best movies.")
    parser.add_argument("command", nargs="?", default="serve",
                        choices=["serve", "movie", "marathon", "crawl", "attach", "detach", "."],
                        help="serve the live city (default), `.` to serve with hooks auto-attached + removed "
                             "on exit, play one repo's movie, run a marathon of every repo's movie, crawl a "
                             "folder for the best movies, or attach/detach hooks")
    parser.add_argument("target", nargs="?",
                        help="for `movie`: a local repo dir or a github url; for `marathon`/`crawl`: a "
                             "folder of repos to scan (default: current dir)")
    parser.add_argument("--json", action="store_true", help="for `crawl`: emit results as JSON")
    parser.add_argument("--top", type=int, help="for `marathon`: cap the playlist to the top N movies")
    parser.add_argument("--repo", default=".", help="git repo to map as the city (default: cwd)")
    parser.add_argument("--zone", help="zoning manifest (default: <repo>/.agentopolis.json, else auto-zoned)")
    parser.add_argument("--root", help="map every git repo under this dir as a nation of cities")
    parser.add_argument("--showcase", help="serve a baked showcase dir (nation fixtures, no live git)")
    parser.add_argument("--port", type=int, default=4242)
    parser.add_argument("--no-open", action="store_true", help="don't open the city in a browser")
    args = parser.parse_args()
    auto_hooks = args.command == "."     # `agentopolis .` — attach on start, serve, detach on exit (zero setup)
    if auto_hooks:
        args.command = "serve"

    if args.command == "attach":
        hooks.attach(args.port)
        return
    if args.command == "detach":
        hooks.detach()
        return
    if args.command == "crawl":
        run_crawl(args.target or ".", args.json)
        return
    if args.command == "marathon":
        run_marathon(args.target or ".", args.port, args.no_open, args.top)
        return

    open_path, label = "", "City"                        # open_path is appended to the base url in the browser
    if args.command == "movie":
        if not configure_movie(args):                    # prints a friendly note + returns False on bad target
            return
        target = args.target or args.repo
        open_path = ("/?forge=" + quote(target, safe="")) if is_url(target) else "/?timelapse"
        where, root, label = f"movie: {target}", False, "Movie"
    elif args.showcase:
        server.configure_showcase(args.showcase)
        where, root = f"showcase: {args.showcase}", True
    elif not valid_target(args):                         # nothing to map → friendly note, no blank city
        return
    else:
        server.configure(args.repo, args.zone)
        root = args.root or (nation.is_mother(args.repo) and args.repo)   # a mother repo is a nation
        if root:
            server.configure_nation(root, None)
        where, label = (f"nation: {root}", "Nation") if root else (f"repo: {args.repo}", "City")

    auto_attached = auto_hooks and not hooks.is_attached()   # only detach hooks WE added, not a manual attach
    if auto_attached:
        hooks.attach(args.port)

    free_port(args.port)
    url = f"http://localhost:{args.port}"
    print(f"Agentopolis {label} on {url} ({where})")
    if args.command != "movie" and not hooks.is_attached():
        print("tip: run `agentopolis attach` (or `agentopolis .`) so Claude Code sessions report to the city")
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
              f"{r['transitions']:>5} {r['deaths']:>6}  {r['ladder']}")
    best = rows[0]
    print(f"\n  ▶ best: {best['repo']} — play it with  agentopolis movie {best['path']}\n")


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
