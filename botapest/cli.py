"""botapest — run from any git repo to watch agents build its city."""
import argparse
import subprocess
import time

import uvicorn

from . import hooks, server


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
        prog="botapest",
        description="Habbo-style visualization of Claude Code agents building your repo as a city.")
    parser.add_argument("command", nargs="?", default="serve", choices=["serve", "attach", "detach"],
                        help="serve the city (default), or attach/detach Claude Code hooks")
    parser.add_argument("--repo", default=".", help="git repo to map as the city (default: cwd)")
    parser.add_argument("--zone", help="zoning manifest (default: <repo>/.botapest.json, else auto-zoned)")
    parser.add_argument("--port", type=int, default=4242)
    args = parser.parse_args()

    if args.command == "attach":
        hooks.attach(args.port)
    elif args.command == "detach":
        hooks.detach()
    else:
        free_port(args.port)
        server.configure(args.repo, args.zone)
        print(f"Botapest City on http://localhost:{args.port} (repo: {args.repo})")
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
