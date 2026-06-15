# Proposal: Expanding the Building Vocabulary

Status: draft · Author: brainstorm w/ Claude · Date: 2026-06-15

## Summary

Agentopolis renders a repo as an isometric city. Today a building's appearance is
driven by two axes that already exist in the code. This proposal adds a richer
vocabulary of building *types* (university, bank, hospital, barracks, ruins, …)
by extending those two axes and introducing a third — **live activity** — without
inventing parallel machinery or hardcoding thresholds.

The goal is not "more sprites." It is to make the city more *legible* (you can read
what a building is for at a glance) and more *alive* (the city visibly reacts to
what the agent is doing right now).

## How classification works today

There are two independent axes, and the new types ride on both:

1. **District kind** — `zone.py:guess_kind()` maps a top-level directory name to a
   `kind`: `tests · infra · docs · api · storage · frontend · service · civic · auto`.
   The district's kind owns **color + dressing** (`b.arch = block.comp.kind`,
   `city-render.js:483`; kind-specific dressing drawn over the base box at
   `city-render.js:602`).

2. **File form** — `FORM` (`city-render.js:441`) maps a file extension to a
   *massing shape*: `house · shed · storefront · garage · silo`. Form owns the
   silhouette; `RANK`/`FCAP`/`FFOOT` own how tall/where it sorts.

So a building is already `(district kind) × (file form)`. A `.md` in `docs/` is a
`house` with `docs` dressing. The new types are mostly **new entries in these two
maps**, plus a small set of **state flags** the renderer already computes.

### State flags that already exist (reuse, don't rebuild)

`city-render.js` already derives repo-relative signals via the `q()` quantile helper
(`state.cuts`, `cuts`): `b.hub` (imports > 90th pct), `b.debt` (todos > 90th pct),
`b.billboard` (active third), and the **cemetery** for dead files (`addCemetery`,
graves with born/died). Several "health" building ideas are therefore *already
half-built* — they need a visual, not a new pipeline.

### Live activity already flows end-to-end (investigated 2026-06-15)

The Phase-2 "blocker" turned out to be mostly already solved. The pipeline is:
`hooks.py` forwards the **entire** Claude Code hook payload (`curl --data-binary @-`)
→ `server.py:normalize()` extracts structured fields → `/events` SSE → `city-live.js`
→ `City.applyEvent()`. The normalized event already carries everything the live
buildings need:

| Field | Source (`server.py`) | Consumed by renderer? |
|-------|----------------------|-----------------------|
| `event.path` (repo-relative) | `tool_input.file_path` minus `cwd` (`:112`) | **yes** — flags `scaffold` |
| `event.tool` | `tool_name` (`:98`) | **yes** — Edit/Write/NotebookEdit |
| `event.commit` | Bash w/ `git commit` (`:115`) | **yes** — "tops out" scaffolds |
| `event.agent_type` | `subagent_type` (`:118`) | **no — dropped** |
| `event.agent_name` | Task `description`, 40ch (`:119`) | **no — dropped** |
| `event.agent_id` | subagent-origin events (`:94`) | **no — dropped** |
| `SubagentStop` event | hook list (`hooks.py:18`) | **no — dropped** |

**Consequence:** construction-site is done; barracks is fully unblocked but unbuilt.
See the revised Tier-S notes and Phase 2 below.

## The three axes

| Axis | Source | Owns | Cost to extend |
|------|--------|------|----------------|
| **A. District kind** | directory name → `guess_kind` | color + dressing | low — add a `kind` + dressing branch |
| **B. File form** | extension → `FORM` | silhouette/massing | low — add a `FORM` entry + RANK/FCAP/FFOOT |
| **C. Live activity** | hook events (Edit, Task, tool calls) | transient overlays | high — needs event→tile wiring |

Most of the catalog below is A or B (cheap, static, "always works"). The two
highest-impact items (construction site, barracks) are axis C and carry the real
engineering.

## Building catalog

Tiers carried over from the impact/effort/difficulty/redundancy matrix.

### Tier S — build first

| Building | Axis | Maps to | Mechanism | Status / notes |
|----------|------|---------|-----------|----------------|
| **Construction site / crane** | C | file being edited *now* | `applyEvent` flags `b.scaffold` on Edit/Write/NotebookEdit; `addBuilding` spawns a lot for brand-new files; `git commit` "tops out" (+1 floor + `b.flash`) | **DONE** — already shipped. `drawScaffold` (`:835`), `drawFlash` (`:603`), tooltip "under construction" (`city-live.js:82`). No work needed. |
| **Barracks / guild hall** | C | subagent spawn | `server.normalize()` already emits `agent_type`/`agent_name`/`agent_id` + a `SubagentStop` event; `applyEvent` must consume them — light the barracks, march figures out, dim on `SubagentStop` | **UNBLOCKED, UNBUILT** — pure render-side work. The only true new build in Phase 2. Highest impact. |
| **Ruins / rubble** | A→state | dead/abandoned code | deleted-file path: `drawRuin` (`:544`) + `drawCollapse` (`:580`) + cemetery graves already exist. New work = the *abandoned-but-present* variant (high `age_days`, ~0 recent commits) for tracked files | **PARTLY DONE** — deleted-file husks exist. Net-new is only the stale-living variant; `ruins-end.png` already in tree. |
| **Bank / vault** | B | secrets, `.env`, keystores | new `FORM` rule keyed on basename (`.env`, `*.pem`, `*.key`, `secrets.*`) → windowless `vault` massing | High signal, near-zero cost. Basename match, not extension — small change to how `FORM` is looked up. |
| **Hospital / clinic** | A | `tests/` district | `tests` kind already exists; give it a clinic dressing + a **state hook**: failing-test signal (if available from a future test-run event) flips it to "ambulance lights" | Static dressing is free now; the live alert is a stretch (needs a test-result event source — see open Q3). |

### Tier A — static base-map vocabulary (one pass, shared machinery)

| Building | Axis | Maps to | Mechanism |
|----------|------|---------|-----------|
| **University / school** | A | `docs/` district | `docs` kind exists; swap generic dressing for a campus (quad + low halls). Campus footprint ∝ doc word-count. |
| **Library** | A | vendored deps (`node_modules`, `site-packages`, `vendor/`) | new `kind: vendor` in `guess_kind`; dense, uniform stacks — *imported*, not authored. |
| **Power plant** | B+centrality | entrypoint (`server.py`, `main.*`, `index.*`) | basename rule → `powerplant` massing; reuse `b.hub` (high import fan-in) to justify the "everything draws current" read. |
| **Town hall** | A | root config (`pyproject.toml`, `package.json`, `justfile`) | these land in the `commons`/`civic` district today; promote the governing config file to a hall form. Civic plaza already special-cased. |
| **Cathedral / monument** | B+state | the 1–2 hottest/biggest files | reuse `b.billboard` + top percentile of `loc`×`commits`; tallest spire = repo landmark. Must look distinct from power plant & town hall (see redundancy risk). |

These five share the *same* "add a `FORM`/`kind` entry + a dressing branch" change,
so the marginal cost per building after the first is small. Ship them together.

### Tier B — gated on harder inputs

| Building | Axis | Gate |
|----------|------|------|
| **Embassy** | C | external API / MCP calls — needs per-call event interception; partial data exists via `seed.py` cloud fingerprinting (deps→cloud client), so a *static* embassy district is feasible now; the *live* "doing business abroad" version is not. |
| **Factory / plant** | C | build output `dist/`, `build/` — static building is trivial (axis A); the smokestack-puffs-on-build animation needs a build event. |
| **Quarantine / hazmat** | A→state | reuse `b.debt` (todos>90th pct) for a first cut; true vuln/lint requires an external scan — out of scope for v1. |
| **Park / garden** | state | "clean code" is subjective and fights the no-magic-numbers rule. Defer until there's a principled repo-relative health metric. |
| **Museum / archive** | state | stale files (high `age_days`, low commits). Overlaps ruins — pick one semantics (museum = old-but-loved, ruins = abandoned) before building both. |

### Tier C — fold in or skip

- **Train station (git ops)** — redundant with the planned git-history time-lapse.
  Make commits/pushes a feature *of* the timelapse engine, not a standalone building.
- **Warehouse** — collapse into **Library** (both are "bulk non-source"); one
  `kind: vendor` covers deps + large data blobs.
- **Courthouse · Water tower · Watchtower** — low-signal single-file mappings; skip.

## Design rules (non-negotiable, from existing code + standing prefs)

1. **No magic numbers.** Every "big / hot / stale / central" threshold must derive
   from a repo-relative quantile via the existing `q()` helper and live in
   `state.cuts`. A cathedral is the 99th-percentile file *for this repo*, never
   `loc > 1000`. (Mirrors `no-magic-numbers-scale-relatively` memory.)
2. **Two axes stay orthogonal.** District kind owns **color**; file form owns
   **silhouette**. A bank in the `api` district is still api-colored. Don't let a
   new type hijack both axes unless it is genuinely one-of-a-kind (cathedral).
3. **Vocabulary scales with repo size.** Tiny repos already render as a farm
   village (`planVillage`). The downtown vocabulary (cathedral, embassy, power
   plant) should only appear above a repo-relative size — a hamlet has no embassy.
4. **Live overlays are transient, not structural.** Construction scaffolding and
   barracks activity are drawn as **props/overlays** on top of the base city
   (like the existing UFO/cars/graves), never by mutating the base building set.
   The city must look correct with zero live events.

## Redundancy hazard: the "important central building" cluster

Power plant, town hall, and cathedral all risk reading as "the big central one."
Disambiguate by **trigger** and **silhouette**, not just label:

- **Power plant** = high import fan-in (`b.hub`) — *functionally* central.
- **Town hall** = governing config file — *administratively* central.
- **Cathedral** = highest loc×commits — *historically* central (most worked-on).

If two of them collapse onto the same file, render only the highest-priority one.

## Phased build plan

**Phase 1 — static vocabulary (Tier A + bank + ruins).** One pass adding `FORM`
basename rules and `guess_kind` entries (`vendor`), plus dressing branches. No new
data pipeline; reuses `b.hub`/`b.debt`/cemetery. Lowest risk, immediate legibility win.

**Phase 2 — barracks (subagents).** Smaller than originally scoped: construction-site
is already shipped, so this phase is *one* building. No new data plumbing — the
fields (`agent_type`, `agent_name`, `agent_id`, `SubagentStop`) already arrive at
`city-live.js`. Work is entirely in `applyEvent` + a `drawBarracks`/figures overlay:
light the barracks on a `Task`/`Agent` tool event, march labeled figures out, dim
on the matching `SubagentStop`. Track active agents in `state` keyed by `agent_id`.

**Phase 3 — gated extras (embassy, factory live, hospital alerts).** Only after a
build-event / test-result event source exists. Static halves can ship in Phase 1.

## Open questions

1. ~~**Live event taxonomy** — is the SSE payload rich enough for an edited file
   path and a subagent label?~~ **RESOLVED 2026-06-15.** Yes. `normalize()` already
   emits `path`, `tool`, `commit`, `agent_type`, `agent_name`, `agent_id`, plus a
   `SubagentStop` event. Construction-site already consumes its share; barracks
   just needs to consume the agent fields. No server/hook changes required.
2. **Museum vs. ruins** — one stale-file semantic or two? Note ruins is now *three*
   states: deleted (graves/`drawRuin`, exists), collapsing (`drawCollapse`, exists),
   and abandoned-but-present (new). Decide whether "museum" adds a fourth or folds in.
3. **Hospital alerts** — there is currently no test pass/fail signal in the hook
   stream (`normalize()` reads tool inputs, not results). A live "ambulance" needs
   either a `PostToolUse` result parse for test commands or the user running tests
   through Agentopolis. Likely defer; ship static clinic dressing now.
4. **Sprite budget** — how many distinct massings can `drawBuilding` carry before
   the silhouette language gets noisy? Suggest capping the *downtown* vocabulary at
   ~6 recognizable forms and letting color (district kind) do the rest.
5. **Barracks placement** — is it a fixed civic building (one per city, in the
   plaza) or does it appear in the district whose files the subagent touches? Fixed
   is simpler and reads clearer; per-district is more informative but noisier.
