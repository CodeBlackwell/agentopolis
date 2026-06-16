# Plan: Mobile-First Interface & the Virality Loop

Status: draft · Author: brainstorm w/ Claude · Date: 2026-06-16

## Summary

Agentopolis renders a repo as a living isometric city. The desktop experience is
mature; the mobile experience is a *shrunk desktop* — the same operator console
(zoom/rotate buttons, side rail, dispatch dock) squeezed under one `@media
(max-width: 720px)` block. This plan reframes mobile around a different
job-to-be-done and lays out the UX work needed to make the app **spread on its
own** when someone opens a shared link on a phone.

The core thesis: **mobile users have a different job than desktop users.**

- **Desktop user = operator.** They run Claude Code, watching *their own* agents
  work the dispatch floor. They want the full HUD.
- **Mobile user = visitor + forger + sharer.** They almost never run agents on a
  phone. They arrive via a shared link, paste a GitHub repo to watch it become a
  city, and share the result.

So mobile should not be a shrunk console — it should be a **forge-and-share
funnel** wrapped around a full-bleed canvas. Once you accept that, ~70% of the
desktop chrome *disappears* on mobile rather than getting responsively resized.
That is both the minimalist win and the UX win.

## The viral loop (the whole design, in one diagram)

```
shared link  ──►  LAND: full-bleed living city, autoplays the build
                  (no controls, no config — just the wow, with a caption
                   "facebook/react as a city")
                        │
                        ▼
                  ONE thumb CTA: "Build your own →"
                        │
                        ▼
                  FORGE: paste/pick a repo (clipboard auto-detect +
                  tappable example chips), watch it assemble — the dopamine
                        │
                        ▼
                  SHARE: auto-rendered looping clip + OG-rich link,
                  one tap → native share sheet
                        │
                        └──────────► lands on the next person's phone (LAND)
```

The app today owns the **middle** of this loop (forge exists via `/forge?url=`,
the city renders) but is missing **both ends** — the parts that make it spread.

## Status

| # | Step | State |
|---|------|-------|
| 1 | Responsive canvas + gestures (foundation) | **done** (`autosizeCanvas`) |
| 2 | Forge-and-share funnel UI | **done** — 2a–2e shipped 2026-06-16 |
| 3a | Share loop — snapshot + `navigator.share` + OG warm | **done** — `static/share.js` (parallel session) |
| 3b | Share loop — looping **video** clip (`MediaRecorder`) | **done** — `window.recordTimelapseClip` + share.js movie branch |
| 4 | OG-image unfurling per forged repo | **done** — server `root()` dynamic OG + `/og/<hash>.png` |
| 5 | Autoplay-the-wow on cold load | **done** — forge defaults to the movie; reduced-motion guard added |

**The build track from this plan is complete.** Every step (1, 2a–2e, 3a, 3b,
4, 5) has shipped and been verified on real phone viewports.

### What landed (commits, 2026-06-16)

- **Step 2:** `1b20fa9` two-finger twist + strip rotate buttons + touch in the
  movie · `d09767b` bottom sheet · `ad37fd2` forge funnel (CTA + chips +
  clipboard) · `f3a6234` transport bar tightened for phones.
- **Step 5:** `1fa993f` `prefers-reduced-motion` guard on forge cold-load. The
  auto-play itself was already wired server-side (`server.py:root()` defaults a
  `?forge=` link to the movie engine).
- **Steps 3a + 4** were delivered by the parallel showcase session in
  `static/share.js` + `server.py` (per-repo OG capture → `/og`, dynamic
  `_og_block`). This plan's Step 4 section below is superseded by that.

### Step 1 — Responsive canvas (shipped 2026-06-16)

The `#map` backing store was fixed at `1280×720` and CSS letterbox-fit it; on a
portrait phone the city rendered as a short landscape band with dead bars. Fixed
by `autosizeCanvas()` (`static/touch.js`), which sizes the backing store to
`clientBox × devicePixelRatio` (DPR capped at 2) and re-fits the camera on every
resize via `ResizeObserver`. Wired into all three `#map` engines
(`city-live.js`, `nation.js`, `city-timelapse.js`); `#map` now fills its frame
(`static/index.html` `#map { width:100%; height:100% }`). `#hotel` was left
alone — its dispatch-floor render hardcodes `OX=640` around a fixed 1280×640
design space (`static/render.js:2`), so resizing it would off-center the floor.

Verified at 390×844 (portrait), live orientation flip to 844×390, desktop, and
time-lapse mode — backing store tracks the box and the city re-fits in every
case.

---

## Step 2 — Forge-and-share funnel UI

**Goal:** make the phone shell a single-purpose funnel: a full-bleed canvas, one
obvious primary action, and native-feeling controls — instead of a desktop HUD
in miniature.

### 2a. Replace the side-drawer with a bottom sheet

Today the rail (legend / stats / event ticker) slides in from the **right**
(`#side` at `static/index.html`, the `@media (max-width:720px)` block:
`position:fixed; right:0; transform:translateX(100%)`), toggled by `#drawer-btn`
and the JS that relocates `#ticker` into it
(`static/index.html` bottom `<script>` IIFE). A right-side drawer is a desktop
mental model.

- Convert `#side` on mobile to a **bottom sheet**: anchored to the bottom edge,
  default peek height ~`38vh`, swipe-up to expand, swipe-down / scrim-tap to
  dismiss. Thumb-reachable, the native iOS/Android idiom.
- Reuse the existing `#scrim` element and the relocate-`#ticker` IIFE; only the
  transform axis (Y instead of X) and the drag handle change.
- Add a small grab-handle affordance at the top of the sheet.

**Files:** `static/index.html` (CSS `@media` block + the drawer IIFE).
**Acceptance:** sheet peeks from bottom, swipe gestures open/close it, legend +
ticker live inside it, scrim dims the map. No new JS dependency.

### 2b. A persistent thumb-zone action dock

The primary action (forge) currently lives in `#forge`, a `position:absolute`
input pinned `bottom:64px` and shown only in nation/demo mode
(`body[data-mode="nation"] #forge`). On a phone the single most important thing
a visitor can do should be a fat, unmissable button in the thumb zone.

- Add a bottom **action bar** (mobile only) holding one primary CTA — **"Build a
  city →"** — that opens the forge sheet (2c). Secondary actions (stats, replay)
  collapse behind a single overflow control, not scattered overlays.
- Minimum 44×44px touch targets (the current `#mapctl` 42px is borderline);
  primary CTA full-width-ish, ≥ 48px tall.

**Files:** `static/index.html` (markup + CSS). **Acceptance:** one thumb-reachable
primary button visible on every mobile screen; no overlapping floating controls.

### 2c. Forge as a hero moment, not a 420px input

`#forge` is a single `<input>` (`width:420px; max-width:86vw` on mobile) that
submits to `/?forge=<url>` (`static/index.html` `<form id="forge">`). Blank-input
friction kills the funnel.

- Promote forge to a **full-screen sheet** with:
  - **Tappable example chips** — e.g. `react`, `next.js`, `ansi-styles` — each a
    one-tap forge of a known-good public repo. Removes the "what do I type" stall.
  - **Clipboard auto-detect**: on open, read the clipboard (`navigator.clipboard
    .readText()`, best-effort, permission-gated); if it looks like a GitHub URL,
    surface "Paste detected: build `owner/repo`?" as the top chip.
  - The free-text input below the chips for anything else.
- Submit path is unchanged (`location.href = '/?forge=' + encodeURIComponent(url)`),
  which the server already handles via `forge_city()` → `forge.clone_url()`
  validation (`server.py:181`, `forge.py:56`).

**Files:** `static/index.html`. **Acceptance:** forge sheet opens from the dock,
example chips forge in one tap, clipboard suggestion appears when a GH URL is on
the clipboard.

### 2d. Strip desktop-only chrome on mobile

Touch has no hover and no Q/E keys, so several controls are dead weight on a
phone and just crowd the frame.

- Remove the on-screen rotate buttons (`#mapctl [data-act="rot-"]`, `rot+`) on
  mobile and **re-add rotation as a two-finger twist gesture** (decided 2026-06-16;
  see Gesture refinements). The buttons are dead chrome on touch, but rotation
  itself stays reachable.
- Keep only **zoom ± / reset** in `#mapctl`, or drop `#mapctl` entirely on mobile
  and rely on pinch-zoom + a single **recenter** button (recenter = `City.fit`,
  the same call `reset` already makes in `city-live.js`).
- The `header p` hint lines are already hidden on mobile; audit `#tiers` and
  `#replay` placement so nothing overlaps the new dock / sheets.

**Files:** `static/index.html`. **Acceptance:** mobile frame shows the map, the
title, the thumb dock, and at most one map-control affordance.

### 2e. Tighten the time-lapse transport bar for narrow screens

The movie transport bar is built dynamically in `city-timelapse.js` (`#tl-play`,
`#tl-skip`, `#tl-seek`, speed/transition selects, exit) and inserted into
`.mapwrap.tl-mode`. At 390px it visibly crowds (verified in step-1 testing).

- On mobile, reduce to the **video-player essentials**: play/pause, a wide scrub
  slider, and exit. Move speed/transition selects behind a small "⋯" control.
- Style it like a Reels/TikTok scrubber (big play target, draggable progress) so
  it reads as a familiar video control.

**Files:** `static/city-timelapse.js` (transport-bar builder) + `static/index.html`
(`.mapwrap.tl-mode` CSS). **Acceptance:** transport bar fits 360px with no
horizontal overflow; play + scrub + exit reachable by thumb.

### YAGNI boundaries for Step 2

No bottom-sheet library, no gesture framework, no responsive-grid rewrite of the
desktop layout, no settings/preferences UI. Reuse `#scrim`, the existing relocate
IIFE, and the existing forge submit path.

---

## Step 3 — The share loop (highest virality leverage)

**Goal:** turn a generated city into an *object people post*. Today a city lives
only on-screen; there is no shareable artifact, so the loop has no output edge.

### 3a. Snapshot share (MVP)

- Add a **Share** button (lives in the title pill / dock from Step 2). On tap:
  - `cityCanvas.toBlob()` → a PNG of the current frame.
  - `navigator.share({ files: [pngFile], title, text, url })` → the native share
    sheet (iMessage, IG, Twitter, etc.). Fall back to a download + "copy link"
    when `navigator.canShare({files})` is false (desktop browsers).
- The shared `url` is the canonical forge link (`/?forge=<url>`), so the artifact
  carries the loop back to step 1.

**Files:** new small `static/share.js` (loaded after the engine); a button in
`static/index.html`. **Acceptance:** on a phone, Share opens the OS sheet with a
city image + the forge link attached.

### 3b. Looping clip share (the real payload)

A still is good; the **time-lapse is the viral payload** — it's already a
ready-made short video.

- Record the time-lapse canvas with `MediaRecorder` over
  `cityCanvas.captureStream(fps)` for the duration of one replay pass; emit a
  blob, then hand it to `navigator.share({ files: [clip] })`.
- Drive it from a **"Share this build"** affordance on the transport bar (Step
  2e).
- Gracefully degrade: if `MediaRecorder` / the codec is unavailable, fall back to
  the 3a snapshot.

**Clip spec (decided 2026-06-16):**

| Param | Value | Notes |
|---|---|---|
| Length | ~12s target, **20s hard cap** | Speed up playback for the recording so the whole build fits the window; the engine already exposes a speed control. |
| Resolution | longest edge ≤ ~1080px | Downscale the capture if the backing store is larger; keeps files small without softening the pixel art. |
| fps | 30 (24 acceptable) | Plenty for pixel-art motion. |
| Format | mp4/H.264 where supported, webm/VP9 fallback | Feature-detect via `MediaRecorder.isTypeSupported`. iOS Safari (16.4+) needs mp4 for the share sheet to treat it as a video. |
| Expected size | ~2–6 MB | Comfortably shareable over iMessage / IG / X. |

**Files:** `static/share.js` + a hook in `static/city-timelapse.js` to expose the
replay-complete boundary. **Acceptance:** Share-this-build produces a looping
clip of the city assembling and drops it into the share sheet.

### YAGNI boundaries for Step 3

No server-side video rendering, no account/upload/hosting of clips, no watermark
pipeline, no GIF transcoding. Client-side capture + `navigator.share` only; the
shared text can carry the "made with agentopolis" attribution.

---

## Step 4 — OG-image unfurling per forged repo

> **Deferred (2026-06-16):** being handled in a separate session. Kept here for
> completeness and sequencing; do not start it from this track.

**Goal:** when a forge link is pasted into Slack / Twitter / iMessage, it should
unfurl into a beautiful, *repo-specific* preview — the cheapest viral multiplier
there is. Today the OG/Twitter tags are **static** (`static/index.html` lines
9–20 → a single `og-image.png`), so every shared city link previews identically.

### Approach (two tiers; ship the MVP first)

The server already stamps `/` per request (`server.py:root()` replacing
`{{MODE}}`/`{{CITY_SRC}}`/etc.) and has the forged city data in hand via
`forge.peek(url)` / `forge.peek_tl(url)` (`forge.py:48`).

- **MVP — templated SVG stat card (no canvas render).** Add `GET /og?url=<repo>`
  returning an SVG (or PNG via a light rasterizer) styled in the app's palette
  (`--plum`, `--gold`, `--cream`, Silkscreen) showing repo name + headline stats
  already computed in the city data (files, commits, districts, "shape" —
  village/town/city, the same fields shown in the live stats panel). Then, in
  `root()`, when `?forge=<url>` is present, **rewrite the OG/Twitter `<meta>`
  image + title + description** to point at `/og?url=…` and name the repo. This
  is deterministic, fast, cacheable per repo, and needs no headless browser.
- **Tier 2 (optional, later) — real city snapshot.** Render an actual isometric
  frame server-side (headless Playwright screenshot of the city canvas, cached to
  `forge.CACHE_DIR` keyed by repo hash like the existing bundles). Higher
  fidelity, heavier infra. Only pursue if the SVG card underperforms.

**Files:** `agentopolis/server.py` (new `/og` route + per-forge meta rewrite in
`root()`), maybe a tiny `agentopolis/og.py` for the SVG template.
**Acceptance:** pasting `agentopolis.codeblackwell.ai/?forge=<repo>` into a link
unfurler shows a card naming that repo with its stats; the no-forge homepage
keeps the existing static card.

### YAGNI boundaries for Step 4

Ship the SVG card before any headless-render path. No per-request live rendering,
no font-embedding gymnastics beyond what the card needs, no analytics on unfurls.

---

## Step 5 — Autoplay-the-wow on cold load

**Goal:** a visitor landing via a shared link should see *motion* within ~2
seconds — the city assembling — not a static frame or a control panel. First
impression decides whether they hit "Build your own."

- When `/` is loaded with `?forge=<url>` (or a demo movie context — the server
  already knows via `{{DEMO_MOVIE}}`), **auto-enter the time-lapse build** once
  data is ready, then settle into the live city. The replay path already exists
  (`?timelapse`, `city-timelapse.js`); this is about *defaulting* into it for
  cold shared-link loads rather than requiring the `#replay` tap.
- Overlay a one-line caption ("`owner/repo` — built from N commits") that fades
  after the build, so the wow is self-explanatory.
- Respect `prefers-reduced-motion`: skip straight to the fitted live city.

**Files:** `static/index.html` (boot logic / engine selection hint),
`static/city-timelapse.js` (auto-start + caption), possibly `server.py:root()`
(a `{{AUTOPLAY}}` stamp when `?forge` is present).
**Acceptance:** opening a forge link plays the build animation automatically with
a caption, then rests on the live city; reduced-motion users get the static fit.

### YAGNI boundaries for Step 5

No intro splash screen, no sound, no multi-step onboarding. One auto-play + one
fading caption.

---

## Cross-cutting concerns

### Performance budget (virality dies on jank)

- **DPR capped at 2** — already enforced in `autosizeCanvas()`. Keep it.
- **Mobile-lite render path:** gate the most expensive per-frame work
  (shimmer/particles in `static/city-scape.js`) behind a coarse device check
  (small viewport and/or low core count), so mid-range phones hold frame rate. A
  janky city is an unshared city.
- Target a steady 60fps on a mid-tier phone for both the live city and the movie;
  if the clip recorder (3b) drops frames, lower capture fps before lowering
  render fps.

### Gesture refinements (optional, additive)

The `attachTouch()` foundation (`static/touch.js`: pan / pinch / tap / long-press)
is solid.

- **Two-finger twist to rotate (committed, 2026-06-16)** — replaces the on-screen
  rotate buttons removed in 2d, so rotation stays reachable on touch. Track the
  angle between the two active touches in the pinch branch of `attachTouch()`
  (`static/touch.js`); snap to the engine's 8 discrete rotations (`cam.rot`,
  `city-live.js` / `nation.js` / `city-timelapse.js`) past a threshold so it
  doesn't jitter. Same `(dx,dy)`-style callback shape as `pinch`.
- **Double-tap to zoom in (optional)** — the expected map gesture; currently
  absent (tap is single-fire). Smallest add if we want it.

### Safe areas / notches

Add `env(safe-area-inset-*)` padding to the title pill, the thumb dock, and the
bottom sheet so nothing hides under a notch / home indicator. One CSS pass,
do it alongside Step 2.

---

## Sequencing & dependencies

```
Step 1 (canvas) ──► Step 2 (funnel UI) ──► Step 5 (autoplay wow)
   done                  │
                         ├──► Step 3 (share loop)   ← needs the Share button slot from 2b/2e
                         └──► Step 4 (OG unfurl)     ← server-side, parallelizable with 2/3
```

- **Step 2** is the backbone — it creates the surfaces (dock, sheets, Share slot)
  the other steps attach to. Do it next.
- **Step 4** is server-side and independent of the UI work; it can proceed in
  parallel and delivers viral lift even before the funnel UI lands.
- **Step 3** depends on the Share affordance from Step 2.
- **Step 5** is the finishing touch once the funnel and share artifact exist.

## Decisions (resolved 2026-06-16)

1. **Mobile rotation:** ✅ **Re-add** as a two-finger twist gesture (on-screen
   rotate buttons removed). See 2d + Gesture refinements.
2. **OG fidelity / Step 4:** ⏸️ **Deferred** — handled in a separate session.
3. **Clip format/length cap (3b):** ✅ ~12s target / 20s cap, ≤1080px longest
   edge, 30fps, mp4-where-supported + webm fallback, ~2–6 MB. See the 3b clip-spec
   table.
4. **Reduced-motion autoplay (5):** ✅ **Honor it** — users with the OS
   "Reduce Motion" setting skip the auto-played build animation and land directly
   on the finished, fitted city.
