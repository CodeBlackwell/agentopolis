// Onboarding tour: a video-game-style guided walkthrough. A spotlight darkens the city and frames one
// element at a time while your Chief of Staff — a fawning pixel aide — addresses you as the Permanent
// Democratically Elected Supreme President, with tongue-in-cheek strongman-regime patter. Self-contained:
// injects its own CSS + sprite; the shell only adds the <script> tag.
//
// Three contexts, one running tour: nation, the live city, and the git-history MOVIE. The live-city tour
// ends by FORCING the President to press Replay History — that navigates into the movie, where the tour
// resumes (via a localStorage flag) and explains the transport bar. First visit auto-runs; a small
// Chief-of-Staff "?" handle beneath the camera controls replays it anytime.
(() => {
  const isMovie = [...document.scripts].some(s => s.src.includes('city-timelapse'));
  const mode = document.body.dataset.mode;
  const demo = document.body.dataset.demo === '1';       // the hosted showcase demo
  // The demo landing is a DEMO_MOVIE (agent-meme floor, no dossier); a demo FORGE result is a normal movie
  // whose #explain dossier renders — so the demo tour spans the two, like the live-city → movie handoff.
  const ctx = demo && isMovie ? (window.DEMO_MOVIE ? 'demo-land' : 'demo-cards')
            : isMovie ? 'movie' : mode;                  // 'nation' | 'city' | 'movie' | 'demo-land' | 'demo-cards'
  if (!['nation', 'city', 'movie', 'demo-land', 'demo-cards'].includes(ctx)) return;
  const screeningRoom = ctx === 'movie' || ctx === 'demo-land' || ctx === 'demo-cards';   // the movie IS the content
  // the paste-a-URL forge box is redundant when running locally (the CLI raises cities) — hide it in a local
  // nation; the hosted demo keeps it, since demo visitors have no terminal.
  if (mode === 'nation' && !demo)
    document.head.appendChild(document.createElement('style')).textContent = '#forge,#build-btn{display:none!important}';
  const DONE = 'agentopolis-tour-done', RESUME = 'agentopolis-tour-resume';
  const leader = 'Permanent Democratically Elected Supreme President';   // the full, mandatory title
  const pres = 'Supreme President';                                      // the everyday short form
  const city = document.body.dataset.hallName || 'your city';

  // Touch devices have no mouse/keyboard: rewrite the desktop control idioms (scroll, Q/E, spacebar,
  // arrows, click, hover) into the phone gestures the canvases actually listen for (pinch, two-finger
  // twist, tap, tap & hold). Applied to every step's prose + "try" hint at render time.
  const TOUCH = matchMedia('(pointer: coarse)').matches;
  const PHONE = matchMedia('(max-width: 720px)');         // the layout breakpoint where the rail + forge fold into sheets
  const touchify = s => !TOUCH || !s ? s : s
    .replaceAll('scroll to zoom upon the rooftops', 'pinch to zoom on the rooftops')
    .replaceAll('scroll to zoom', 'pinch to zoom').replaceAll(', scroll,', ', pinch,').replaceAll('scroll', 'pinch')
    .replaceAll('Q or E to spin it for the cameras', 'twist with two fingers for the cameras')
    .replaceAll('Q or E to spin', 'two-finger twist to spin').replaceAll('Q/E to spin', 'two-finger twist to spin')
    .replaceAll('Q/E', 'two-finger twist').replaceAll('and spin while it builds', 'and twist while it builds')
    .replaceAll('Press ▶ or tap spacebar', 'Tap ▶').replaceAll(' (spacebar)', '').replaceAll('(spacebar)', '')
    .replaceAll('← → to step a commit, or ', '')
    .replaceAll('Press play', 'Tap play').replaceAll('Press the controls', 'Tap the controls')
    .replaceAll('Press ■ live', 'Tap ■ live').replaceAll('Press ▶ Replay', 'Tap ▶ Replay')
    .replaceAll('Press ▶', 'Tap ▶')
    .replaceAll('Click', 'Tap').replaceAll('click', 'tap')
    .replaceAll('Hover', 'Tap');

  // ---- the script: each step spotlights one #id; center steps have no target; a forced step blocks the
  //      tour until the President presses the real highlighted control (and carries the tour onward). ----
  const NATION = [
    { center: 1, title: '⭐ THE NATION OF AGENTOPOLIS ⭐',
      text: `${leader}! You have been re-elected with 100% of the vote. Again. Congratulations are, as ever, mandatory. Permit your humble Chief of Staff to present the Republic.` },
    { sel: '#map', viz: 1, title: 'Your glorious dominion',
      text: 'Behold the Nation, surveyed from on high. Before we proceed, take the controls: zoom in upon your realm, pan across it, then press reset to restore the royal view. Every pixel adores you.' },
    { sel: '#tiers', title: 'Chain of command',
      text: 'WORLD ▸ STATE ▸ CITY. Descend from the heavens into any province, Excellency — click a city to enter, zoom out when the peasants bore you.',
      try: 'Click a province to descend into it.' },
    { sel: '#panel-guide', title: 'Ministry briefing',
      text: 'Your dossier decodes every banner and rooftop in the realm. Memorize it — or do not; who would dare correct you?' },
    { sel: '#hotel', title: 'The loyal workforce',
      text: 'Your tireless citizens — each a Claude Code agent — check in here to labor for the Motherland.' },
    { sel: '#ticker', title: 'The State Record',
      text: 'Every decree your agents carry out scrolls through this log the instant it happens — official, unbiased, entirely factual news of the Republic. Approved by you, naturally.' },
    (demo                                                    // demo: spotlight the paste box; local: teach the CLI
      ? { sel: '#forge', title: 'The ribbon-cutting office',
          text: 'Fancy a new city for the Republic? Paste any public GitHub URL and we shall throw it a grand opening — ribbon, golden scissors, photographers, the works.' }
      : { center: 1, title: 'Raise a foreign city',
          text: `You command a terminal, ${pres} — no pasting required. From the command line, decree: agentopolis movie <github-url> — and any public repo rises as a city of its own, golden ribbon and all.` }),
    { center: 1, title: 'Long may you lead',
      text: `The Nation is yours, ${pres}. Summon me from my portrait beneath the controls whenever you require counsel (or applause). Now go forth and govern. Re-election pending — which is to say, guaranteed.` },
  ];
  const CITY = [
    { center: 1, title: `⭐ ${city.toUpperCase()} CITY ⭐`,
      text: `${leader}, welcome to ${city} — jewel of the Republic, raised stone by stone in your honor (and entirely by your decree). Your Chief of Staff, at your service.` },
    { sel: '#map', viz: 1, title: 'Survey your city',
      text: 'Take command of the camera, Excellency: zoom in upon the rooftops, pan across your boulevards, then press reset to restore the view. The city builds itself — for you, ceaselessly.' },
    { sel: '#mapctl', title: 'The royal controls',
      text: 'Zoom, rotate, and reset your view here, Excellency — and press ⊔ Share to flaunt your city before the envious neighboring states.',
      try: 'Press the controls — zoom or spin the skyline.' },
    { sel: '#legend', title: 'Secrets of the skyline',
      text: 'This guide decodes the city — floors are code, lit windows are fresh toil, cranes mark unfinished debt. Knowledge is power. You, of course, possess both.' },
    { sel: '#city-shape', title: 'Shape the skyline',
      text: 'A rare grant of choice, Excellency: reshape every building by file family, rarity, size, age — or a tasteful uniform decree. The look of the city bends to your aesthetic whim.',
      try: 'Change it now — watch the whole city re-shape.' },
    { sel: '#hotel', title: 'The dispatch floor',
      text: 'Each pixel worker below is a live agent serving you this very moment. Idle hands are, naturally, unconstitutional.' },
    { sel: '#ticker', title: 'The State Record',
      text: 'And here, the official log — every file your agents touch, every command they run, scrolling by as it happens. The chronicle of your tireless administration.' },
    { sel: '#replay', force: 1, title: 'Now — the founding myth',
      text: 'Press ▶ Replay History yourself, Excellency. Watch the city rise from a single commit to this triumphant present — and I shall narrate the royal screening room.' },
    { center: 1, title: 'Govern wisely',
      text: `That concludes the tour, ${pres}. My portrait beneath the controls summons me whenever you need guidance — or merely an audience. The Nation believes in you. It has no choice.` },
  ];
  const MOVIE = [
    { center: 1, title: '⭐ THE FOUNDING, REPLAYED ⭐',
      text: `Behold ${city}, ${pres} — complete, and held in your private screening room. Every lever of the chronicle obeys you here. Permit me to roll its history from the very beginning.` },
    { sel: '#tl-play', force: 1, proceed: 1, title: 'Roll the reel yourself',
      text: `The reel waits, paused, on the finished city. Press ▶ and watch ${city} rise again from a single commit — the ⏮ ⏭ flank it to leap between chapters, and you may halt anytime.`,
      try: 'Press ▶ — start the replay.' },
    { sel: '#tl-seek', title: 'Scrub through the ages',
      text: 'Drag to leap to any era of your reign. The lit tick-marks are chapters — each the moment the city RE-FORMED into a grander shape.',
      try: 'Drag it, ← → to step a commit, or ⏮ ⏭ / , . to hop chapters.' },
    { sel: '#tl-speed', title: 'The pace of progress',
      text: 'A leisurely crawl, or a triumphant 10× sprint. The Republic advances precisely as fast as you decree.',
      try: 'Change the pace — try 10×.' },
    { sel: '#tl-trans', title: 'Urban renewal, by decree',
      text: 'Choose how the city RE-FORMS between eras — a smooth hybrid, a clean slide, or full demolition-and-rebuild. Progress is sometimes loud.',
      try: 'Pick a mode — then scrub across an era.' },
    { sel: '#tl-shape', title: 'Reshape every building',
      text: 'The same grant of taste as your live city: shape the skyline by file family, rarity, size, age — or uniform decree. Reshape an entire history with a single flick. (Uniformity is, of course, encouraged.)',
      try: 'Reshape the skyline — pick another mode.' },
    { sel: '#explain', title: 'The living dossier',
      text: 'As the city grows, this panel narrates each district and landmark in real time — the official record of your achievements, updated as they become true.',
      try: 'Hover a card — watch the streets it names light up.' },
    { sel: '#tl-exit', title: 'Return to the present',
      text: 'When the documentary has suitably flattered you, press Exit to return to the breathing city. Duty calls, Excellency.' },
    { center: 1, title: '⭐ LONG LIVE THE PRESIDENT ⭐',
      text: `The tour is complete, ${pres}. You now command the Nation in full — to lead, to view, to build. My portrait beneath the controls recalls me anytime. The people thank you. Unanimously, as always.` },
  ];
  // ---- the DEMO tour: spans the showcase landing movie and a driven forge result. A `nav` step drives the
  //      navigation itself (no clone to type), carrying the tour onward to where the explanation cards live. ----
  const DEMO_LAND = [
    { center: 1, title: '⭐ WELCOME TO THE REPUBLIC ⭐',
      text: `${leader}! What follows is a live demonstration of Agentopolis — a taste of what the tool does on your own machine. Your capital stands complete, ready to rebuild its entire glorious history at your command. Permit your Chief of Staff to narrate.` },
    { sel: '#tl-play', force: 1, proceed: 1, title: 'Press ▶ to begin',
      text: 'Behold your capital, complete and waiting. Press ▶ and watch it raise itself from a single humble commit into the metropolis it was always destined to become.',
      try: 'Press ▶ — start the founding.' },
    { sel: '#map', title: 'The founding, replayed',
      text: 'There it rises — from a single humble commit toward the metropolis it was always destined to become. It builds itself, as all things do, for you.',
      try: 'Drag, scroll, and spin while it builds.' },
    { sel: '#hotel', title: 'The tireless workforce',
      text: `Each scurrying citizen is a Claude Code agent. What you see now is a faithful re-enactment, ${pres} — but install our humble tool and it hooks quietly into your own Claude Code, so THESE become your real agents: checking in to this very floor and toiling in real time as you work. Idle hands are, naturally, unconstitutional.` },
    { sel: '#ticker', title: 'The State Record',
      text: 'And here, the official log: every action your agents take — files read, commands run, agents dispatched — scrolls past the instant it happens. The chronicle of your tireless administration, entirely factual and approved by you.' },
    { sel: '#tl-shape', title: 'Shape the skyline',
      text: 'A grant of taste, Excellency: reshape every building by file family, rarity, size, age — or a tasteful uniform decree. The look of the Republic bends to your whim.',
      try: 'Reshape the skyline — pick a mode.' },
    { sel: '#forge', title: 'A leader BUILDS',
      text: 'But watching is for subjects — a President BUILDS. One simply names a town here and we throw it a grand opening. Permit me to demonstrate, Excellency.',
      typeInto: '#forge input', typeUrl: 'https://github.com/colinhacks/zod',
      nav: '/?forge=' + encodeURIComponent('https://github.com/colinhacks/zod'),
      resume: 'demo-cards', navLabel: 'cut the ribbon ▸', working: 'cutting the ribbon…' },
  ];
  const DEMO_CARDS = [
    { center: 1, title: '⭐ GRAND OPENING ⭐',
      text: `Behold, ${pres} — ribbon freshly cut, a brand-new town standing complete with its doors flung open, ready to raise itself commit by commit in your honor. And now, the briefing you were denied back home...` },
    { sel: '#tl-play', force: 1, proceed: 1, title: 'Raise your new town',
      text: 'Your freshly-opened town stands complete. Press ▶ to watch it rise from nothing — and the dossier beside it will narrate every district as it appears.',
      try: 'Press ▶ — raise the city.' },
    { sel: '#explain', title: 'Your living war-room dossier',
      text: 'The dispatch floor yields to your briefing — and it rewrites ITSELF every commit. "Now Playing" names the commit at hand; the ledger counts your holdings; the Formation card reveals the very metrics that CHOSE this city’s shape; and each district reports its strength.',
      try: 'Read the cards — they refresh with every commit.' },
    { sel: '#explain', title: 'The map answers to you',
      text: 'Hover any card and the streets it names PULSE to attention. Hover a building, and its card rises to meet your gaze. Dossier and city are one — and cards appear or vanish as your history makes them true.',
      try: 'Hover a card now — watch the city pulse in answer.' },
    { sel: '#tl-exit', title: 'Return to the present',
      text: 'Press Exit when the chronicle has flattered you sufficiently — or ⊔ Share your handiwork with the lesser nations.' },
    { center: 1, title: '⭐ NOW GO BUILD, PRESIDENT ⭐',
      text: `The demonstration is complete, ${pres}. Hold a grand opening of your own — paste any GitHub URL and cut the ribbon — or follow the banner to survey the entire BLACKBOX nation. My portrait beneath the controls recalls me anytime. The people are, as ever, unanimous.` },
  ];
  const LISTS = { nation: NATION, city: CITY, movie: MOVIE, 'demo-land': DEMO_LAND, 'demo-cards': DEMO_CARDS };

  // ---- the Chief of Staff: a freshly pixelled aide (peaked cap, gold sash, medals). Drawn at 1x into a
  //      36x46 grid, the canvas backing-scaled x3, image-rendering:pixelated for crisp blocks. ----
  const GOLD = '#d4a953', PLUM = '#4f2a48', PLUM_D = '#3a1d36', SKIN = '#f0c8a0', DARK = '#241018';
  function drawAide(canvas, S = 3) {
    const ctx2 = canvas.getContext('2d');
    canvas.width = 36 * S; canvas.height = 46 * S;
    ctx2.scale(S, S);
    const p = (x, y, w, h, c) => { ctx2.fillStyle = c; ctx2.fillRect(x, y, w, h); };
    p(9, 43, 18, 3, 'rgba(0,0,0,.28)');                       // floor shadow
    p(11, 41, 6, 3, DARK); p(19, 41, 6, 3, DARK);             // shoes
    p(12, 33, 5, 9, PLUM_D); p(19, 33, 5, 9, PLUM_D);         // trousers
    p(12, 33, 1, 9, GOLD); p(23, 33, 1, 9, GOLD);             // trouser side-stripes
    p(10, 22, 16, 12, PLUM);                                  // jacket
    p(7, 23, 4, 9, PLUM); p(25, 23, 4, 9, PLUM);              // arms
    p(7, 31, 4, 2, '#ececf0'); p(25, 31, 4, 2, '#ececf0');    // white gloves
    p(8, 22, 3, 2, GOLD); p(25, 22, 3, 2, GOLD);              // epaulettes
    for (let i = 0; i < 6; i++) p(11 + i * 2, 23 + i * 2, 3, 2, GOLD);  // diagonal sash
    p(12, 30, 4, 4, GOLD); p(13, 31, 2, 2, '#c0395b');        // breast medal
    p(21, 25, 1, 1, GOLD); p(21, 28, 1, 1, GOLD);             // buttons
    p(14, 21, 8, 2, GOLD);                                    // collar trim
    p(11, 11, 14, 11, SKIN);                                  // face
    p(14, 14, 2, 2, DARK); p(20, 14, 2, 2, DARK);             // eyes
    p(13, 18, 10, 2, '#4a3526');                              // mustache
    p(16, 20, 4, 1, '#b3795a');                               // mouth
    p(8, 7, 20, 6, PLUM_D); p(8, 12, 20, 2, GOLD);            // cap body + band
    p(6, 13, 24, 2, DARK);                                    // cap brim
    p(16, 8, 4, 4, GOLD); p(17, 9, 2, 2, '#c0395b');          // cap badge
  }

  // ---- overlay (built once, lazily) ----
  let steps = [], at = 0, typing = null, ui = null, help = null, farewellShown = false, prefetched = false;
  const el = (tag, props) => Object.assign(document.createElement(tag), props);
  const waitFor = (sel, ms = 8000) => new Promise(res => {     // async transport bar isn't there on load
    const t0 = performance.now();
    (function poll() {
      const e = document.querySelector(sel);
      if (e) return res(e);
      if (performance.now() - t0 > ms) return res(null);
      setTimeout(poll, 120);
    })();
  });

  function build() {
    const css = `
      #tour-block{position:fixed;inset:0;z-index:40;pointer-events:none}
      .tour-mask{position:fixed;z-index:40;pointer-events:auto;transition:all .35s ease}
      #tour-hole{position:fixed;z-index:41;border:3px solid var(--gold);border-radius:6px;pointer-events:none;
        box-shadow:0 0 0 9999px rgba(26,10,20,.8),0 0 22px rgba(212,169,83,.6);transition:all .35s ease}
      #tour-hole.scrim{border-color:transparent;left:50%;top:50%;width:0;height:0;
        box-shadow:0 0 0 9999px rgba(26,10,20,.82)}
      #tour-hole.force{animation:tour-pulse 1.1s ease-in-out infinite}
      @keyframes tour-pulse{0%,100%{box-shadow:0 0 0 9999px rgba(26,10,20,.8),0 0 10px rgba(212,169,83,.5)}
        50%{box-shadow:0 0 0 9999px rgba(26,10,20,.8),0 0 28px 6px rgba(212,169,83,.95)}}
      /* screening room: the movie is the content, so dim it only SOFTLY (the city still reads through) while
         the gold-outlined spotlight pulls focus; the four-panel cutout still gates interaction. */
      #tour-block.nodim #tour-hole{box-shadow:0 0 0 9999px rgba(26,10,20,.5),0 0 22px 3px rgba(212,169,83,.75)}
      #tour-block.nodim #tour-hole.scrim{box-shadow:0 0 0 9999px rgba(26,10,20,.5)}
      #tour-block.nodim #tour-hole.force{animation:tour-pulse-light 1.1s ease-in-out infinite}
      @keyframes tour-pulse-light{0%,100%{box-shadow:0 0 0 9999px rgba(26,10,20,.5),0 0 10px rgba(212,169,83,.6)}
        50%{box-shadow:0 0 0 9999px rgba(26,10,20,.5),0 0 28px 6px rgba(212,169,83,.98)}}
      /* the farewell beat always dims (even in the screening room) so the one-time "replay lives here" pointer lands */
      #tour-block.farewell-dim #tour-hole{box-shadow:0 0 0 9999px rgba(26,10,20,.82),0 0 22px 3px rgba(212,169,83,.85)}
      #tour-card{position:fixed;z-index:42;pointer-events:auto;width:340px;max-width:calc(100vw - 24px);background:var(--plum);
        border:4px solid var(--gold);box-shadow:0 14px 30px rgba(0,0,0,.5);font-family:'Silkscreen',monospace;
        color:var(--cream);transition:top .35s ease,bottom .35s ease,left .35s ease}
      #tour-card .body{display:flex;gap:10px;padding:12px}
      #tour-sprite{flex:0 0 auto;width:64px;height:82px;image-rendering:pixelated;align-self:flex-end;
        animation:tour-bob 1.6s ease-in-out infinite}
      @keyframes tour-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
      #tour-card .txt{flex:1;min-width:0}
      #tour-card h3{color:var(--gold);font-size:11px;letter-spacing:.04em;margin-bottom:6px;line-height:1.4}
      #tour-card p{font-size:10px;line-height:1.8;min-height:60px;white-space:pre-line}
      #tour-card .who{display:block;margin-top:8px;font-size:8px;color:var(--pink-deep);letter-spacing:.08em}
      #tour-card .bar{display:flex;align-items:center;gap:8px;padding:0 12px 12px}
      #tour-card .dots{flex:1;display:flex;gap:4px;flex-wrap:wrap}
      #tour-card .dots i{width:6px;height:6px;background:var(--plum-soft);border:1px solid var(--gold)}
      #tour-card .dots i.on{background:var(--gold)}
      #tour-card button{cursor:pointer;font-family:inherit;font-size:10px;padding:7px 12px;
        background:var(--plum-soft);color:var(--cream);border:2px solid var(--gold)}
      #tour-card button:hover{background:var(--gold);color:var(--plum)}
      #tour-card .skip{background:transparent;border:2px solid var(--gold);color:var(--cream);padding:7px 11px;font-size:10px}
      #tour-card .skip:hover{background:var(--gold);color:var(--plum)}
      #tour-card .nudge{font-size:9px;color:var(--gold);padding:7px 4px;animation:tour-bob 1.1s ease-in-out infinite}
      #tour-card .try{margin:0 12px 10px;padding:6px 9px;font-size:9px;line-height:1.5;color:var(--plum);
        background:var(--gold);box-shadow:2px 2px 0 var(--plum-soft)}
      @media(max-width:720px){#tour-card #tour-sprite{display:none}#tour-card{width:300px}}`;   /* #tour-help rules live in buildHelp() */
    document.head.appendChild(document.createElement('style')).textContent = css;

    const block = el('div', { id: 'tour-block' });
    if (screeningRoom) block.classList.add('nodim');          // movie/demo dim only softly so the visualization still reads
    const masks = [0, 1, 2, 3].map(() => el('div', { className: 'tour-mask' }));   // frame the spotlit element
    const hole = el('div', { id: 'tour-hole' });
    const card = el('div', { id: 'tour-card' });
    card.innerHTML = `<div class="body"><canvas id="tour-sprite"></canvas>
      <div class="txt"><h3></h3><p></p><span class="who">— your Chief of Staff</span></div></div>
      <div class="try" hidden></div>
      <div class="bar"><button class="skip">&#10005; skip tour</button><div class="dots"></div>
      <span class="nudge" hidden>press it ↑</span>
      <button class="back">back</button><button class="next">next ▸</button></div>`;
    block.append(...masks, hole, card);
    document.body.appendChild(block);
    drawAide(card.querySelector('#tour-sprite'));
    card.querySelector('.skip').onclick = finish;             // skip → one last "replay lives here" pointer, then end
    card.querySelector('.back').onclick = () => go(at - 1);
    card.querySelector('.next').onclick = () => {
      if (typing) return finishType();
      const s = steps[at];
      if (s && s.nav) {                                       // a driven step: carry the tour onward across a navigation
        if (s.typeInto) return driveType(s);                 // demonstrate the gesture first: type the url, then go
        localStorage.setItem(RESUME, s.resume); localStorage.setItem(DONE, '1'); location.href = s.nav; return;
      }
      go(at + 1);
    };
    ui = { block, hole, card, masks, h3: card.querySelector('h3'), p: card.querySelector('p'),
           dots: card.querySelector('.dots'), back: card.querySelector('.back'),
           next: card.querySelector('.next'), nudge: card.querySelector('.nudge'),
           tryEl: card.querySelector('.try'), skip: card.querySelector('.skip') };
  }

  // Put the spotlit element where the spotlight can frame it. On phones the rail/log and forge live in
  // closed bottom sheets, and the step's target may also sit scrolled out of view inside one — so open the
  // sheet that holds it (re-render once it has slid up), tuck away a stale sheet that would cover an
  // elsewhere target, then snap the target to the centre of its scroll container. Returns false when it had
  // to defer for a sheet transition (it re-calls show(i)); true when the target is ready to measure.
  function reveal(target, i) {
    if (PHONE.matches) {
      const sheet = target.closest('#forge-sheet, #side');
      if (sheet) {
        if (!sheet.classList.contains('open')) {
          (sheet.id === 'forge-sheet' ? window.openForgeSheet : window.openStatsSheet)?.();
          setTimeout(() => show(i), 340);                  // wait out the .3s slide-up before measuring
          return false;
        }
      } else if (document.querySelector('#forge-sheet.open, #side.open')) {
        window.closeSheets?.();                            // leaving the sheets: tuck them away so they can't cover the spotlight
        setTimeout(() => show(i), 340);
        return false;
      }
    }
    target.scrollIntoView({ block: 'center' });             // snap into the centre of whatever scroll container holds it
    return true;
  }

  function show(i) {
    at = i;
    if (i >= 2) prefetchForge();                             // a few steps in = intent to finish → start the clone NOW
    const step = steps[i];
    const fw = !!step.farewell, cel = !!step.celebrate;
    const target = step.center ? null : document.querySelector(step.sel);
    if (target && !reveal(target, i)) return;               // open/close the right sheet + snap into view, then re-render
    const forced = (!!step.force || !!step.viz) && !!target;
    if (target) {
      const r = target.getBoundingClientRect();
      ui.hole.className = forced ? 'force' : '';
      const hx = r.left - 8, hy = r.top - 8, hw = r.width + 16, hh = r.height + 16;
      Object.assign(ui.hole.style, { left: hx + 'px', top: hy + 'px', width: hw + 'px', height: hh + 'px' });
      if (fw) maskFull();                                      // farewell: highlight the handle but don't let them poke it
      else mask(hx, hy, hw, hh);                               // block everything BUT the spotlit element — it stays live
      place(r);
    } else {
      scrim();                                                 // full-screen dim, no cutout
      maskFull();                                              // block all interaction during intro / close
      Object.assign(ui.card.style, { left: '50%', top: '50%', bottom: 'auto', transform: 'translate(-50%,-50%)' });
    }
    ui.h3.textContent = step.title;
    type(touchify(step.text));
    ui.tryEl.hidden = !((step.try || step.viz) && target);     // encourage hands-on play with the live element
    if (step.try && target && !step.viz) ui.tryEl.textContent = '👆 ' + touchify(step.try);
    ui.dots.innerHTML = (fw || cel) ? '' : steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    ui.skip.style.display = (fw || cel) ? 'none' : '';
    ui.back.style.visibility = (i && !fw && !cel) ? 'visible' : 'hidden';
    ui.next.hidden = forced;                                   // forced: the only way on is the real control / gesture
    ui.nudge.hidden = !forced;
    ui.nudge.textContent = step.viz ? 'zoom · pan · reset ↑' : 'press it ↑';
    ui.next.textContent = cel ? 'magnificent ▸'
      : fw ? 'got it ✓'
      : step.nav ? (step.navLabel || 'show me ▸')
      : i === steps.length - 1 ? 'done ✓' : 'next ▸';
    if (forced) (step.viz ? armViz(step) : arm(target, step));   // arm after the try-hint so armViz owns it
  }

  // ---- interaction cutout: four transparent panels frame the spotlit element, blocking clicks everywhere
  //      else so the user can pan/zoom/toggle/hover the very thing being explained — and nothing else. ----
  const setBox = (m, x, y, w, h) => Object.assign(m.style,
    { left: x + 'px', top: y + 'px', width: Math.max(0, w) + 'px', height: Math.max(0, h) + 'px' });
  function mask(hx, hy, hw, hh) {
    const [top, bottom, left, right] = ui.masks;
    setBox(top, 0, 0, innerWidth, hy);
    setBox(bottom, 0, hy + hh, innerWidth, innerHeight - (hy + hh));
    setBox(left, 0, hy, hx, hh);
    setBox(right, hx + hw, hy, innerWidth - (hx + hw), hh);
  }
  function maskFull() {                                        // one panel covers the screen; the rest collapse
    setBox(ui.masks[0], 0, 0, innerWidth, innerHeight);
    for (const m of ui.masks.slice(1)) setBox(m, 0, 0, 0, 0);
  }

  function arm(target, step) {                                 // pressing the real control carries the tour onward
    target.removeEventListener('click', target._tourArm, { capture: true });   // re-armable: back-nav / resize re-show
    target._tourArm = () => {                                  // capture: runs before the control's own handler
      if (step.proceed) return go(at + 1);                     // an in-page control (▶ play): pressing it advances the tour
      if (step.resume !== false) { localStorage.setItem(RESUME, ctx === 'city' ? 'movie' : '1'); }
      localStorage.setItem(DONE, '1');                         // a hand-off control: it navigates; resume on the next page
    };
    target.addEventListener('click', target._tourArm, { capture: true, once: true });
  }

  // A hands-on gate: the tour won't advance until the President has zoomed in, panned, then pressed reset.
  // Engine-agnostic — it watches window.apxCam (set by whichever map engine is live) and the shared reset
  // button, so the same three-gesture handshake works on desktop (wheel/drag) and phone (pinch/swipe).
  let vizRaf = 0;
  function armViz(step) {
    cancelAnimationFrame(vizRaf);
    const cam = window.apxCam;
    if (!cam) return go(at + 1);                              // no camera to watch — never trap the user
    const startS = cam.s, canvas = document.getElementById('map');
    const PAN_MIN = (canvas ? canvas.width : 1280) * 0.06;    // relative to the canvas, not a hard pixel count
    const names = ['zoom in', 'now pan', 'press reset'];
    let phase = 0, panRef = null;
    const mark = () => ui.tryEl.innerHTML = '👆 ' + names.map((g, k) =>
      k < phase ? `${g} ✓` : k === phase ? `<b>${g}</b>` : g).join('  ·  ');
    mark();
    const resetBtn = document.querySelector('#mapctl [data-act="reset"]');
    const stop = () => { cancelAnimationFrame(vizRaf); resetBtn && resetBtn.removeEventListener('click', onReset); };
    function onReset() { if (phase === 2) { stop(); go(at + 1); } }   // reset only counts once zoom + pan are done
    if (resetBtn) { resetBtn.removeEventListener('click', resetBtn._viz);   // de-dup across re-renders (resize/back)
                    resetBtn._viz = onReset; resetBtn.addEventListener('click', onReset); }
    (function watch() {
      if (steps[at] !== step) return stop();                 // moved on → detach
      if (phase === 0 && cam.s > startS * 1.25) { phase = 1; panRef = { ox: cam.ox, oy: cam.oy }; mark(); }
      else if (phase === 1 && Math.hypot(cam.ox - panRef.ox, cam.oy - panRef.oy) > PAN_MIN) { phase = 2; mark(); }
      vizRaf = requestAnimationFrame(watch);
    })();
  }

  function place(r) {                                          // park the card clear of the spotlit element
    ui.card.style.transform = 'none';
    const cw = ui.card.offsetWidth || 340;
    ui.card.style.left = Math.max(12, Math.min(r.left + r.width / 2 - cw / 2, innerWidth - cw - 12)) + 'px';
    if (innerHeight - r.bottom > 230) { ui.card.style.top = r.bottom + 16 + 'px'; ui.card.style.bottom = 'auto'; }
    else { ui.card.style.bottom = innerHeight - r.top + 16 + 'px'; ui.card.style.top = 'auto'; }
  }

  function type(text) {                                        // typewriter, for that addressing-the-nation cadence
    clearInterval(typing);
    text = text.replace(/([.!?])\s+/g, '$1\n');                // one sentence per line — let the dialogue breathe (CSS pre-line)
    ui.p.dataset.full = text;
    let n = 0;
    ui.p.textContent = '';
    typing = setInterval(() => {
      ui.p.textContent = text.slice(0, ++n);
      if (n >= text.length) finishType();
    }, 14);
  }
  function finishType() { clearInterval(typing); typing = null; ui.p.textContent = ui.p.dataset.full; }

  function driveType(step) {                                  // type a github url into the real forge input, then navigate
    const input = document.querySelector(step.typeInto);
    const go2 = () => {
      sessionStorage.setItem('apx-scripted-forge', '1');     // the demo's ribbon-cut is scripted → no grand-opening confetti
      localStorage.setItem(RESUME, step.resume); localStorage.setItem(DONE, '1'); location.href = step.nav;
    };
    if (!input) return go2();
    ui.next.disabled = true; ui.next.textContent = step.working || 'building…'; ui.back.style.visibility = 'hidden';
    input.focus(); input.value = '';
    let n = 0;
    const iv = setInterval(() => {                            // ~45ms/char: a human, decisive hand
      input.value = step.typeUrl.slice(0, ++n);
      if (n >= step.typeUrl.length) { clearInterval(iv); setTimeout(go2, 700); }   // beat to read it, then seize it
    }, 45);
  }

  function go(i) { if (i < 0) return; if (i >= steps.length) return finish(); show(i); }

  // Warm the forge cache the moment the President is clearly proceeding (a few steps in), so the driven
  // "cut the ribbon" lands on an already-built movie — no clone wait, the best possible first impression.
  function prefetchForge() {
    if (prefetched) return;
    const fstep = steps.find(s => s.typeUrl);               // the driven forge step (demo-land only)
    if (!fstep) return;
    prefetched = true;
    fetch('/forge-timelapse?url=' + encodeURIComponent(fstep.typeUrl)).then(r => r.text()).catch(() => {});
  }

  // tour end OR skip → one last dimmed beat that points at the replay handle, then truly end
  function finish() {
    if (farewellShown || !help) return end();
    farewellShown = true;
    if (!ui) build();
    ui.block.classList.add('farewell-dim');                    // always dim this final pointer, even in the screening room
    ui.block.style.display = 'block';
    ui.card.style.visibility = 'visible';
    steps = [{ sel: '#tour-help', farewell: 1, title: 'Summon me anytime',
      text: `Whenever you wish to tour again, ${pres}, your faithful Chief of Staff waits right here — one click and I return.` }];
    show(0);
  }

  function scrim() {                                           // dim the whole screen with no spotlight cutout
    ui.hole.className = 'scrim';
    Object.assign(ui.hole.style, { left: '', top: '', width: '', height: '' });   // let .scrim fill the viewport
  }

  function start() {                                          // dim the screen INSTANTLY, then bring the card in when ready
    if (!ui) build();
    if (screeningRoom) window.movieRewindForTour?.();          // replay: pause on the finished city so the forced ▶ step replays it
    farewellShown = false;                                     // each run earns its own closing pointer
    ui.block.classList.remove('farewell-dim');
    ui.block.style.display = 'block';
    scrim();                                                   // immediate overlay shadow — focus before the UI can overwhelm
    maskFull();                                                // block interaction until the first step decides what's live
    ui.card.style.visibility = 'hidden';                       // the card waits until its steps are on screen
    ready();
  }

  async function ready() {
    if (ctx === 'movie' || ctx === 'demo-land') await waitFor('#transport', 20000);   // a shared forge link may clone slowly
    if (ctx === 'demo-cards') await waitFor('#explain', 20000);                        // forge clone + dossier need a beat
    steps = LISTS[ctx].filter(s => {                           // drop steps whose element isn't on screen
      if (s.center) return true;
      const b = document.querySelector(s.sel)?.getBoundingClientRect();
      return b && b.width > 0 && b.height > 0;
    });
    ui.card.style.visibility = 'visible';
    show(0);
  }

  function end() {
    clearInterval(typing); typing = null;
    if (ui) ui.block.style.display = 'none';
    localStorage.setItem(DONE, '1');
    localStorage.removeItem(RESUME);
  }

  // ---- the replay handle: a small Chief-of-Staff sprite with a "?" glyph, parked just beneath the camera
  //      controls in every mode (positioned relative to #mapctl, but not part of it). Click → replay. ----
  function buildHelp() {
    const css = `
      #tour-help{position:fixed;z-index:9;cursor:pointer;padding:0;border:0;background:none;width:48px;height:60px}
      #tour-help canvas{width:100%;height:100%;image-rendering:pixelated;display:block;
        filter:drop-shadow(2px 2px 0 rgba(26,10,20,.45))}
      #tour-help .q{position:absolute;top:-4px;right:-7px;min-width:18px;height:18px;border-radius:9px;padding:0 2px;
        box-sizing:border-box;background:var(--gold);color:var(--plum);border:2px solid var(--plum);
        font:700 11px 'Silkscreen',monospace;display:flex;align-items:center;justify-content:center;
        box-shadow:1px 1px 0 var(--plum-soft)}
      #tour-help:hover canvas{filter:drop-shadow(0 0 7px var(--gold))}
      #tour-help:hover .q{background:var(--cream)}`;
    document.head.appendChild(document.createElement('style')).textContent = css;
    help = el('button', { id: 'tour-help', title: 'replay the tutorial' });
    const cv = el('canvas');
    help.append(cv, el('span', { className: 'q', textContent: '?' }));
    document.body.appendChild(help);
    drawAide(cv, 2);
    help.onclick = start;
    const place = () => {
      const m = document.getElementById('mapctl');
      if (!m) { help.style.visibility = 'hidden'; return; }    // no camera panel here → no handle to anchor to
      help.style.visibility = '';
      const r = m.getBoundingClientRect();
      help.style.top = (r.bottom + 10) + 'px';
      help.style.left = (r.left + r.width / 2 - help.offsetWidth / 2) + 'px';
    };
    place();
    addEventListener('resize', place);
    const m = document.getElementById('mapctl');               // the Share button grows #mapctl in city mode — re-anchor
    if (m && window.ResizeObserver) new ResizeObserver(place).observe(m);
    setTimeout(place, 700);
  }
  buildHelp();

  const active = () => ui && ui.block.style.display !== 'none' && ui.card.style.visibility !== 'hidden';
  addEventListener('keydown', e => {
    if (!active()) return;                                     // ignore keys during the card-less opening scrim
    if (e.key === 'Escape') end();
    else if ((e.key === 'ArrowRight' || e.key === 'Enter') && !steps[at]?.force && !steps[at]?.viz) typing ? finishType() : go(at + 1);
    else if (e.key === 'ArrowLeft') go(at - 1);
  });
  addEventListener('resize', () => { if (active()) show(at); });

  // city-timelapse fires this once, after the grand-opening confetti, when a user's own forged repo first finishes
  // — a Chief-of-Staff curtain call. Floats over the (undimmed, on a movie page) finished city + confetti.
  window.tourCelebrate = () => {
    if (!ui) build();
    farewellShown = true;                                     // its dismiss goes straight to end(), no farewell beat
    ui.block.classList.remove('farewell-dim');
    ui.next.disabled = false;
    ui.block.style.display = 'block';
    ui.card.style.visibility = 'visible';
    steps = [{ center: 1, celebrate: 1, title: '⭐ A GRAND OPENING! ⭐',
      text: `HUZZAH, ${pres}! The ribbon is cut, the city stands, and the confetti — mandatory, naturally — rains down in your honor. The fireworks were funded entirely by the people's gratitude. Historians already call this your finest hour. All of them. At once.` }];
    show(0);
  };

  // Resume a forced/driven hand-off if one is pending; otherwise auto-run for ANY first-time visitor — including
  // someone who lands straight on a shared movie / forge link (the movie + demo-cards tracks were resume-only before).
  if (localStorage.getItem(RESUME)) { localStorage.removeItem(RESUME); start(); }
  else if (!localStorage.getItem(DONE)) start();
})();
