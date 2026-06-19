# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.23.0] - 2026-06-18

### Changed
- The movie's legend cards now describe **this** repo instead of static per-kind labels: each district
  card names what it actually holds (`mostly Python`, `JS & CSS`) and calls out a clear lead file when
  one stands out, while staying glanceable — the deeper "why" stays one hover away in the tooltip.
- Normalized the history walk to ~30s (was ~45s) regardless of repo size — a calmer, quicker reel.

### Added
- A **Building Shapes** legend card that reads the live skyline under the active shape rule (language by
  default, or size / age / rarity), and re-renders the moment you switch the dropdown — even when paused.
- An **Anatomy of a Building** card that fully decodes one real landmark (the tallest tower), with hover
  highlighting it white on the map.
- Hovering a legend card now flips it to a black-&-white palette (alongside the existing raise + outline)
  to echo the white-recoloured building it points at — card and building light up together.

## [0.22.0] - 2026-06-18

### Changed
- Sharing a movie now cards the **finished** city: opening Share snaps the reel to its completed build
  (silently, waiting briefly if it's still loading) before capturing the still, so a link shared
  mid-replay never unfurls a half-built skyline.

### Added
- Pre-warm the og:video so shared links unfurl with inline playback without waiting for a viewer to
  render a clip. The demo landing is warmed server-side post-deploy (`just prewarm` / the release
  deploy job headless-records its build and uploads it). Forge links warm themselves: a movie viewer's
  natural first playthrough is captured in the background (no replay, no end-card) and cached once —
  gated to fire at most once, only for shareable cities, and only when the server reports it isn't
  cached yet (`window.OG_VIDEO_WARM`). Best-effort: a forge link warms when its movie actually plays.

## [0.21.0] - 2026-06-18

### Added
- Click or tap a building in the city/movie views to highlight it (recoloured white, the same focus
  mechanic the movie's explanation cards use) and pin its tooltip.
- "Download movie" in the Share menu (movie view) — saves the build as a video file (e.g. to upload
  natively to LinkedIn, where link unfurls don't autoplay). Renamed from "download clip".
- Shared links now unfurl with an inline-playing build clip (`og:video`) on Discord, iMessage,
  Telegram, Slack, and Facebook. Downloading the movie (or sharing it) uploads the clip; the server
  transcodes it to a streaming H.264 mp4 (ffmpeg) and caches it per repo, served with HTTP Range
  support. Falls back to the still-image card where ffmpeg is absent or the platform ignores og:video.

### Changed
- Onboarding tour dialogue now reads one sentence per line for clearer pacing.

### Fixed
- Onboarding tour no longer prompts you to hover/tap a worker to inspect it — there is no
  inspect-a-worker feature.
- Mobile "build a city" CTA now sticks flush to the bottom of the screen in movie mode (it was
  floating above where the transport bar used to be pinned, before the floor became scrollable).
- Mobile "Now Playing" card holds a fixed size as the reel plays, instead of jumping each time the
  commit subject wraps to a different number of lines.

## [0.20.0] - 2026-06-16

### Added
- `agentopolis <path>` — a bare path now serves that repo's city directly (no `--repo` needed).
- `agentopolis --version` prints the installed version.
- `agentopolis marathon --list` ranks a folder's repos as a table (add `--json` for JSON).

### Changed
- The live city now auto-attaches Claude Code hooks for the run and detaches on exit (unless
  you've attached them for good with `agentopolis attach`) — so a Claude Code session reports
  to the floor with zero setup. The old `agentopolis .` one-shot is folded into the default.
- Mobile dispatch floor: a one-finger drag now scrolls the page instead of panning the floor;
  pinch still zooms it.

### Removed
- `agentopolis crawl` — replaced by `agentopolis marathon --list`.
- `agentopolis .` — the default `agentopolis` now does the same zero-setup auto-hook run.

## [0.19.0] - 2026-06-16

### Added
- Custom isometric-skyline favicon (gold-on-plum, matching the brand) replaces the bell emoji.
- Onboarding tour: the city and nation "survey the map" steps are now a hands-on gate — the
  tour won't advance until you zoom in, pan, then press reset (works on desktop wheel/drag and
  phone pinch/swipe, shown as a live `zoom in ✓ · now pan ✓ · press reset` checklist).

### Changed
- Mobile: the page now scrolls — the map keeps its ~60vh slice while the dispatch dock grows
  past the fold, so the whole page is reachable. The stats + build buttons stay pinned.
- Dispatch floor: ephemeral agent dialogue now draws on top of the static district placards,
  so a name label no longer hides what an agent is saying.
- Demo dispatch floor now tracks the reel's transport as three states: **play** → speedy
  agents, **pause** → frozen floor (agents hold still, no new work), **complete** → normal
  calm cadence. Fixes the permanently-frantic, never-pausing look on the landing.

## [0.18.1] - 2026-06-16

### Changed
- Demo-land tour now frames the showcase as a live demonstration of the tool and explains,
  in character, that it hooks into your own Claude Code so your real agents appear on the floor.
- Social-card titles: the showcase landing now reads "Agentopolis — Your Codebase as a
  living isometric city"; a forge link reads "&lt;repo&gt; — reanimated as a living
  isometric city" (was "… — a codebase as a living isometric city").

### Fixed
- Tour no longer crashes on a first visit to the movie/landing: `movieRewindForTour()` is
  now a no-op until the reel has loaded, so the auto-run tour shows instead of aborting.
- The showcase agent-meme dispatch floor (and its action log) now animates on localhost
  (`just landing`), matching the hosted demo, instead of staying frozen.

### Added
- Demo-land tour gained steps for the dispatch floor (the speedy agents) and the agent
  actions log (the State Record).

## [0.18.0] - 2026-06-16

### Added
- Mobile: tap a dossier legend card in the movie to pin its highlight (and hold the reel
  for inspection); tap it again, press play/pause, or touch the map to release.

### Changed
- Onboarding tour now opens the movie/landing on the **finished** city, paused, instead of
  a frantic auto-playing reel. The first movie step forces a "press ▶" control that replays
  the history from the first commit. Pausing the reel also calms the dispatch-floor meme.
  Returning visitors and embeds still autoplay.
- Showcase demo is rebranded **"Agentopolis"** in the page title and social card (it was
  named after the repo it's built from), and the demo capital is now **MethodProof**.
- Social share image (`og-image.png`) refreshed to the current branded landing.

## [0.17.0] - 2026-06-16

### Changed
- Demo/app header box (title, hints, forge input, install badges, run-locally accordion)
  is scaled down ~20% so it occupies less of the map canvas.
- Mobile map controls: the on-screen zoom buttons are replaced by the rotate buttons
  (pinch already zooms; the two-finger twist is the awkward gesture), and the control
  panel is scaled down 40%.
- Movie transport bar: emoji/plain-triangle controls replaced with crisp SVG play /
  pause / chapter icons; the scrubber is restyled with a square gold thumb; the speed /
  transition / shape pickers are now fully themed custom dropdowns (the native macOS
  select popup couldn't be themed). The live-exit button is renamed to "Exit" with a
  styled tooltip naming the city it returns to, and is hidden on the public demo (the
  "build your own" CTA and nation link already cover leaving the movie there).

### Fixed
- Mobile ribbon-cut: the forge input is 16px so iOS no longer auto-zooms on focus and
  hides the GitHub URL being typed during the scripted demo.

### Removed
- Onboarding tour step that claimed you could tap & hold a citizen to read its labor —
  that interaction does not exist.

## [0.16.0] - 2026-06-16

### Added
- `agentopolis .` — a zero-setup one-shot: it attaches the Claude Code hooks on start
  and removes them again on exit (Ctrl+C), so no separate `attach`/`detach` step is
  needed for a quick session. It only detaches hooks it added itself, so a prior manual
  `agentopolis attach` is left untouched.

### Fixed
- Mobile demo: the "+ build a city" CTA was painted on top of the movie transport bar,
  leaving the play / scrub controls unreachable — it now sits above the transport so both
  are fully tappable.
- Mobile demo: the movie "■ live" exit button no longer clips off the right edge of the
  transport bar on narrow screens (the scrubber track kept a desktop min-width).
- Onboarding tour on phones: the "cut the ribbon" climax step targets the forge input,
  which lives in a closed bottom sheet — the tour now opens the sheet first so the typed
  URL and button are on screen instead of below the fold.
- Movie date stamp is right-anchored to the canvas edge so it no longer overlaps the
  city title.

### Changed
- Onboarding tour text adapts to touch: scroll/Q-E/spacebar/arrow/click/hover instructions
  are rewritten to the phone gestures the canvases actually use (pinch, two-finger twist,
  tap, tap & hold) on coarse-pointer devices.
- The tour "skip tour" control is now a clearly-bordered button (with an ✕ glyph) instead
  of a faint borderless label, so it reads as a dismiss affordance.
- Mobile demo header: the "explore the BLACKBOX nation" banner is constrained to a single
  line so it clears the city's canvas labels.
- Map control panel (`#mapctl`) polish: icon buttons are flex-centered at a larger glyph
  size; RESET / SHARE are full-width text bars with proper padding; the Share arrow no
  longer wraps onto its own line.

## [0.15.0] - 2026-06-16

### Fixed
- Share button now opens a destination menu (native share sheet where supported, plus
  X / LinkedIn / Reddit / Hacker News web-intents, copy link, download image, and — in a
  movie — download clip) instead of immediately recording a clip. Clip recording is now
  an explicit, opt-in menu choice; opening the menu only warms the unfurl card.
- Onboarding tour on the hosted demo: the screening-room (auto-playing movie) context
  now applies a soft dim + spotlight instead of running fully undimmed, restoring the
  dim-and-focus effect; the farewell beat keeps its full dim.

### Changed
- Public-repo hardening: removed a private project's manifest/architecture (replaced
  with a generic `city/example.json`) and other non-generalizable references; the
  deploy host is now read from `$AGENTOPOLIS_DEPLOY_HOST` / a CI secret instead of
  being hardcoded in the workflow and justfile.

## [0.14.0] - 2026-06-16

### Added
- Share-loop growth features turning the share mechanics into a measurable loop:
  - Clean canonical `/c/owner/repo` URLs that shared links unfurl and read as.
  - Repo-specific social card (`/og-card`) so a forge link unfurls named even before
    its skyline is captured; enriches with file/district/line stats once built
    (optional Pillow via `.[card]`; the CLI install stays at two deps).
  - A branded end-card baked into the shared time-lapse clip, so the canonical link
    rides in the pixels and survives platforms that strip outbound URLs.
  - Curiosity-gap share caption naming the repo and its headline stat.
  - Forge funnel now nudges the visitor's own repo; desktop share offers a prefilled
    X compose + asset download; a "this is what you'll post" preview before posting.
  - Optional Twitter player card (`AGENTOPOLIS_PLAYER_CARD`) plus a chromeless
    `/player/owner/repo` embed of the live build movie.
- Viral-loop funnel counters now persist across restarts (`AGENTOPOLIS_STATS_FILE`)
  instead of resetting on every redeploy, and `/stats` can be locked behind
  `AGENTOPOLIS_STATS_TOKEN` on the public demo. Copying an install command now
  records a web→install conversion (`/e/install`).
- `/health` liveness endpoint, a Docker `HEALTHCHECK`, and a scheduled GitHub Action
  that alerts if the live demo stops responding.
- CI release pipeline: pushing a `v*` tag (via `just release X.Y.Z`) publishes to PyPI
  (Trusted Publishing), syncs the Homebrew tap, and redeploys the demo. `just pypi-stats`
  reports recent download counts.
- Test suite (`just test`): functional backend tests + Playwright UI tests covering
  the share-loop features.

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
