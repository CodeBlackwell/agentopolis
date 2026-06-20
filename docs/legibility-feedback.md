# Agentopolis — Legibility Feedback Synthesis (2026-06-20)

Source: user feedback ("Dork Wife") on first-impression overwhelm + the repo→city gap.
This is a thinking doc, not a plan. No code committed from it yet.

## The reframe (the part that matters)

The false dilemma was: "strip it down = unimpressive" vs "keep it = confusing."
Third option: **a thin legible foreground over a beautiful illegible background.**
Legibility does not have to be a property of the whole city — it's one layer on top.

- The city stays gorgeous and a little mysterious (that's the asset).
- One value prop + one CTA + three insights sit on top. That's the legible layer.
- Precedent: GitHub contribution graph, Spotify Wrapped — they don't solve a problem,
  they create a *shareable moment*. That's the real lane.

The existing funnel is `land → forge → share → install`. That only works if the theory is
"beautiful artifact → curiosity → install." The feedback is really: **the funnel leaks at `land`.**
Not a death sentence — a conversion bug at the top, in the metric already instrumented.

Correction to the feedback: the *remove* list (kill pan/zoom/rotate/map) is too aggressive.
The playfulness is the asset. Fix = **hide on first paint, reveal on interaction** — not delete.

## Enumerated possibilities

### A — First load
- A1. Progressive disclosure: city + one headline + one CTA; everything else behind "Explore". Hidden, not deleted.
- A2. Headline value prop on screen: "Watch your codebase as a living city."
- A3. One CTA: "Forge your repo" (paste GitHub URL) or "See the demo". Matches `forge` step.
- A4. Guided 3-beat intro animation. RISK: over-guidance trap. Deprioritize.
- A5. Hide chrome (keybinds/controls) on first paint, reveal on hover. Subset of A1.

### B — Repo → city legibility
- B1. Rename hierarchy to repo-native words: Repository / Folder / File. Drop World/State/City/District/Building.
- B2. "3 insights" overlay: per last N commits, up to 3 plain findings (coupling / debt delta / refactor win).
      THE legible foreground. Most leveraged single idea.
- B3. One-property-at-a-time legend: show only the visual→repo mapping currently animating.
- B4. "Tell a story" mode: freeze + narrate one change at a time instead of nonstop motion.
- B5. Direct labeling on hover: "auth/login.py · 412 lines · 7 imports." On-demand, not always-on.

### C — What job does it do ("doesn't solve a problem")
- C1. Artifact lane: shareable city / "repo wrapped" / movie. Job = curiosity → install. **Primary.**
- C2. Onboarding lane: grasp an unfamiliar codebase in 60s. Needs B2+B5.
- C3. Agent-observability lane: dispatch room, ambient "is my agent working". Narrow but differentiated.
- C4. PR-storytelling lane: visualize what a PR changed.
- C5. Accept toy/portfolio identity: polish one path, stop forcing a product.

## Evaluation

| Item | Clarity | Effort | Trap risk | Leverage | Verdict |
|---|---|---|---|---|---|
| A1 disclosure | High | Low | Low | High | Do now |
| A2 headline | High | Low | Low | High | Do now |
| A3 one CTA | Med | Low | Low | High | Do now |
| B1 rename | High | Low | Low | Med | Do now |
| B2 3 insights | High | Med | Low | High | The one bet |
| B5 hover labels | Med | Med | Low | Med | Soon |
| B4 story mode | Med | Med | Med | Med | Later |
| A4 guided intro | Low | Med | High | Low | Avoid |
| C1 artifact identity | — | — | — | High | Commit as primary |
| C2/C3/C4 new jobs | — | High | — | — | Defer |

## Decision (current thinking)

- Viable core (cheap, reversible, fixes top of funnel): **A1 + A2 + A3 + B1**.
- The one bigger bet: **B2** — turns "pretty but meaningless" into "pretty AND I learned something."
- Strategic identity: **C1 (artifact lane)**, with B2 as its substance. Defer C2/C3/C4.
- Avoid A4. Amend the feedback's "delete" into "hide + reveal on interaction."
