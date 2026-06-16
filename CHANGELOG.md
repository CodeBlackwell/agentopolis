# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Viral-loop funnel counters now persist across restarts (`AGENTOPOLIS_STATS_FILE`)
  instead of resetting on every redeploy, and `/stats` can be locked behind
  `AGENTOPOLIS_STATS_TOKEN` on the public demo. Copying an install command now
  records a web→install conversion (`/e/install`).
- `/health` liveness endpoint, a Docker `HEALTHCHECK`, and a scheduled GitHub Action
  that alerts if the live demo stops responding.
- CI release pipeline: pushing a `v*` tag (via `just release X.Y.Z`) publishes to PyPI
  (Trusted Publishing), syncs the Homebrew tap, and redeploys the demo. `just pypi-stats`
  reports recent download counts.

## [0.13.0] - 2026-06-16

### Added
- Forging a github url into a movie now streams live clone progress: a pixel
  hard-hat worker raises the city over a real progress bar fed by `git`'s own
  receiving/resolving percentages, instead of a frozen "building…" message. The
  endpoint became a tiny NDJSON stream — progress lines, then the finished
  `{data, timeline}` bundle (cache hits send the bundle alone, instantly).

### Fixed
- Forging a movie from a github url was ~6x slower than it needed to be (≈64s →
  ≈11s on a 7k-commit repo). The time-lapse's history walk uses `-M` rename
  detection so a file's lineage folds onto one building across moves — but `-M`
  needs file *contents*, and on a `blob:none` partial clone git refetched those
  blobs over the network one batch at a time (≈56s of the total, ~82%). The forge
  now does a full clone — git's own parallel packfile download — so the rename
  walk reads everything locally (≈0.4s). Exact renames are unchanged. (A
  hand-rolled parallel chunked walk was prototyped and measured too; git's native
  clone beat it outright, so it wasn't shipped.)

## [0.12.0] - 2026-06-16

### Added
- An onboarding tour — a first-visit guided walkthrough led by a pixel "Chief of
  Staff" who spotlights one part of the interface at a time and addresses you as
  the Permanent Democratically Elected Supreme President. It branches across all
  five views (the nation map, a live city, the time-lapse movie, and the hosted
  demo's landing + forge result), lets you interact with each highlighted element
  while it's explained, and replays anytime from a ⭐ badge. The overlay appears
  instantly to focus attention, and never dims the movie views (where the
  visualization is the content). Self-contained in `static/tour.js`; see
  [docs/tour.md](docs/tour.md) for the full reference.
- Hosted-demo install funnel: `brew` and `pip` install badges plus a "run it
  locally — 1 · 2 · 3" accordion, all click-to-copy.

### Changed
- The hosted demo's dispatch floor now runs a busier interleaved multi-agent
  stream (4–5 subagents cycling through the door) so the floor scurries while the
  city builds, and the demo's "paste a github url" forge box moved into the
  header column.

## [0.11.1] - 2026-06-16

### Fixed
- On the hosted demo, the "paste a github url" forge box and the movie transport
  bar both sat at the bottom-center and overlapped. The forge box now floats to
  the top while a movie plays, so the transport owns the bottom strip cleanly.

## [0.11.0] - 2026-06-16

### Added
- `agentopolis marathon [folder]` — grab every repo's movie under a folder (and
  one level of subrepos) and play them best-first in one auto-advancing reel,
  with a selection bar to jump between them. Fully local and offline; each movie
  bundle is cached per repo + HEAD so re-runs are instant, and `--top N` caps the
  playlist.

## [0.10.0] - 2026-06-16

### Added
- `agentopolis movie [target]` — replay any repo's git history as a growing city
  straight from the CLI. `target` is a local repo dir or a public github url; with
  no target it plays the current repo. GitHub urls download only the minimum git
  data (a `blob:none` clone into a temp dir, removed right after seeding) and the
  city is held in memory only — nothing is persisted to disk.
- A friendly note instead of a blank city when agentopolis is run outside a git
  repo, on a repo with no commits, or with `--root` over a folder containing no
  git repos — each with the relevant next step.
- `agentopolis crawl [folder]` — scan a folder of git repos (and one level of
  subrepos, e.g. a mono-repo's packages) and rank them by time-lapse "movie"
  potential. Reports each repo's full formation ladder (`village → radial →
  spine → grid`) and transition count, ported from the renderer's epoch
  detection and validated to match the live engine. `--json` for machine output.
- Stage-keyed passive ambient life, each tied to a repo-relative signal and shown
  only when that signal is present: pedestrians (∝ district recency), traffic that
  drives multi-turn routes on paved roads (∝ commit volume), a plaza fountain whose
  spray scales with hub dominance, market stalls, canal boats, downtown crosswalks
  and steam vents, and graveyard crows.
- Movie explanation box: "badge" cards explaining the ambient life (Street Life,
  Market, Canal Traffic), and a persistent **Re-Formed** card that records each
  formation transition with the exact commit and the threshold it crossed.

### Changed
- The freight rail line now joins the city with a grass verge instead of floating
  over a gap.

### Fixed
- Movie stat-card values were near-invisible (plum on plum) — now cream.

## [0.9.0] - 2026-06-16

### Added
- Gravel ballast bed beneath the freight rail line — brown dirt with scattered
  gray rocks — so the track sits on the ground instead of floating over the sky
  (both the static city and the time-lapse).

### Changed
- Forged repos load their time-lapse much faster: the server now does a single
  git-history walk (the timeline) instead of four. The movie derives each
  building's commit count, coupling/centrality, and dead-file ruins client-side
  from the timeline it already loads, so the HEAD seed skips the per-file history
  walk entirely.
- Commit history is log-scale decimated for large repos: dense modify-only runs
  are thinned by a factor that grows with the order of magnitude of the commit
  count, while every birth/death/rename and the HEAD state are kept. Small repos
  are untouched; huge repos get a lighter payload with no fixed cap.
- Huge repos degrade gracefully instead of returning a blank page — files and
  buildings are sampled to a budget (ranked by activity and mass) and the trimmed
  count is surfaced in the field guide.
- Cemetery headstones are heavily log-scaled on the canvas so a churny repo's
  graveyard no longer dwarfs the city; the headstone tooltip still lists every
  deleted file accurately.

### Fixed
- The city hall no longer paints over the buildings standing in front of it. It
  was always drawn last, on top of every building; it now takes its place in the
  painter's-order sort (by its front footprint corner), so closer buildings
  correctly overlap it in every formation.

## [0.8.0] - 2026-06-15

### Added
- **Git-history time-lapse** (`?timelapse`, and forged repos by default): replay
  a repo's history as a city that climbs the formation ladder — village →
  radial / spine → grid — as it grows past structural thresholds, instead of
  filling in one static layout. Small repos stay a village the whole way;
  "born big" repos start at their settled formation.
- Incremental demolish-and-rebuild transitions between formations, with three
  switchable styles (hybrid / slide / rebuild) in the transport bar, plus
  ground and dressing cross-fades so a re-form reads as continuous growth.
- Village dressing survives the climb: the well becomes a fountain, the herd a
  city farm (barn + silo), and the windmill + water tower persist as relics —
  migrating to a stable outskirts edge each time the city re-forms.

### Changed
- The time-lapse no longer fills in a single EvoStreets layout; EvoStreets
  remains available only as the static `?plan=evostreets` option.

### Fixed
- No second ground-up rebuild of every building after a formation transition.
- Storage-tank rooftops no longer throw on certain camera rotations
  (negative ellipse radius).

## [0.7.0] - 2026-06-14

### Added
- Small / simple repos now render as a **village**: a green commons with the
  town hall and a well at its heart, neighborhoods arranged in a rosette with
  dirt lanes as spokes, and a few taller cottages with warm-lit windows.
- Farm life around the village: a fenced cattle paddock (cows in an organic
  spread, with a UFO buzzing in circles overhead), a hay field, an animated
  windmill, and a water-tower landmark.
- `just town [repo]` recipe: serve a single repo as a city (small ones render
  as a village) on :4243 with hot reload.

### Changed
- Street planning: every block now carves back-alleys so no building is
  landlocked — each one has a street or open ground on at least one side.

### Fixed
- `just dev` / `just town` hung on Ctrl+C while a browser held the `/events`
  SSE stream open. Streams now end on client disconnect / lifespan shutdown,
  and the recipes set a graceful-shutdown timeout as the backstop.

## [0.6.0] - 2026-06-13

### Changed
- Renamed the project from Botapest to **Agentopolis**. The CLI is now
  `agentopolis`, the PyPI package is `agentopolis`, the zoning manifests are
  `.agentopolis.json` / `.agentopolis-nation.json`, and the dev env vars are
  `AGENTOPOLIS_*`. Re-run `agentopolis attach` after upgrading.

## [0.5.0] - 2026-06-13

### Added
- Single-view dashboard combining the city map and the dispatch floor on one page,
  with eighth-turn rotation and pan/zoom on the main page.
- Dispatch room reimagined as a zoomed city-hall interior with departmental
  stations — Information, Records, Operations, Permits & Works, and Switchboard.
- Hover tooltips on the freight train, container ships, and the package track;
  hovering the track lists every package dependency.
- Dynamic district color key and a cloud-services section in the legend.
- Automatic cloud-provider detection from dependencies and config files
  (AWS, GCP, Azure, Cloudflare, Stripe, OpenAI, Anthropic, GitHub Actions,
  Terraform, and more), each tethered to the district that uses it.
- Rotate / zoom / reset controls panel in the top-right of both the main map and
  the standalone `city.html` explorer.

## [0.4.0] - 2026-06-12

### Added
- Diamond-ring radial city layout: concentric district rings around a civic plaza,
  canals between layers, a radial street grid, a freight train, and rotation.

## [0.3.1] - 2026-06-12

### Added
- Organic, structure-driven layout with repo-relative thresholds.
- River with bridges, package freight line, docker port, and a cemetery for
  deleted files.

## [0.3.0] - 2026-06-12

### Added
- Organic blocks: carved edge lots and per-lot building jitter.

### Fixed
- Quieter exit on Ctrl+C.

## [0.2.1] - 2026-06-12

### Added
- Kind-based building archetypes, language signs, and an isometric city hall.
- GitHub repository linked in the package metadata.

### Fixed
- Ctrl+C hung while browsers held SSE streams open.

## [0.2.0] - 2026-06-12

### Added
- Installable `botapest` CLI, published to PyPI.
- Auto-free the port on startup.

## [0.1.0] - 2026-06-12

### Added
- Initial release: The Grand Botapest Hotel — a Habbo-style visualizer for Claude
  Code agents, with subagent attribution, replay, waiting aura, and tooltips.
- Botapest City prototype: an architecture skyline generated from a git repo.
- Combined dispatch floor and live skyline, with a continuous cityscape and
  waterfront.
