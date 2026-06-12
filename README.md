# The Grand Botapest Hotel

A Habbo-style isometric visualization of Claude Code at work. Every agent is a
pixel guest: the concierge (your main session) checks in at reception, subagents
walk through the door when spawned, and tool calls send guests to stations —
the CRT terminal for `Bash`, the archive shelf for `Read`/`Grep`, the workshop
for `Edit`/`Write`, the telephone booth for web tools. Guests check out when
their agent stops.

## Quickstart

```bash
just attach    # one-time: adds fire-and-forget hooks to ~/.claude/settings.json
just dev       # hotel on http://localhost:4242
```

Open http://localhost:4242, then start any Claude Code session — new sessions
report in automatically. No live session handy? http://localhost:4242/?demo
runs a scripted day at the hotel.

`just detach` removes the hooks (a backup of settings.json is written on attach).

## How it works

```
Claude Code hooks ──curl──▶ POST /hook ──▶ normalize ──SSE──▶ canvas renderer
```

- `hooks.py` registers a `curl -m 1 ... || true` command on seven hook events
  (SessionStart, UserPromptSubmit, Pre/PostToolUse, Stop, SubagentStop,
  SessionEnd). It never blocks Claude Code — if the hotel isn't running, the
  curl times out silently.
- `server.py` (FastAPI) trims each payload to `{event, session, tool, detail}`
  and broadcasts over SSE. No storage; the hotel only shows the present.
- `static/render.js` + `static/hotel.js` draw the room and guests on a plain
  canvas — original pixel art, no Habbo assets.

## Known limits (v0)

- Tool calls made *by subagents* fire the same hooks without an agent id, so
  they animate the concierge. Per-guest attribution needs transcript tailing
  (`~/.claude/projects/<proj>/agent-*.jsonl`) — the natural v1.
- Front-facing avatars only; no directional sprites yet.
