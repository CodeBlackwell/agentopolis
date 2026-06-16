// Onboarding tour: a video-game-style guided walkthrough. A spotlight darkens the city and frames one
// element at a time while your Chief of Staff — a fawning pixel aide — addresses you as the Permanent
// Democratically Elected Supreme President, with tongue-in-cheek strongman-regime patter. Self-contained:
// injects its own CSS + sprite; the shell only adds the <script> tag.
//
// Three contexts, one running tour: nation, the live city, and the git-history MOVIE. The live-city tour
// ends by FORCING the President to press Replay History — that navigates into the movie, where the tour
// resumes (via a localStorage flag) and explains the transport bar. First visit auto-runs; ⭐ replays it.
(() => {
  const isMovie = [...document.scripts].some(s => s.src.includes('city-timelapse'));
  const mode = document.body.dataset.mode;
  const demo = document.body.dataset.demo === '1';       // the hosted showcase demo
  // The demo landing is a DEMO_MOVIE (agent-meme floor, no dossier); a demo FORGE result is a normal movie
  // whose #explain dossier renders — so the demo tour spans the two, like the live-city → movie handoff.
  const ctx = demo && isMovie ? (window.DEMO_MOVIE ? 'demo-land' : 'demo-cards')
            : isMovie ? 'movie' : mode;                  // 'nation' | 'city' | 'movie' | 'demo-land' | 'demo-cards'
  if (!['nation', 'city', 'movie', 'demo-land', 'demo-cards'].includes(ctx)) return;
  const DONE = 'agentopolis-tour-done', RESUME = 'agentopolis-tour-resume';
  const leader = 'Permanent Democratically Elected Supreme President';   // the full, mandatory title
  const pres = 'Supreme President';                                      // the everyday short form
  const city = document.body.dataset.hallName || 'your city';

  // ---- the script: each step spotlights one #id; center steps have no target; a forced step blocks the
  //      tour until the President presses the real highlighted control (and carries the tour onward). ----
  const NATION = [
    { center: 1, title: '⭐ THE NATION OF AGENTOPOLIS ⭐',
      text: `${leader}! You have been re-elected with 100% of the vote. Again. Congratulations are, as ever, mandatory. Permit your humble Chief of Staff to present the Republic.` },
    { sel: '#map', title: 'Your glorious dominion',
      text: 'Behold the Nation, surveyed from on high. Drag to parade across it, scroll to zoom, Q or E to spin it for the cameras. Every pixel adores you.' },
    { sel: '#tiers', title: 'Chain of command',
      text: 'WORLD ▸ STATE ▸ CITY. Descend from the heavens into any province, Excellency — click a city to enter, zoom out when the peasants bore you.' },
    { sel: '#panel-guide', title: 'Ministry briefing',
      text: 'Your dossier decodes every banner and rooftop in the realm. Memorize it — or do not; who would dare correct you?' },
    { sel: '#hotel', title: 'The loyal workforce',
      text: 'Your tireless citizens — each a Claude Code agent — check in here to labor for the Motherland. Hover one to read its devoted assignment.' },
    { sel: '#ticker', title: 'The State Record',
      text: 'Every decree your agents carry out scrolls through this log the instant it happens — official, unbiased, entirely factual news of the Republic. Approved by you, naturally.' },
    { sel: '#forge', title: 'The annexation office',
      text: 'Wish to expand the empire? Paste any public GitHub URL and we shall... liberate it into a brand-new city. Bloodlessly. Mostly.' },
    { center: 1, title: 'Long may you lead',
      text: `The Nation is yours, ${pres}. Summon me with the ⭐ badge whenever you require counsel (or applause). Now go forth and govern. Re-election pending — which is to say, guaranteed.` },
  ];
  const CITY = [
    { center: 1, title: `⭐ ${city.toUpperCase()} CITY ⭐`,
      text: `${leader}, welcome to ${city} — jewel of the Republic, raised stone by stone in your honor (and entirely by your decree). Your Chief of Staff, at your service.` },
    { sel: '#map', title: 'Survey your city',
      text: 'Drag to stroll your boulevards, scroll to zoom upon the rooftops, Q or E to spin the skyline. The city builds itself — for you, ceaselessly.' },
    { sel: '#mapctl', title: 'The royal controls',
      text: 'Zoom, rotate, and reset your view here, Excellency — and press ⊔ Share to flaunt your city before the envious neighboring states.' },
    { sel: '#legend', title: 'Secrets of the skyline',
      text: 'This guide decodes the city — floors are code, lit windows are fresh toil, cranes mark unfinished debt. Knowledge is power. You, of course, possess both.' },
    { sel: '#city-shape', title: 'Shape the skyline',
      text: 'A rare grant of choice, Excellency: reshape every building by file family, rarity, size, age — or a tasteful uniform decree. The look of the city bends to your aesthetic whim.' },
    { sel: '#hotel', title: 'The dispatch floor',
      text: 'Each pixel worker below is a live agent serving you this very moment. Hover to inspect their devotion. Idle hands are, naturally, unconstitutional.' },
    { sel: '#ticker', title: 'The State Record',
      text: 'And here, the official log — every file your agents touch, every command they run, scrolling by as it happens. The chronicle of your tireless administration.' },
    { sel: '#replay', force: 1, title: 'Now — the founding myth',
      text: 'Press ▶ Replay History yourself, Excellency. Watch the city rise from a single commit to this triumphant present — and I shall narrate the royal screening room.' },
    { center: 1, title: 'Govern wisely',
      text: `That concludes the tour, ${pres}. The ⭐ badge summons me whenever you need guidance — or merely an audience. The Nation believes in you. It has no choice.` },
  ];
  const MOVIE = [
    { center: 1, title: '⭐ THE FOUNDING, REPLAYED ⭐',
      text: `Roll the reel, ${pres} — the official history of ${city}, rising commit by commit. This is your royal screening room; every lever of the chronicle obeys you here.` },
    { sel: '#tl-play', title: 'Play & pause the chronicle',
      text: '▶ Begin or halt the documentary at your pleasure. History waits for you — it always has.' },
    { sel: '#tl-seek', title: 'Scrub through the ages',
      text: 'Drag to leap to any era of your glorious reign — the founding, the boom years, the present golden age — in an instant.' },
    { sel: '#tl-speed', title: 'The pace of progress',
      text: 'A leisurely crawl, or a triumphant 10× sprint. The Republic advances precisely as fast as you decree.' },
    { sel: '#tl-trans', title: 'Urban renewal, by decree',
      text: 'Choose how the city RE-FORMS between eras — a smooth hybrid, a clean slide, or full demolition-and-rebuild. Progress is sometimes loud.' },
    { sel: '#tl-shape', title: 'Reshape every building',
      text: 'The same grant of taste as your live city: shape the skyline by file family, rarity, size, age — or uniform decree. Reshape an entire history with a single flick. (Uniformity is, of course, encouraged.)' },
    { sel: '#explain', title: 'The living dossier',
      text: 'As the city grows, this panel narrates each district and landmark in real time — the official record of your achievements, updated as they become true.' },
    { sel: '#tl-exit', title: 'Return to the present',
      text: 'When the documentary has suitably flattered you, press ■ live to return to the breathing city. Duty calls, Excellency.' },
    { center: 1, title: '⭐ LONG LIVE THE PRESIDENT ⭐',
      text: `The tour is complete, ${pres}. You now command the Nation in full — to lead, to view, to build. The ⭐ badge recalls me anytime. The people thank you. Unanimously, as always.` },
  ];
  // ---- the DEMO tour: spans the showcase landing movie and a driven forge result. A `nav` step drives the
  //      navigation itself (no clone to type), carrying the tour onward to where the explanation cards live. ----
  const DEMO_LAND = [
    { center: 1, title: '⭐ WELCOME TO THE REPUBLIC ⭐',
      text: `${leader}! Your capital is rebuilding its entire glorious history before your very eyes. Permit your Chief of Staff to narrate the spectacle.` },
    { sel: '#map', title: 'The founding, replayed',
      text: 'Watch the city raise itself from a single humble commit into the metropolis it was always destined to become. It plays itself — as all things do, for you.' },
    { sel: '#transport', title: 'Your screening controls',
      text: '▶ Play or pause, drag to scrub through the ages, set the pace of progress. The chronicle obeys your hand.' },
    { sel: '#tl-shape', title: 'Shape the skyline',
      text: 'A grant of taste, Excellency: reshape every building by file family, rarity, size, age — or a tasteful uniform decree. The look of the Republic bends to your whim.' },
    { sel: '#hotel', title: 'The tireless citizenry',
      text: 'Your loyal pixel workers scurry across the dispatch floor without rest. Idle hands are, naturally, unconstitutional.' },
    { sel: '#forge', title: 'A leader BUILDS',
      text: 'But watching is for subjects — a President BUILDS. One simply enters a territory’s address here. Permit me to demonstrate, Excellency.',
      typeInto: '#forge input', typeUrl: 'https://github.com/chalk/ansi-styles',
      nav: '/?forge=' + encodeURIComponent('https://github.com/chalk/ansi-styles'),
      resume: 'demo-cards', navLabel: 'annex it ▸' },
  ];
  const DEMO_CARDS = [
    { center: 1, title: '⭐ A TERRITORY ANNEXED ⭐',
      text: `Behold, ${pres} — a foreign province, raising itself stone by stone from its first commit at your command. And now, the briefing you were denied back home...` },
    { sel: '#explain', title: 'Your living war-room dossier',
      text: 'The dispatch floor yields to your briefing — and it rewrites ITSELF every commit. "Now Playing" names the commit at hand; the ledger counts your holdings; the Formation card reveals the very metrics that CHOSE this city’s shape; and each district reports its strength.' },
    { sel: '#explain', title: 'The map answers to you',
      text: 'Hover any card and the streets it names PULSE to attention. Hover a building, and its card rises to meet your gaze. Dossier and city are one — and cards appear or vanish as your history makes them true.' },
    { sel: '#tl-exit', title: 'Return to the present',
      text: 'Press ■ live when the chronicle has flattered you sufficiently — or ⊔ Share this conquest with the lesser nations.' },
    { center: 1, title: '⭐ NOW GO BUILD, PRESIDENT ⭐',
      text: `The demonstration is complete, ${pres}. Paste any GitHub URL to annex a territory of your own — or follow the banner to survey the entire BLACKBOX nation. The ⭐ badge recalls me anytime. The people are, as ever, unanimous.` },
  ];
  const LISTS = { nation: NATION, city: CITY, movie: MOVIE, 'demo-land': DEMO_LAND, 'demo-cards': DEMO_CARDS };

  // ---- the Chief of Staff: a freshly pixelled aide (peaked cap, gold sash, medals). Drawn at 1x into a
  //      36x46 grid, the canvas backing-scaled x3, image-rendering:pixelated for crisp blocks. ----
  const GOLD = '#d4a953', PLUM = '#4f2a48', PLUM_D = '#3a1d36', SKIN = '#f0c8a0', DARK = '#241018';
  function drawAide(canvas) {
    const S = 3, ctx2 = canvas.getContext('2d');
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
  let steps = [], at = 0, typing = null, ui = null;
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
      #tour-block{position:fixed;inset:0;z-index:40}
      #tour-hole{position:fixed;z-index:41;border:3px solid var(--gold);border-radius:6px;pointer-events:none;
        box-shadow:0 0 0 9999px rgba(26,10,20,.8),0 0 22px rgba(212,169,83,.6);transition:all .35s ease}
      #tour-hole.center{opacity:0}
      #tour-hole.force{animation:tour-pulse 1.1s ease-in-out infinite}
      @keyframes tour-pulse{0%,100%{box-shadow:0 0 0 9999px rgba(26,10,20,.8),0 0 10px rgba(212,169,83,.5)}
        50%{box-shadow:0 0 0 9999px rgba(26,10,20,.8),0 0 28px 6px rgba(212,169,83,.95)}}
      #tour-card{position:fixed;z-index:42;width:340px;max-width:calc(100vw - 24px);background:var(--plum);
        border:4px solid var(--gold);box-shadow:0 14px 30px rgba(0,0,0,.5);font-family:'Silkscreen',monospace;
        color:var(--cream);transition:top .35s ease,bottom .35s ease,left .35s ease}
      #tour-card .body{display:flex;gap:10px;padding:12px}
      #tour-sprite{flex:0 0 auto;width:64px;height:82px;image-rendering:pixelated;align-self:flex-end;
        animation:tour-bob 1.6s ease-in-out infinite}
      @keyframes tour-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
      #tour-card .txt{flex:1;min-width:0}
      #tour-card h3{color:var(--gold);font-size:11px;letter-spacing:.04em;margin-bottom:6px;line-height:1.4}
      #tour-card p{font-size:10px;line-height:1.65;min-height:60px}
      #tour-card .who{display:block;margin-top:8px;font-size:8px;color:var(--pink-deep);letter-spacing:.08em}
      #tour-card .bar{display:flex;align-items:center;gap:8px;padding:0 12px 12px}
      #tour-card .dots{flex:1;display:flex;gap:4px;flex-wrap:wrap}
      #tour-card .dots i{width:6px;height:6px;background:var(--plum-soft);border:1px solid var(--gold)}
      #tour-card .dots i.on{background:var(--gold)}
      #tour-card button{cursor:pointer;font-family:inherit;font-size:10px;padding:7px 12px;
        background:var(--plum-soft);color:var(--cream);border:2px solid var(--gold)}
      #tour-card button:hover{background:var(--gold);color:var(--plum)}
      #tour-card .skip{background:transparent;border:0;color:var(--pink-deep);padding:7px 4px;font-size:9px}
      #tour-card .skip:hover{background:transparent;color:var(--gold)}
      #tour-card .nudge{font-size:9px;color:var(--gold);padding:7px 4px;animation:tour-bob 1.1s ease-in-out infinite}
      #tour-badge{position:fixed;left:14px;bottom:14px;z-index:30;cursor:pointer;width:42px;height:42px;
        font-size:20px;line-height:1;background:var(--plum-soft);color:var(--gold);border:2px solid var(--gold);
        box-shadow:3px 3px 0 var(--plum);font-family:'Silkscreen',monospace}
      #tour-badge:hover{background:var(--gold);color:var(--plum)}
      @media(max-width:720px){#tour-card #tour-sprite{display:none}#tour-card{width:300px}}`;
    document.head.appendChild(document.createElement('style')).textContent = css;

    const block = el('div', { id: 'tour-block' });
    const hole = el('div', { id: 'tour-hole' });
    const card = el('div', { id: 'tour-card' });
    card.innerHTML = `<div class="body"><canvas id="tour-sprite"></canvas>
      <div class="txt"><h3></h3><p></p><span class="who">— your Chief of Staff</span></div></div>
      <div class="bar"><button class="skip">skip tour</button><div class="dots"></div>
      <span class="nudge" hidden>press it ↑</span>
      <button class="back">back</button><button class="next">next ▸</button></div>`;
    block.append(hole, card);
    document.body.appendChild(block);
    drawAide(card.querySelector('#tour-sprite'));
    card.querySelector('.skip').onclick = end;
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
    ui = { block, hole, card, h3: card.querySelector('h3'), p: card.querySelector('p'),
           dots: card.querySelector('.dots'), back: card.querySelector('.back'),
           next: card.querySelector('.next'), nudge: card.querySelector('.nudge') };
  }

  function show(i) {
    at = i;
    const step = steps[i];
    const target = step.center ? null : document.querySelector(step.sel);
    const forced = !!step.force && !!target;
    ui.block.style.pointerEvents = forced ? 'none' : 'auto';   // forced: let the real control receive the click
    if (target) {
      const r = target.getBoundingClientRect();
      ui.hole.className = forced ? 'force' : '';
      Object.assign(ui.hole.style, { left: r.left - 8 + 'px', top: r.top - 8 + 'px',
        width: r.width + 16 + 'px', height: r.height + 16 + 'px' });
      place(r);
      if (forced) arm(target, step);
    } else {
      ui.hole.className = 'center';
      Object.assign(ui.card.style, { left: '50%', top: '50%', bottom: 'auto', transform: 'translate(-50%,-50%)' });
    }
    ui.h3.textContent = step.title;
    type(step.text);
    ui.dots.innerHTML = steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    ui.back.style.visibility = i ? 'visible' : 'hidden';
    ui.next.hidden = forced;                                   // forced: the only way on is the real button
    ui.nudge.hidden = !forced;
    ui.next.textContent = step.nav ? (step.navLabel || 'show me ▸')
      : i === steps.length - 1 ? 'done ✓' : 'next ▸';
  }

  function arm(target, step) {                                 // pressing the real control carries the tour onward
    if (target.dataset.tourArmed) return;
    target.dataset.tourArmed = '1';
    target.addEventListener('click', () => {                   // capture: runs before the control's own navigation
      if (step.resume !== false) { localStorage.setItem(RESUME, ctx === 'city' ? 'movie' : '1'); }
      localStorage.setItem(DONE, '1');                         // the live-city portion is seen; don't re-auto-run it
    }, { capture: true, once: true });
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
    const go2 = () => { localStorage.setItem(RESUME, step.resume); localStorage.setItem(DONE, '1'); location.href = step.nav; };
    if (!input) return go2();
    ui.next.disabled = true; ui.next.textContent = 'annexing…'; ui.back.style.visibility = 'hidden';
    input.focus(); input.value = '';
    let n = 0;
    const iv = setInterval(() => {                            // ~45ms/char: a human, decisive hand
      input.value = step.typeUrl.slice(0, ++n);
      if (n >= step.typeUrl.length) { clearInterval(iv); setTimeout(go2, 700); }   // beat to read it, then seize it
    }, 45);
  }

  function go(i) { if (i < 0) return; if (i >= steps.length) return end(); show(i); }

  async function start() {
    if (!ui) build();
    if (ctx === 'movie' || ctx === 'demo-land') await waitFor('#transport');   // the bar is built after the timeline loads
    if (ctx === 'demo-cards') await waitFor('#explain', 20000);                // forge clone + dossier need a beat
    steps = LISTS[ctx].filter(s => {                           // drop steps whose element isn't on screen
      if (s.center) return true;
      const b = document.querySelector(s.sel)?.getBoundingClientRect();
      return b && b.width > 0 && b.height > 0;
    });
    ui.block.style.display = 'block';
    show(0);
  }

  function end() {
    clearInterval(typing); typing = null;
    if (ui) ui.block.style.display = 'none';
    localStorage.setItem(DONE, '1');
    localStorage.removeItem(RESUME);
  }

  // ⭐ replay badge — always available; runs this context's tour
  const badge = el('button', { id: 'tour-badge', title: 'replay the tour', innerHTML: '⭐' });
  badge.onclick = start;
  document.body.appendChild(badge);

  addEventListener('keydown', e => {
    if (!ui || ui.block.style.display === 'none') return;
    if (e.key === 'Escape') end();
    else if ((e.key === 'ArrowRight' || e.key === 'Enter') && !steps[at]?.force) typing ? finishType() : go(at + 1);
    else if (e.key === 'ArrowLeft') go(at - 1);
  });
  addEventListener('resize', () => { if (ui && ui.block.style.display !== 'none') show(at); });

  if (ctx === 'movie' || ctx === 'demo-cards') {              // resume-only: continued from a forced/driven navigation
    if (localStorage.getItem(RESUME)) { localStorage.removeItem(RESUME); setTimeout(start, 500); }
  } else if (!localStorage.getItem(DONE)) {
    setTimeout(start, ctx === 'demo-land' ? 1600 : 600);      // first visit; let a hero movie breathe a beat first
  }
})();
