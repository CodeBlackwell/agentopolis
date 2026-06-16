# The Onboarding Tour

A self-contained, video-game-style guided tour that introduces a first-time
visitor to the interface. It darkens the screen, spotlights one element at a
time, and narrates each through a pixel **Chief of Staff** who addresses the
user as *His/Her Excellency, the Permanent Democratically Elected Supreme
President of the Nation of Agentopolis* — with tongue-in-cheek strongman-regime
patter.

Everything lives in **`static/tour.js`** (~400 lines). It injects its own CSS
and draws its own sprite; the only change to the shared shell is a single
`<script src="tour.js"></script>` tag in `static/index.html`. It depends on
nothing else and no other file imports from it.

---

## At a glance

| Aspect | Behavior |
|---|---|
| **Trigger** | Auto-runs once on first visit (per-browser `localStorage` flag); the ⭐ badge replays it anytime |
| **Mascot** | A hand-drawn pixel aide (peaked cap, gold sash, medals) — never a reused dispatch-floor avatar |
| **Spotlight** | One `#tour-hole` box with a screen-filling `box-shadow` scrim + gold outline |
| **Interaction** | A four-panel cutout leaves the spotlit element live so the user can poke it mid-tour |
| **Contexts** | Five: `nation`, `city`, `movie`, `demo-land`, `demo-cards` — the step list branches on context |
| **Cross-page** | Two tours chain across a navigation (live-city → movie; demo landing → forge result) |
| **Shell change** | One `<script>` tag; no markup added to any existing element |

---

## The five contexts

The interface shows different chrome depending on how the server rendered the
page, so the tour resolves a **context** at load and picks a matching step list.

```
const isMovie = a <script src="…city-timelapse.js"> tag is present
const demo    = document.body.dataset.demo === '1'        // the hosted showcase
const ctx = demo && isMovie ? (window.DEMO_MOVIE ? 'demo-land' : 'demo-cards')
          : isMovie ? 'movie'
          : document.body.dataset.mode                     // 'nation' | 'city'
```

| Context | When it's reached | Engine | Notes |
|---|---|---|---|
| `nation` | local multi-repo / `?nation` | `nation.js` | world→state→city tiers, field guide, forge |
| `city` | a single live repo | `city-live.js` | legend, dispatch floor, live event log |
| `movie` | `?timelapse` / a forge / replay | `city-timelapse.js` | the git-history time-lapse + transport bar |
| `demo-land` | hosted demo landing (`DEMO_MOVIE=1`) | `city-timelapse.js` | the auto-playing hero movie |
| `demo-cards` | a demo forge result (`DEMO_MOVIE=""`) | `city-timelapse.js` | where the explanation cards render |

`screeningRoom = ctx ∈ {movie, demo-land, demo-cards}` — the three movie-based
contexts where the visualization is the content (see *Undimmed screening room*).

> **Note:** in movie mode the body's `data-mode` is still `"city"`; the engine
> (`city-timelapse.js`) is what distinguishes a movie, hence the script-tag check.

---

## Triggering & lifecycle

Two `localStorage` keys drive the lifecycle:

| Key | Meaning |
|---|---|
| `agentopolis-tour-done` | The user has seen (or skipped) the tour — don't auto-run again |
| `agentopolis-tour-resume` | A handoff flag: the tour navigated to another page and should resume there |

At load:

```
if (ctx is 'movie' or 'demo-cards')        // resume-only pages
    if RESUME is set → consume it, start()
else if DONE is not set                     // nation / city / demo-land
    start()                                  // first visit
```

- The **⭐ badge** (bottom-left, always present) calls `start()` directly, so the
  tour is replayable at any time regardless of the flags.
- `end()` (Skip, the final "done ✓", or `Esc`) sets `DONE` and clears `RESUME`.
- A **forced** or **driven** step sets `DONE` the moment the user acts, so the
  just-seen portion never re-auto-runs after the page navigates.

---

## Step lists

Each context maps to an ordered array of step objects. A step targets one
element by id (or is a centered, target-less intro/close). Steps whose element
isn't on screen at run time are dropped (`ready()` filters by visibility), so
e.g. mobile-hidden transport selectors simply don't appear.

### `nation` (8 steps)
1. *(center)* — ⭐ The Nation of Agentopolis ⭐ — welcome
2. `#map` — Your glorious dominion — *try: drag, scroll, Q/E to spin*
3. `#tiers` — Chain of command (WORLD ▸ STATE ▸ CITY) — *try: click a province*
4. `#panel-guide` — Ministry briefing (field guide)
5. `#hotel` — The loyal workforce (dispatch floor) — *try: hover a worker*
6. `#ticker` — The State Record (event log)
7. `#forge` — The annexation office (paste a GitHub URL)
8. *(center)* — Long may you lead — close

### `city` (9 steps)
1. *(center)* — ⭐ `<CITY>` City ⭐ — welcome
2. `#map` — Survey your city — *try: drag, scroll, Q/E*
3. `#mapctl` — The royal controls (zoom/rotate/reset/share) — *try: zoom or spin*
4. `#legend` — Secrets of the skyline (symbol key)
5. `#city-shape` — Shape the skyline (building-shape toggle) — *try: change it, watch it re-shape*
6. `#hotel` — The dispatch floor — *try: hover an agent*
7. `#ticker` — The State Record (log)
8. `#replay` — **forced** — "press ▶ Replay History yourself" → navigates to the movie
9. *(center)* — Govern wisely — fallback close (only shown if `#replay` is absent)

### `movie` (9 steps) — resumes after the forced `#replay`
1. *(center)* — ⭐ The Founding, Replayed ⭐
2. `#tl-play` — Play & pause the chronicle — *try: press ▶*
3. `#tl-seek` — Scrub through the ages — *try: drag the scrubber*
4. `#tl-speed` — The pace of progress — *try: try 10×*
5. `#tl-trans` — Urban renewal, by decree (transition mode) — *try: pick a mode*
6. `#tl-shape` — Reshape every building (shape toggle) — *try: pick another mode*
7. `#explain` — The living dossier — *try: hover a card, watch the streets light up*
8. `#tl-exit` — Return to the present (■ live)
9. *(center)* — ⭐ Long Live the President ⭐ — close

### `demo-land` (6 steps) — the hosted demo's auto-playing hero movie
1. *(center)* — ⭐ Welcome to the Republic ⭐
2. `#map` — The founding, replayed — *try: drag, scroll, spin while it builds*
3. `#transport` — Your screening controls — *try: press play / drag the scrubber*
4. `#tl-shape` — Shape the skyline — *try: pick a mode*
5. `#hotel` — The tireless citizenry (agent-meme floor) — *try: hover a citizen*
6. `#forge` — A leader BUILDS — **driven**: types a URL into the forge, then navigates (see below)

### `demo-cards` (5 steps) — resumes on the demo forge result, where cards render
1. *(center)* — ⭐ A Territory Annexed ⭐
2. `#explain` — Your living war-room dossier — *try: read the cards, they refresh per commit*
3. `#explain` — The map answers to you (bi-directional hover) — *try: hover a card, watch the city pulse*
4. `#tl-exit` — Return to the present
5. *(center)* — ⭐ Now Go Build, President ⭐ — close

---

## Step object schema

```js
{
  // ---- targeting (exactly one of these) ----
  center: 1,               // centered, target-less card (intro / close)
  sel: '#id',              // CSS selector of the element to spotlight

  // ---- content ----
  title: 'Card heading',
  text:  'Dialogue, revealed with a typewriter effect.',
  try:   'go on — try it',  // optional; renders a gold "👆 …" hint on spotlight steps only

  // ---- forced step: the user must click the real element to proceed ----
  force: 1,                 // hides Next, shows the "press it ↑" nudge, arms a click listener

  // ---- driven step: the Next button performs a navigation ----
  nav:       '/?forge=…',   // where to go
  navLabel:  'annex it ▸',  // custom Next-button label
  resume:    'demo-cards',  // value written to the RESUME flag before navigating
  typeInto:  '#forge input',// optional: type into this input first…
  typeUrl:   'https://…',   // …this string, character by character, then navigate
}
```

---

## Overlay anatomy

`build()` creates the DOM once and stamps the CSS. Z-order matters:

| Element | z | pointer-events | Role |
|---|---|---|---|
| `#tour-badge` | 30 | auto | ⭐ replay button, bottom-left |
| `#tour-block` | 40 | **none** | container (does not block by itself) |
| `.tour-mask` ×4 | 40 | **auto** | the cutout — these are what actually block clicks |
| `#tour-hole` | 41 | none | the visual spotlight: gold border + glow + the dark scrim (via `box-shadow`) |
| `#tour-card` | 42 | auto | sprite + dialogue + Skip/Back/Next, the "👆 try" callout, the dots |

The **darkening** comes from the hole's `box-shadow: 0 0 0 9999px rgba(…)` —
a 9999px-spread shadow fills everything except the hole's own rect. The
**click-blocking** is a separate concern handled by the four mask panels. They
use the same geometry, so the bright/interactive region always equals the
spotlit element.

### Hole states

| Class | Used by | Appearance |
|---|---|---|
| `''` (none) | spotlight steps | element framed; dark wash + gold glow |
| `.scrim` | center steps & the opening | 0×0 box at screen center → shadow fills the whole screen, no cutout |
| `.force` | forced steps | a pulsing gold glow to draw the click |

---

## Instant overlay on load

To avoid a flash of the full, busy interface, the overlay appears **the instant
the tour decides to run** — there is no start delay. This is done by splitting
the entry into a synchronous shell and an async finish:

```
start()  (sync)   →  show #tour-block, scrim() (full dim), maskFull() (block all),
                     hide the card, then call ready()
ready()  (async)  →  await #transport / #explain for movie contexts,
                     filter steps by on-screen visibility,
                     reveal the card, show(0)
```

So `nation`/`city` (no async wait) get the scrim *and* the intro essentially
instantly; `movie`/`demo` show the scrim immediately and reveal the intro card
once the transport bar / dossier has been built. While the card is hidden, an
`active()` guard ignores keyboard and resize events.

---

## Mid-tour interaction (the cutout)

On a spotlight step, the four `.tour-mask` panels frame the element — top,
bottom, left, right — leaving its rect open. Because `#tour-block` is
`pointer-events: none` and the panels are `pointer-events: auto`, **only the
spotlit element receives clicks/drags/hovers; everything else is blocked.** So
the user can pan the map, flip the shape toggle, scrub the movie, or hover the
explanation cards *while that very element is being explained* — and can't
accidentally click something else and derail the tour.

- `mask(hx, hy, hw, hh)` positions the four panels around the hole rect (all
  dimensions clamped to ≥ 0 so an edge-flush element can't produce negatives).
- `maskFull()` collapses three panels and stretches one over the whole screen —
  used for center/intro/close steps and the opening scrim (block everything).
- Steps carry an optional `try` string, rendered as a gold **"👆 …"** callout
  under the dialogue, to *encourage* the interaction. It only shows on spotlight
  steps (never on center steps).

---

## Undimmed screening room

In the three movie-based contexts the visualization *is* the content — a city
building itself — so washing it dark would defeat the point. Those contexts get
a `nodim` class on `#tour-block`, which suppresses the dark `box-shadow`
everywhere:

- the opening scrim and center steps → no dim at all (the card floats over the
  playing movie);
- spotlight steps → the element is shown by its **gold outline + glow alone**,
  with no dark wash, so the rest of the city stays fully visible;
- the four-panel cutout still gates interaction exactly as elsewhere.

`nation` and `city` keep the normal dimming — they have static panels where
focusing attention is worth the dim.

---

## Forced & driven steps (cross-page handoffs)

Two tours span a page navigation, using the resume flag to continue on the other
side.

**Forced step — live city → movie.** The `city` tour's last interactive step
(`#replay`) is `force: 1`: Next is hidden, a pulsing "press it ↑" nudge shows,
and only the real Replay button advances. `arm()` attaches a one-shot capture
listener that sets `RESUME` + `DONE` *before* the button's own navigation fires.
The page lands on `?timelapse` (a `movie`), which resumes the `movie` list.

**Driven step — demo landing → forge result.** The `demo-land` tour's last step
(`#forge`) is a *driven* step. Clicking **"annex it ▸"** calls `driveType()`,
which:
1. types the GitHub URL into the real `#forge` input, ~45ms/char (the button
   reads "annexing…", Back hides) — demonstrating the build gesture;
2. after a beat, sets `RESUME='demo-cards'` + `DONE` and navigates to
   `/?forge=…`.

The forge result page is a `demo-cards` context (a normal movie, so its
`#explain` dossier renders — unlike the demo landing, where `DEMO_MOVIE` swaps
the dossier for the scurrying-agent meme). The tour resumes there and explains
the explanation cards.

---

## The Chief of Staff sprite

`drawAide(canvas)` paints the mascot from scratch into a 36×46 grid, scaled ×3
with `image-rendering: pixelated`. It is **not** a reused dispatch-floor avatar —
it's a dedicated, over-decorated aide: peaked cap with a gold badge, gold sash,
breast medal, epaulettes, white gloves, gold-striped trousers, and a mustache.
A gentle CSS `tour-bob` animation makes it idle-bob beside the dialogue.

---

## Controls

| Input | Action |
|---|---|
| **Next ▸ / → / Enter** | advance (or finish the typewriter first); hidden on forced steps |
| **Back** | previous step (hidden on the first) |
| **Skip tour** | end immediately, set `DONE` |
| **Esc** | end |
| **← (Arrow Left)** | previous step |
| **⭐ badge** | replay this context's tour |
| window **resize** | re-frames the current step |

Keyboard and resize are ignored while the opening scrim is up (card hidden).

---

## Extending the tour

- **Add a step:** push a step object into the relevant context array. Spotlight a
  new element by `sel`; add a `try` line if it's interactive. No other wiring is
  needed — `ready()` filters it out automatically if the element is absent.
- **Add a context:** add a `LISTS` entry and extend the `ctx` resolution + the
  trigger block. If its elements load asynchronously, add a `waitFor(...)` in
  `ready()` (as `#transport`/`#explain` do).
- **A new cross-page hand-off:** use a `force` step (user clicks a real control)
  or a `nav`/`typeInto` driven step (the tour navigates), setting `resume` to the
  target context; have that context resume on the `RESUME` flag.

The tour never reads from or writes to app state beyond the two `localStorage`
keys, and only ever *reads* element geometry — so adding or moving UI elements
can't break it as long as the targeted ids still exist.
