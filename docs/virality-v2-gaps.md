# Virality v2 — Gaps & Solutions

Status: draft · Date: 2026-06-16 · Companion to [`mobile-virality-plan.md`](./mobile-virality-plan.md)

## Why this doc exists

The v1 plan built the **mechanics** of the viral loop — capture, OG cards,
timelapse clip, autoplay, forge funnel — and marked the build track complete.
That answers *"does a share happen?"* It does not answer the growth physics:
*does the share convert, survive the platform's ranking, and bring back more
than one person?* Viral coefficient `K = invitations × conversion`; v1 shipped
the invitation surface but left `K` untuned and unmeasured.

This doc catalogs the gaps from two expert lenses — **algorithm-hacking /
virality** and **UI engineering** — and a one-paragraph solution for each.

## Priority order

| # | Gap | Lens | Cost | Why it ranks |
|---|-----|------|------|--------------|
| 1 | Loop instrumentation | virality | S | Can't tune `K` you can't measure |
| 3 | Video end-card | both | S | Cheapest compounding win; link survives stripping |
| 2 | Cold-start OG hole | both | M | First share of any repo is currently the weakest |
| 4 | Inline-playing player card | virality | M | Turns a still unfurl into a playing build |
| 6 | Wrapped-grade stat flex | virality | S | Numbers already computed; pure framing |
| 7 | Pre-composed caption | virality | S | The text the human *and* the ranker read |
| 5 | Identity hook ("your repo") | virality | M | Identity expression is the strongest share driver |
| 8 | Desktop share path | UI | M | Laptop posters get the least-composed flow |
| 11 | Clean canonical URL | both | M | Long encoded URLs share + unfurl badly |
| 9 | Frame composition before share | UI | M | Sharing an uncomposed frame feels lossy |
| 10 | Clip recorder vs. renderer | UI | M | Dropped frames → ugly clip → unshared |

Sequence: **1 + 3** first (truth + cheapest compounding win), then **2** (plug
the cold-start hole), then **4 + 6** (distribution lift), then the rest.

---

## Cross-cutting (highest leverage)

### 1. Loop instrumentation — flying blind
**Gap.** Analytics were explicitly deferred. `K = invites × conversion` is
unmeasurable, so every other change is a guess.
**Solution.** A tiny self-hosted event funnel on the five loop edges:
`land → forge → share-tapped → share-completed → return-from-shared-link`. A few
counters in `server.py` (increment on `/`, `/forge`, `/og` POST) plus a
`navigator.sendBeacon` ping from `share.js` on tap/complete. No third party, no
PII — just the conversion numbers that let us tune the rest. Surface them on a
private `/stats` route.
**Files.** `server.py`, `static/share.js`.

### 2. Cold-start OG hole — the first share is the weakest
**Gap.** The OG image is browser-captured and cache-keyed (`forge.py:31-61`). A
brand-new repo link pasted into Slack/X hits `/og/{hash}.png` → cache miss →
generic static fallback. The most consequential share (introducing a repo to a
network) unfurls blandly.
**Solution.** Ship the deferred Step-4 **server-side SVG stat card**:
`GET /og?url=<repo>` rendering repo name + headline stats (files, commits,
districts, shape) in the app palette, deterministic and cacheable per repo. The
unfurl stops depending on a prior visitor warming the cache. Browser capture
stays as a fidelity *upgrade* once warm, but is no longer the floor.
**Files.** `server.py` (`/og` route + per-forge meta rewrite in `root()`), new
`agentopolis/og.py`.

### 3. Video end-card — the link dies when the platform strips it
**Gap.** The **still** OG image already bakes in the URL + attribution
(`share.js:24-26`), but the **shared video clip** (`recordTimelapseClip`) does
not — it records the build pass and stops, unbranded. X/LinkedIn/IG/TikTok
suppress outbound links and *boost* native video, so when the timelapse is posted
natively the URL only lives in caption text the algorithm deprioritizes — and the
clip itself carries nothing.
**Solution.** Bake a ~1s branded **end-card** into the `MediaRecorder` stream:
city name + `agentopolis.codeblackwell.ai/c/owner/repo` + "built by Claude Code".
The link rides *in the pixels*, surviving link-stripping. One artifact that is
the watermark, the CTA, and the distribution channel at once — best ROI on the
board, bridges both lenses.
**Files.** `static/city-timelapse.js` (append end-card frames before
`recordTimelapseClip` stops), `static/share.js`.

---

## Virality / algorithm-hacking lens

### 4. Inline-playing player card — the unfurl is a dead still
**Gap.** The payload is the timelapse, but a pasted link unfurls to a static OG
image.
**Solution.** Add an X **player card** (`twitter:card=player`) pointing at a
minimal `/player?url=<repo>` page that autoplays the recorded clip inline in the
feed. The link itself becomes the wow — stop-scroll instead of scroll-past.
Degrade to `summary_large_image` where player cards aren't honored.
**Files.** `server.py` (player meta + `/player` route).

### 5. Identity hook — we nudge people to share *other people's* repos
**Gap.** Every example chip is a famous repo (react, express, swr). The strongest
viral act is identity expression — "*my* codebase as a city," "3 years of *my*
commits."
**Solution.** Promote a "build **your** repo" path equal to the famous chips
(paste-your-GitHub nudge, or connect-GitHub later), and frame the share caption
as a personal artifact. Developers share what flexes who they are.
**Files.** `static/index.html` (forge sheet), caption logic (see #7).

### 6. Wrapped-grade stat flex — sitting on the numbers, not using them
**Gap.** Files/commits/districts are already computed but never framed
competitively.
**Solution.** Surface comparable, screenshot-bait stats: *"bigger than 88% of
repos," "6,000 commits = a metropolis."* Render them on the OG card (#2), the
end-card (#3), and the share caption (#7). Zero new data — pure framing. Spotify/
GitHub-Wrapped mechanics.
**Files.** `static/share.js` (overlay), `agentopolis/og.py`.

### 7. Pre-composed caption — generic share text
**Gap.** The caption is what *both* the human and the ranking model read, and it's
currently generic. "Post templates" flagged not-implemented.
**Solution.** Auto-compose a repo-specific curiosity-gap line:
*"react has 6,000 commits. here's what that looks like as a city 🏙️"* — passed as
the `text` of `navigator.share` and prefilled into desktop intent URLs (#8).
Cheap, high-leverage.
**Files.** `static/share.js`.

---

## UI engineering lens

### 8. Desktop share path — thin for laptop posters
**Gap.** The Share button *does* mount on desktop (`share.js:63` only gates on
`mode !== 'city'`) and uses `navigator.share` when present, so this is not
mobile-only. But the desktop flow is thin: no X/Tweet **intent URL**, no explicit
**download-the-clip**, and when `canShare({files})` is false it shares URL-only
or falls to a clipboard copy (`share.js:54-56`). Operators — whose *own* cities
are most personal, and who post from a laptop — get the least-composed path.
**Solution.** Add real desktop affordances: a "Tweet this" intent URL (prefilled
caption #7 + canonical URL #11) and a download-clip button, branched on
`canShare({files})` rather than leaning on the clipboard fallback.
**Files.** `static/share.js`.

### 9. Frame composition before share — you post an uncomposed frame
**Gap.** Capture grabs "the current frame"; the user never gets to pick the hero
shot.
**Solution.** A tiny "this is what you'll post" preview with angle/zoom reframe
before the share fires. Sharing something you composed feels intentional, not
lossy.
**Files.** `static/share.js` (preview modal), reuse the live engine camera.

### 10. Clip recorder competes with the renderer — janky artifact
**Gap.** `MediaRecorder` over `captureStream(30)` while rendering at 60fps on a
mid phone drops frames → ugly clip → unshared. No "rendering…" state, no re-roll.
**Solution.** Add a "rendering your clip…" affordance, throttle render fps during
capture (lower *capture* fps before *render* fps per the v1 perf budget), and
offer a re-roll if frames dropped. A quality gate before the artifact reaches the
share sheet.
**Files.** `static/city-timelapse.js`, `static/share.js`.

### 11. Clean canonical URL — long encoded links share badly
**Gap.** `/?forge=<percent-encoded-github-url>` reads and unfurls badly and won't
fit an end-card.
**Solution.** A clean `/c/owner/repo` canonical that resolves to the same forge
path, used in OG tags, the end-card (#3), captions (#7), and a QR for
desktop→mobile handoff. Keep `?forge=` working as an alias.
**Files.** `server.py` (route + canonical rewrite), `static/share.js`.

---

## YAGNI boundaries

No accounts, no clip hosting/upload pipeline, no third-party analytics SaaS, no
URL-shortener service (the `/c/owner/repo` path is the short form), no referral/
incentive system, no A/B framework. Instrumentation is counters + beacons only.
Everything here reuses the existing capture, forge, and OG infrastructure.
