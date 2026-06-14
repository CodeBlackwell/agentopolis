# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
