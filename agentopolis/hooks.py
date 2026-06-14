"""Attach/detach the city to Claude Code via ~/.claude/settings.json hooks.

Hooks fire-and-forget to localhost with a 1s timeout, so Claude Code is
never blocked when the city isn't running.
"""
import json
from pathlib import Path

SETTINGS = Path.home() / ".claude" / "settings.json"
BACKUP = SETTINGS.with_suffix(".json.agentopolis.bak")
EVENTS = [
    "SessionStart",
    "UserPromptSubmit",
    "Notification",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "SubagentStop",
    "SessionEnd",
]
def command(port: int) -> str:
    return (
        f"curl -sf -m 1 -X POST http://localhost:{port}/hook "
        "-H 'Content-Type: application/json' --data-binary @- "
        ">/dev/null 2>&1 || true"
    )


def has_hotel_hook(entries: list) -> bool:
    return any(
        "/hook" in hook.get("command", "") and "curl" in hook.get("command", "")
        for entry in entries
        for hook in entry.get("hooks", [])
    )


def is_attached() -> bool:
    if not SETTINGS.exists():
        return False
    hooks = json.loads(SETTINGS.read_text()).get("hooks", {})
    return any(has_hotel_hook(entries) for entries in hooks.values())


def attach(port: int = 4242) -> None:
    settings = json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}
    BACKUP.write_text(json.dumps(settings, indent=2))
    hooks = settings.setdefault("hooks", {})
    added = 0
    for event in EVENTS:
        entries = hooks.setdefault(event, [])
        if not has_hotel_hook(entries):
            entries.append({"matcher": "", "hooks": [{"type": "command", "command": command(port)}]})
            added += 1
    SETTINGS.write_text(json.dumps(settings, indent=2) + "\n")
    print(f"attached {added} events ({SETTINGS}, backup at {BACKUP.name})")
    print("new Claude Code sessions will now report to the city")


def detach() -> None:
    if not SETTINGS.exists():
        return
    settings = json.loads(SETTINGS.read_text())
    hooks = settings.get("hooks", {})
    for event in list(hooks):
        hooks[event] = [e for e in hooks[event] if not has_hotel_hook([e])]
        if not hooks[event]:
            del hooks[event]
    SETTINGS.write_text(json.dumps(settings, indent=2) + "\n")
    print("detached — agentopolis hooks removed")
