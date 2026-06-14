"""agentopolis — run from any git repo to watch agents build its city."""
import argparse
import subprocess
import threading
import time
import webbrowser

import uvicorn

from . import hooks, nation, server


def free_port(port: int) -> None:
    holders = lambda: subprocess.run(["lsof", "-ti", f":{port}"],
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


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="agentopolis",
        description="Habbo-style visualization of Claude Code agents building your repo as a city.")
    parser.add_argument("command", nargs="?", default="serve", choices=["serve", "attach", "detach"],
                        help="serve the city (default), or attach/detach Claude Code hooks")
    parser.add_argument("--repo", default=".", help="git repo to map as the city (default: cwd)")
    parser.add_argument("--zone", help="zoning manifest (default: <repo>/.agentopolis.json, else auto-zoned)")
    parser.add_argument("--root", help="map every git repo under this dir as a nation of cities")
    parser.add_argument("--showcase", help="serve a baked showcase dir (nation fixtures, no live git)")
    parser.add_argument("--port", type=int, default=4242)
    parser.add_argument("--no-open", action="store_true", help="don't open the city in a browser")
    args = parser.parse_args()

    if args.command == "attach":
        hooks.attach(args.port)
    elif args.command == "detach":
        hooks.detach()
    else:
        free_port(args.port)
        if args.showcase:
            server.configure_showcase(args.showcase)
            root, where = True, f"showcase: {args.showcase}"
        else:
            server.configure(args.repo, args.zone)
            root = args.root or (nation.is_mother(args.repo) and args.repo)   # a mother repo is a nation
            if root:
                server.configure_nation(root, None)
            where = f"nation: {root}" if root else f"repo: {args.repo}"
        url = f"http://localhost:{args.port}"
        print(f"Agentopolis {'Nation' if root else 'City'} on {url} ({where})")
        if not hooks.is_attached():
            print("tip: run `agentopolis attach` so Claude Code sessions report to the city")
        if not args.no_open:
            opener = threading.Timer(1, lambda: webbrowser.open(url))
            opener.daemon = True
            opener.start()
        # SSE streams watch runner.should_exit so open browsers don't block Ctrl+C;
        # the graceful-shutdown timeout is the backstop for any other slow request
        runner = uvicorn.Server(uvicorn.Config(server.app, port=args.port,
                                               log_level="warning", timeout_graceful_shutdown=2))
        server.runner = runner
        try:
            runner.run()
        except KeyboardInterrupt:           # uvicorn re-raises the Ctrl+C after shutdown
            pass


if __name__ == "__main__":
    main()
