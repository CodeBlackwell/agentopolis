# Agentopolis

A Habbo-style isometric visualization of Claude Code at work, in two views on
one page. **The dispatch floor** (City Hall): every agent is a pixel worker —
your main session checks in at reception, subagents walk through the door when
spawned, and tool calls send workers to stations — the CRT terminal for `Bash`,
the archive shelf for `Read`/`Grep`, the workshop for `Edit`/`Write`, the
telephone booth for web tools. **The skyline above**: the city is the codebase
itself, seeded from git history and zoned by architecture (a zoning manifest
maps globs to components and layers; floors = cross-component centrality,
footprint = lines of code, window glow = recency, building shape = language
family — pyramids for scripting, glass drums for web, ziggurats for compiled,
toggleable to key off rarity/size/age instead; managed services float as
tethered clouds). As agents work, the city builds itself out — edits wrap
buildings in scaffolding, a `git commit` drops the scaffolds and adds floors,
new files pop up new buildings. `/city.html` is a full-screen explorer with
pan/zoom. The city re-seeds itself from git whenever HEAD moves.

## Install & run

```bash
uv tool install agentopolis         # or: pipx install agentopolis
                                    # or: brew install codeblackwell/tap/agentopolis
agentopolis attach                  # one-time: fire-and-forget hooks into ~/.claude/settings.json

cd ~/code/any-repo
agentopolis                         # its city on http://localhost:4242

agentopolis movie                   # replay this repo's git history as a growing city
agentopolis movie ../other-repo     # …or any local repo
agentopolis movie https://github.com/owner/repo   # …or any public github repo

agentopolis crawl ~/code            # rank a folder of repos by movie potential
agentopolis marathon ~/code         # play every repo's movie back-to-back, with a selection bar
```

Open http://localhost:4242, then start any Claude Code session — new sessions
report in automatically. No live session handy? http://localhost:4242/?demo
runs a scripted day in the city. `agentopolis detach` removes the hooks (a backup
of settings.json is written on attach). Flags: `--repo`, `--port`, `--zone`.

**Movie mode** (`agentopolis movie [target]`) replays a repo's whole git history
as a city that grows and re-forms commit by commit. `target` is a local repo dir
or a public github url; github repos download only the minimum git data (a
`blob:none` clone removed right after seeding) and the city is held in memory
only. Run outside a git repo and agentopolis tells you how to point it at one
instead of opening a blank map.

**Crawl & marathon** scan a folder of repos. `agentopolis crawl <folder>` ranks
them by movie potential (formation ladder, history length, deletions). `agentopolis
marathon <folder>` then grabs every repo's movie and plays them best-first in one
auto-advancing reel with a selection bar to jump around — all local and offline,
and cached per repo+HEAD so the next run is instant. `--top N` caps the playlist.

**Zoning:** if the repo has a `.agentopolis.json` manifest it defines the city's
components, layers, and clouds (see `city/maisight.json` for a full example);
otherwise agentopolis auto-zones from the repo's top-level directories. For repo
hackers: `just dev` serves ../maisight with its manifest.

## How it works

```
Claude Code hooks ──curl──▶ POST /hook ──▶ normalize ──SSE──▶ canvas renderer
```

- `hooks.py` registers a `curl -m 1 ... || true` command on eight hook events
  (SessionStart, UserPromptSubmit, Notification, Pre/PostToolUse, Stop,
  SubagentStop, SessionEnd). It never blocks Claude Code — if the hotel isn't
  running, the curl times out silently.
- `server.py` (FastAPI) trims each payload to `{event, session, tool, detail}`
  (plus `agent_id`/`agent_type` for events fired inside subagents), keeps the
  last 100 events, and broadcasts over SSE — late-joining browsers get a replay.
- `static/render.js` + `static/hotel.js` draw the room and guests on a plain
  canvas — original pixel art, no Habbo assets. Subagent tool calls move their
  own guest, a pulsing gold aura marks a session waiting on you (permission or
  idle), and hovering a guest shows who they are and what they're doing.

## Known limits (v0)

- Front-facing avatars only; no directional sprites yet.
