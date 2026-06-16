// Time-lapse engine: replays a repo's git history as a city climbing the formation ladder.
// As the repo grows past thresholds the city RE-FORMS (village → radial/spine → grid); within an
// epoch buildings reveal in birth order, grow floors, ruin + overgrow when deleted. Each formation
// is a fixed per-epoch layout; boundaries are crossed with a demolish-and-rebuild transition.
const tlCanvas = document.getElementById('map');
const tlCtx = tlCanvas.getContext('2d');
const cam = { ox: 0, oy: 0, s: 1 };
const FIT = [150, 30, 1.18];                               // City.fit (pad, margin, zoom) for the movie view
let state = null, commits = [], births = [], mods = [], deaths = [], bornAt = new Map(), props = [];
// match backing store to box × DPR; on resize re-fit the current epoch's village to the new shape
autosizeCanvas(tlCanvas, () => { if (state) City.fit(cam, tlCanvas, state, ...FIT); })();
let groundFinal = null, groundBirth = null, decaySpan = 0;
let layouts = [], epochIndex = -1;                        // one fixed layout per formation epoch
let reformShown = -1;                                      // last epoch the Re-Form card auto-scrolled to (snap on new only)
let transition = null;                                    // active demolish-and-rebuild between two epochs
let ptr = -1, playing = false, speed = 12, acc = 0, last = 0, slider = null, label = null, dateEl = null;
let megaCommit = 15;                                      // commit-size gate for coupling; set relatively in index()

const citySrc = window.CITY_SRC || 'city-data.json';
const isForge = citySrc.includes('forge-timelapse');
// consume the "this forge was scripted by the demo tour" flag once, at load — so the grand-opening confetti
// fires only for a user's OWN supplied repo, never the tour's canned ribbon-cut. (Read early so it can't linger.)
const scriptedForge = sessionStorage.getItem('apx-scripted-forge') === '1';
try { sessionStorage.removeItem('apx-scripted-forge'); } catch (e) {}
window.MOVIE = true;                                      // tell hotel.js to stand down: no dispatch floor in a movie
document.getElementById('replay')?.remove();             // already in the movie; drop the entry button

// hand the current frame to the live view on exit, so flipping back to live doesn't jump the camera
const camKey = citySrc.replace(/.*url=([^&]+).*/, 'forge:$1');
addEventListener('pagehide', () => { try {
  sessionStorage.setItem('apx-cam', JSON.stringify({ k: camKey, src: 'movie', ox: cam.ox, oy: cam.oy, s: cam.s, rot: cam.rot || 0 }));
} catch (e) {} });
// the frame the live view left, if we arrived here from it — drives the opening settle (startIntro)
let savedCam = null;
try { const c = JSON.parse(sessionStorage.getItem('apx-cam') || 'null');
  if (c && c.k === camKey && c.src === 'live') savedCam = c; } catch (e) {}
(async () => {
  // honor prefers-reduced-motion: a forge link auto-plays this build movie, but these users opt out of
  // motion — send them to the static finished city instead (an explicit ?timelapse replay still plays)
  if (isForge && matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const m = citySrc.match(/url=(.+)$/);
    if (m) return location.replace('/?forge=' + m[1] + '&static');
  }
  const loading = showLoading();
  let resp;
  try {
    const r = await fetch(citySrc); if (!r.ok) throw r.status;
    resp = isForge ? await readForgeStream(r, loading) : await r.json();  // forge streams clone progress
  }
  catch (e) {                                             // forge clone failed / too large / gate busy → quick city
    const m = citySrc.match(/url=(.+)$/);
    if (isForge && m) { location.href = '/?forge=' + m[1] + '&static'; return; }
    throw e;
  }
  let data, tl;
  if (resp && resp.timeline) { data = resp.data; tl = resp.timeline; }   // forge: one full-clone bundle
  else { data = resp; tl = await fetch(window.TIMELINE_SRC || 'timeline.json').then(r => r.ok ? r.json() : Promise.reject(r.status)); }
  commits = tl.commits;
  const dr = data.sample || {};                          // headline stats for the share caption (#6/#7)
  window.CITY_STATS = { files: data.buildings.reduce((n, b) => n + (b.files || 0), 0) + (dr.files?.dropped || 0),
                        districts: data.buildings.length + (dr.buildings?.dropped || 0), commits: commits.length };
  const dead = reconstructDead(commits, data.buildings, data.zone)   // lifetime estate: files that died before HEAD
    .sort((a, b) => b.commits - a.commits).slice(0, 80);             // tuned: ruins feed formation detection, keep flat
  if (dead.length) data.buildings = data.buildings.concat(dead);
  index(data);                                           // per-building b.birth + b._touchAt (rename-folded)
  buildSchedule(data.buildings);                         // births[] / mods[] / deaths[] / bornAt from each lifecycle
  decaySpan = Math.max(1, Math.ceil(commits.length * 0.15));   // mourning window before nature reclaims a ruin
  const epochs = detectEpochs(data, commits);            // the formations this repo climbs over its history
  window.__epochs = epochs;
  layouts = buildEpochLayouts(data, epochs);             // one fixed layout per epoch; snapshots b._epochPos
  setEpoch(0);                                           // activate the first formation
  buildLegend(data);
  citySampleNote(data);
  buildTransport();
  buildExplain();                                        // the dispatch floor becomes a live, repo-specific legend
  seek(-1);
  loading.remove();
  startIntro();                                           // open on the live view's frame, then ease to the village
  speed = autoSpeed();                                    // size the walk to ~45s regardless of repo size (calm, not chaotic)
  setPlay(true);                                          // a movie plays itself
  requestAnimationFrame(loop);
})().catch(e => { loading.remove(); console.error('timelapse load failed', e); });

const autoSpeed = () => Math.max(3, Math.min(120, commits.length / 45));   // commits/sec → ~45s history walk

const fmtDate = ts => {                                   // "September 16, 2025 - 3:15am UTC" for the current commit
  const d = new Date(ts * 1000);
  const date = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  let h = d.getUTCHours();
  const ap = h < 12 ? 'am' : 'pm';
  h = h % 12 || 12;
  return `${date} - ${h}:${String(d.getUTCMinutes()).padStart(2, '0')}${ap} UTC`;
};

// A hard-hat pixel worker — the forge's own sprite (NOT the tour aide). Drawn 1x into a 28x34 grid,
// canvas backed x3 + image-rendering:pixelated for crisp blocks; same technique as tour.js drawAide.
function drawForgeWorker(canvas) {
  const S = 3, c = canvas.getContext('2d');
  canvas.width = 28 * S; canvas.height = 34 * S;
  c.scale(S, S);
  const p = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const GOLD = '#d4a953', SKIN = '#f0c8a0', PLUM = '#4f2a48', PLUM_D = '#3a1d36',
        CREAM = '#f9efe3', DARK = '#241018', STEEL = '#b8b8c2';
  p(7, 31, 14, 3, 'rgba(0,0,0,.28)');                      // floor shadow
  p(9, 29, 4, 3, DARK); p(15, 29, 4, 3, DARK);             // boots
  p(9, 21, 4, 9, PLUM_D); p(15, 21, 4, 9, PLUM_D);         // overall legs
  p(8, 13, 12, 9, PLUM);                                   // overall torso
  p(10, 13, 2, 9, GOLD); p(16, 13, 2, 9, GOLD);            // hi-vis straps
  p(8, 12, 12, 2, CREAM);                                  // shirt collar
  p(6, 14, 3, 7, SKIN); p(19, 14, 3, 6, SKIN);             // arms
  p(19, 19, 3, 2, CREAM);                                  // glove gripping the haft
  p(20, 15, 2, 7, DARK); p(18, 12, 6, 3, STEEL);           // sledgehammer shouldered (haft + head)
  p(10, 5, 8, 8, SKIN);                                    // face
  p(12, 8, 1, 1, DARK); p(15, 8, 1, 1, DARK);              // eyes
  p(8, 2, 12, 4, GOLD); p(6, 5, 16, 2, GOLD);              // hard-hat dome + brim
  p(13, 1, 2, 2, GOLD);                                    // hat ridge
}

function showLoading() {                                  // shown while a forge repo clones + seeds
  const el = document.createElement('div');
  el.id = 'tl-loading';
  const h = document.querySelector('header h1 .m-city');
  el._name = (h && h.textContent) || 'the city';
  const sprite = document.createElement('canvas');
  drawForgeWorker(sprite);
  const label = el._label = document.createElement('div');
  label.textContent = 'cloning ' + el._name + ' …';
  const track = document.createElement('div');
  const fill = el._fill = document.createElement('div');
  track.appendChild(fill); el.append(sprite, label, track);
  Object.assign(el.style, { position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: '12px', zIndex: 8, color: '#f9efe3',
    font: "14px 'Silkscreen', monospace", letterSpacing: '.1em', textShadow: '0 2px 6px rgba(0,0,0,.85)',
    pointerEvents: 'none' });
  Object.assign(sprite.style, { width: '56px', height: '68px', imageRendering: 'pixelated' });
  Object.assign(track.style, { width: '180px', height: '4px', borderRadius: '2px',
    background: 'rgba(249,239,227,.18)', overflow: 'hidden' });
  Object.assign(fill.style, { width: '0%', height: '100%', background: '#f9efe3',
    transition: 'width .3s linear' });
  sprite.animate([{ transform: 'translateY(0) rotate(-5deg)' }, { transform: 'translateY(-3px) rotate(5deg)' }],
    { duration: 560, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });  // hammering bob
  (document.querySelector('.mapwrap') || document.body).appendChild(el);
  return el;
}

// Read the forge NDJSON stream: {progress} lines drive the bar; the final {data, timeline} line is the bundle.
async function readForgeStream(resp, loading) {
  const reader = resp.body.getReader(), dec = new TextDecoder();
  let buf = '';
  const handle = line => {
    const msg = JSON.parse(line);
    if (msg.error) throw msg.error;                        // clone failed / too large → caller falls back to static
    if (msg.timeline) return msg;                          // the bundle — done
    if (msg.progress != null) {
      loading._fill.style.width = Math.round(msg.progress * 100) + '%';
      if (msg.phase === 'seed') loading._label.textContent = 'raising ' + loading._name + ' …';
    }
    return null;
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (line) { const bundle = handle(line); if (bundle) return bundle; }
    }
  }
  if (buf.trim()) { const bundle = handle(buf.trim()); if (bundle) return bundle; }
  throw 'no bundle';
}

const globMatch = (path, g) =>
  g.startsWith('*') ? path.endsWith(g.slice(1)) : g.includes('*') ? path.startsWith(g.split('*')[0]) : path === g;

// Reconstruct files that existed in history but are gone at HEAD (deleted, not renamed-into-a-survivor).
// Each becomes a "ruin" building so the city reserves its plot for life and leaves a husk on death.
function reconstructDead(commits, head, zone) {
  const alias = {};
  for (const c of commits) for (const f of c.files) if (f.c === 'R' && f.from) alias[f.from] = f.p;
  const term = p => { const seen = new Set(); while (alias[p] && !seen.has(p)) { seen.add(p); p = alias[p]; } return p; };
  const headExact = new Set(head.map(b => b.path));      // a lineage that resolves into a HEAD building lived
  const isHead = r => headExact.has(r) || head.some(b => r === b.path || r.startsWith(b.path + '/'));
  const life = new Map();                                // terminal path -> {birth, death, touches}
  commits.forEach((c, i) => {
    for (const f of c.files) {
      const r = term(f.p);
      if (isHead(r)) continue;
      const L = life.get(r) || life.set(r, { birth: i, death: undefined, touches: 0 }).get(r);
      L.touches++;
      if (f.c === 'D') L.death = i;
    }
  });
  const compFor = path => {                              // place by glob; fall back to a sibling's district
    for (const comp of zone.components) if (comp.globs.some(g => globMatch(path, g))) return comp.id;
    const top = path.split('/')[0], sib = head.find(b => b.path.split('/')[0] === top);
    return sib ? sib.component : (zone.components.find(c => c.kind !== 'civic') || zone.components[0]).id;
  };
  const dead = [];
  for (const [path, L] of life) {
    if (L.death === undefined) continue;                 // never actually deleted (e.g. partial history) → skip
    dead.push({ path, component: compFor(path), loc: 20, commits: L.touches, centrality: 0, age_days: 0,
                files: 1, classes: 0, imports: 0, todos: 0, death: L.death,
                ext: path.includes('.') ? path.split('.').pop().toLowerCase() : '' });
  }
  return dead;
}

const renameAlias = () => {                              // old path -> new path, from -M rename detection
  const alias = {};
  for (const c of commits) for (const f of c.files) if (f.c === 'R' && f.from) alias[f.from] = f.p;
  return p => { const seen = new Set(); while (alias[p] && !seen.has(p)) { seen.add(p); p = alias[p]; } return p; };
};

// Tag each building with the commit indices that touched it (b._touchAt) + its birth, following
// renames so a file's whole history under former names folds onto the one building it became at HEAD.
// Also derives b.commits + b.centrality from the timeline (the movie's single history source) so the
// server can ship a history-free seed (seed walk_history=False) — these overwrite any server values.
function index(data) {
  const resolve = renameAlias();
  const exact = new Map(data.buildings.map(b => [b.path, b]));
  const find = p => { const r = resolve(p);
    return exact.get(r) || data.buildings.find(b => r === b.path || r.startsWith(b.path + '/')) || null; };
  for (const b of data.buildings) b._touchAt = [];
  const hits = commits.map((c, i) => {                   // buildings each commit touches (renames folded)
    const hit = new Set();
    for (const f of c.files) { const b = find(f.p); if (b && !hit.has(b)) { hit.add(b); b._touchAt.push(i); } }
    return hit;
  });
  // sweeping-commit gate: ≥15 files is broad in human terms (a floor reflecting commit habits, not
  // repo size) and scales up for very large repos. Mirrors seed.py's server-side gate.
  megaCommit = Math.max(15, Math.round(data.buildings.length / 50));
  const coupled = new Map(data.buildings.map(b => [b, new Set()]));   // building -> co-committed component ids
  for (const hit of hits) {
    if (hit.size > megaCommit) continue;
    const comps = new Set([...hit].map(b => b.component));
    for (const b of hit) for (const cm of comps) if (cm !== b.component) coupled.get(b).add(cm);
  }
  for (const b of data.buildings) {
    if (b._touchAt.length) b.birth = b._touchAt[0];
    b.commits = b._touchAt.length;
    b.centrality = coupled.get(b).size;
  }
}

// Build the playback schedule (births / mods / deaths per commit + bornAt) from each lifecycle.
function buildSchedule(buildings) {
  births = commits.map(() => []); mods = commits.map(() => []); deaths = commits.map(() => []);
  bornAt = new Map();
  for (const b of buildings) {
    if (!b._touchAt || !b._touchAt.length) continue;
    const bi = b.birth ?? b._touchAt[0];
    bornAt.set(b, bi); births[bi].push(b);
    for (const k of b._touchAt) if (k !== bi) mods[k].push(b);
    if (b.death !== undefined && deaths[b.death]) deaths[b.death].push(b);
  }
}

// Walk history and split it into formation EPOCHS: at each commit pick the formation for the
// buildings alive then (City.chooseFormation), coalesce maximal runs. Hysteresis (min-dwell) avoids
// thrash right at a threshold. A small repo never crosses a threshold → one epoch (its formation).
function detectEpochs(data, commits) {
  const all = data.buildings;
  const aliveAt = i => all.filter(b => bornAt.has(b) && bornAt.get(b) <= i
    && !(b.death !== undefined && i >= b.death));
  const dwell = Math.max(2, Math.round(commits.length * 0.01));
  const epochs = [];
  let curForm = null, runStart = 0, pendForm = null, pendSince = 0;
  for (let i = 0; i < commits.length; i++) {
    const alive = aliveAt(i);
    if (!alive.length) continue;                          // before the first building
    const form = City.chooseFormation({ zone: data.zone, buildings: alive });
    if (!curForm) { curForm = form; runStart = i; continue; }
    if (form.id === curForm.id) { pendForm = null; continue; }
    if (!pendForm || pendForm.id !== form.id) { pendForm = form; pendSince = i; }
    if (i - pendSince + 1 >= dwell) {                     // sustained change → seal the boundary
      epochs.push({ start: runStart, end: pendSince - 1, formation: curForm, buildingsAlive: aliveAt(pendSince - 1) });
      curForm = form; runStart = pendSince; pendForm = null;
    }
  }
  if (curForm) epochs.push({ start: runStart, end: commits.length - 1, formation: curForm,
    buildingsAlive: aliveAt(commits.length - 1) });
  return epochs;
}

// Village dressing doesn't vanish once the city outgrows the hamlet: the well becomes a civic
// fountain and the water tower stays as relics near the center; the herd + windmill migrate to the
// outskirts as a city farm. hay/fences/ufo are gone. The farm direction (theta) is seeded from the
// repo so it's stable across epochs; the exact pockets adapt to each epoch's own grid (on-map always).
function relicPlan(state, seed) {
  const o = state.origin, rel = c => c && { rx: c.x + .5 - o.x, ry: c.y + .5 - o.y };
  const theta = (City.hash('farm' + seed) % 1000) / 1000 * Math.PI * 2;   // stable outskirts direction
  const R = Math.max(state.W, state.H);                                   // aim past the edge → nearest-grass clusters there
  const aim = { x: o.x + Math.cos(theta) * R, y: o.y + Math.sin(theta) * R };
  const avoid = [];
  const claim = opts => { const c = City.clearPocket(state, { ...opts, avoid });
    if (c) avoid.push({ x: c.x + .5, y: c.y + .5, r: opts.r || 3 }); return rel(c); };
  return { cityfarm:   claim({ near: aim, minRoom: 4, r: 4 }),            // the farm migrates to the sha edge
           windmill:   claim({ near: aim, minRoom: 2, r: 3 }),           // windmill + tower keep it company
           watertower: claim({ near: aim, minRoom: 1, r: 3 }),
           fountain:   claim({ near: o, minRoom: 2 }) };                  // well → fountain, nearest the old center
}

function promoteRelics(state, plan) {                       // absolutize the relic offsets into this epoch
  const o = state.origin;
  for (const kind of ['cityfarm', 'windmill', 'fountain', 'watertower']) {
    const off = plan[kind]; if (!off) continue;
    state._props.push({ kind, x: o.x + off.rx, y: o.y + off.ry, seed: City.hash(kind + 'relic') });
  }
}

// One fixed layout per epoch, laid out with that epoch's formation plan over the buildings alive
// then. City.layout mutates the shared building objects, so snapshot each building's position +
// visual fields into b._epochPos[ei] IMMEDIATELY (the one correctness hazard — snapshot generously).
function buildEpochLayouts(data, epochs) {
  const out = [];
  const seed = City.hash(data.buildings[0]?.path || data.zone.name || 'city');
  let hadVillage = false;
  epochs.forEach((ep, ei) => {
    const st = City.layout({ zone: data.zone, buildings: ep.buildingsAlive,
      deps: data.deps, docker: data.docker, dead: data.dead,
      _planFn: ep.formation.plan, _formationId: ep.formation.id });   // tag the stage for ambient dressing
    for (const b of st.buildings)
      (b._epochPos ||= {})[ei] = { x: b.x, y: b.y, floors: b.floors, foot: b.foot, color: b.color,
        form: b.form, arch: b.arch, heightScale: b.heightScale, lit: b.lit, billboard: b.billboard,
        hub: b.hub, debt: b.debt };
    st._props = st.items.filter(it => it.kind);            // this epoch's dressing (cows/trees/relics)
    if (ep.formation.id === 'village') hadVillage = true;
    else if (hadVillage) promoteRelics(st, relicPlan(st, seed));   // the hamlet's relics survive (per-epoch pockets, stable dir)
    out.push({ ep, state: st });
  });
  return out;
}

const epochAt = i => {                                     // highest epoch whose start <= commit i
  for (let e = layouts.length - 1; e >= 0; e--) if (i >= layouts[e].ep.start) return e;
  return 0;
};

// Schedule a demolish-and-rebuild transition between two fixed layouts as ordered WAVES.
// A mover (a building present in both epochs on a different cell) cannot rise at its new cell until
// whoever sits there in the old layout has vacated — "vacate-before-fill". The blocker graph is
// functional (one target cell per building), so it's a forest of chains feeding cycles; a cycle (two
// buildings swapping cells) deadlocks every wave, broken by craning the least-core mover off-grid so
// it vacates immediately and descends once its own target frees. Pure: returns one slot per moving
// building. fromPos/toPos are Maps building->{x,y}; bornAt is Map building->commitIndex.
function planWaves(fromPos, toPos, buildings, bornAt) {
  const cell = p => Math.round(p.x - .5) + ',' + Math.round(p.y - .5);
  const from = b => fromPos.get(b) || null, to = b => toPos.get(b) || null;
  const moved = b => from(b) && to(b) && cell(from(b)) !== cell(to(b));
  const movers = buildings.filter(moved);
  const leavers = buildings.filter(b => from(b) && !to(b));
  const arrivers = buildings.filter(b => !from(b) && to(b));
  const order = (a, b) => (b.centrality || 0) - (a.centrality || 0)               // core first
    || (bornAt.get(a) ?? 0) - (bornAt.get(b) ?? 0);                               // then oldest
  const occ = new Map();                                   // old cell -> occupant (shrinks as cells vacate)
  for (const b of buildings) if (from(b)) occ.set(cell(from(b)), b);
  for (const b of leavers) occ.delete(cell(from(b)));      // leavers collapse at wave 0, freeing their cells

  const pending = new Set(movers), lifted = new Set(), slot = new Map();
  let w = 0;
  while (pending.size) {
    const free = b => { const o = occ.get(cell(to(b))); return !o || o === b; };
    const ready = [...pending].filter(free).sort(order);
    if (!ready.length) {                                   // cycle: crane the least-core mover to break it
      const victim = [...pending].filter(b => !lifted.has(b)).sort(order).pop();
      occ.delete(cell(from(victim)));                      // lifted to the sky: old cell free now
      lifted.add(victim);
      slot.set(victim, { liftWave: w, landWave: null, craned: true });
      continue;                                            // same wave, now unblocked
    }
    for (const b of ready) {
      const s = slot.get(b) || { liftWave: w, craned: false };
      s.landWave = w; slot.set(b, s); pending.delete(b);
    }
    for (const b of ready) if (!lifted.has(b)) occ.delete(cell(from(b)));   // non-craned vacate at wave's end
    w++;
  }
  const waves = Math.max(1, w);
  const out = [];
  for (const [b, s] of slot)
    out.push({ b, collapseAt: s.liftWave, riseAt: s.landWave, craned: s.craned });
  for (const b of leavers) out.push({ b, collapseAt: 0, riseAt: null, craned: false });
  for (const b of arrivers) out.push({ b, collapseAt: null, riseAt: waves, craned: false });
  return { waves: waves + (arrivers.length ? 1 : 0), moves: out };
}
window.__planWaves = planWaves;                            // exposed for the synthetic wave/cycle self-tests
window.__tl = { begin: (a, b, c) => beginTransition(a, b, c), step: t => drawTransition(t),
  get transition() { return transition; }, get layouts() { return layouts; },
  get epochs() { return window.__epochs; }, setEpoch, recompute,
  get mode() { return transMode; }, set mode(m) { transMode = m; } };   // QA hooks for the formation re-form

// Activate an epoch: swap the live state + ground + props to its layout and restore every building
// to its position/visual snapshot for this epoch. (Hard cut for now; Phase 7 animates the boundary.)
function setEpoch(ei) {
  epochIndex = ei;
  state = layouts[ei].state;
  delete state._groundFade;                                // a swap settles the fabric; no lingering cross-fade
  props = state._props;
  groundFinal = state.ground.map(r => r.slice());
  groundBirth = state.groundBirth || [];
  while (groundBirth.length < groundFinal.length) groundBirth.push(new Array(state.W).fill(0));
  for (const b of state.buildings) {
    const p = b._epochPos[ei];
    b.x = p.x; b.y = p.y; b.finalFloors = p.floors; b.floors = 0;
    b.foot = p.foot; b.color = p.color; b.form = p.form; b.arch = p.arch;
    b.heightScale = p.heightScale; b.lit = p.lit; b.billboard = p.billboard; b.hub = p.hub; b.debt = p.debt;
    if (b.death !== undefined) b._sapling = { kind: 'tree', x: b.x, y: b.y, seed: City.hash(b.path), sapling: true };
  }
  City.fit(cam, tlCanvas, state, ...FIT);
}

// ---- formation transition: an animated demolish-and-rebuild between two epoch layouts ----
const ease = u => u * u * (3 - 2 * u);
const fitScale = st => { const c = {}; City.fit(c, tlCanvas, st, ...FIT); return c.s; };
const applyVis = (b, p) => { b.foot = p.foot; b.color = p.color; b.form = p.form; b.arch = p.arch;
  b.heightScale = p.heightScale; b.lit = p.lit; b.billboard = p.billboard; b.hub = p.hub; b.debt = p.debt; };
function centerOn(c, gx, gy, bias = 30) {                 // keep grid point (gx,gy) screen-centred at any scale
  c.ox = 0; c.oy = 0;
  const p = City.proj(c, gx, gy);
  c.ox = tlCanvas.width / 2 - p.sx; c.oy = tlCanvas.height / 2 + bias - p.sy;
}

// Plan the wave transition fromE→toE at commit `at`: align the old frame onto the new (shared origin),
// schedule each building's collapse/rise wave with planWaves, and zoom the camera from the old
// formation's scale to the new one. Only buildings alive at the boundary take part.
function beginTransition(fromE, toE, at) {
  intro = null;                                            // a formation re-form owns the camera; drop any opening settle
  const fs = layouts[fromE].state, ts = layouts[toE].state;
  const dx = ts.origin.x - fs.origin.x, dy = ts.origin.y - fs.origin.y;     // old coords → new frame
  const fromAlive = new Set(layouts[fromE].ep.buildingsAlive);
  const toAlive = new Set(layouts[toE].ep.buildingsAlive);
  const live = b => bornAt.has(b) && bornAt.get(b) <= at && !(b.death !== undefined && at >= b.death);
  const union = [...new Set([...fromAlive, ...toAlive])].filter(live);
  const fromPos = new Map(), toPos = new Map();
  for (const b of union) {
    const pf = b._epochPos[fromE], pt = b._epochPos[toE];
    if (pf && fromAlive.has(b)) fromPos.set(b, { x: pf.x + dx, y: pf.y + dy });
    if (pt && toAlive.has(b)) toPos.set(b, { x: pt.x, y: pt.y });
    b._risenAt = 0;
  }
  const { waves, moves } = planWaves(fromPos, toPos, union, bornAt);
  ts.cx = ts.W / 2; ts.cy = ts.H / 2;
  transition = { fromE, toE, at, fs, ts, dx, dy, fromPos, toPos,
    moveMap: new Map(moves.map(m => [m.b, m])), waves,
    startT: performance.now(), span: Math.min(3500, Math.max(700, waves * 650)),
    fromS: fitScale(fs), toS: fitScale(ts) };
  cam.cx = ts.W / 2; cam.cy = ts.H / 2;
}                                                          // the Re-Formed card appears on settle (recompute → renderExplain)

const COLLAPSE_W = 0.5;                                   // a demolition spans half a wave (rebuild mode)
const TRANSITION_MODES = ['hybrid', 'slide', 'rebuild'];  // selectable in the transport bar
let transMode = 'hybrid';                                 // how the city re-forms between formations

// Per-frame transition render: dispatch to the chosen mode, zoom the camera, draw. Returns true when done.
function drawTransition(t) {
  const T = transition, prog = Math.min(1, (t - T.startT) / T.span);
  cam.s = T.fromS + (T.toS - T.fromS) * ease(prog);
  centerOn(cam, T.ts.origin.x, T.ts.origin.y);
  const k = ease(prog);
  if (prog < 1) T.ts._groundFade = { from: T.fs, dx: T.dx, dy: T.dy, k };   // old fabric → new
  else delete T.ts._groundFade;
  const items = [];                                         // dressing cross-fades: old herd/well out, farm/fountain in
  for (const p of T.fs._props) items.push({ ...p, x: p.x + T.dx, y: p.y + T.dy, _alpha: 1 - k });
  for (const p of T.ts._props) items.push({ ...p, _alpha: k });
  const all = new Set([...T.fromPos.keys(), ...T.toPos.keys()]);
  const place = transMode === 'rebuild' ? placeRebuild : placeSlide;
  for (const b of all) place(T, b, prog, t, items);
  T.ts.items = items; T.ts.sortedRot = -1; state = T.ts;
  tlCtx.clearRect(0, 0, tlCanvas.width, tlCanvas.height);
  City.draw(tlCtx, cam, state, t);
  return prog >= 1;
}

// SLIDE / HYBRID: persistent buildings glide old→new (hybrid also morphs footprint + height); files
// that vanish in the new form dissolve early; genuinely new files rise in the back half. No teardown.
function placeSlide(T, b, prog, t, items) {
  const k = ease(prog), morph = transMode === 'hybrid';
  const pf = T.fromPos.get(b), pt = T.toPos.get(b), sf = b._epochPos[T.fromE], st = b._epochPos[T.toE];
  b.scaffold = false; b._demolishing = false; b.ruined = false; b.born = 0;
  if (pf && pt) {                                          // persists: travel to the new lot
    applyVis(b, st);
    b.x = pf.x + (pt.x - pf.x) * k; b.y = pf.y + (pt.y - pf.y) * k;
    b.floors = sf.floors + (st.floors - sf.floors) * k;
    b.foot = morph ? sf.foot + (st.foot - sf.foot) * k : st.foot;
    if (morph) b.heightScale = sf.heightScale + (st.heightScale - sf.heightScale) * k;
    items.push(b);
  } else if (pf) {                                         // gone in the new form: dissolve away (no husk)
    applyVis(b, sf); b.x = pf.x; b.y = pf.y; b.floors = sf.floors;
    b.ruined = true; b._demolishing = true; b._collapseAt = T.startT;
    items.push(b);
  } else if (prog >= 0.5) {                                // new in the new form: rise once the slide settles
    applyVis(b, st); b.x = pt.x; b.y = pt.y; b.floors = st.floors;
    if (!b._risenAt) b._risenAt = t;
    b.born = b._risenAt; b.scaffold = (t - b._risenAt) < 350;
    items.push(b);
  }
}

// REBUILD: vacate-before-fill waves — each building collapses at its old cell, then scaffold-rises at
// its new cell in dependency order (planWaves). Craned buildings hover (skipped) until their cell frees.
function placeRebuild(T, b, prog, t, items) {
  const wf = prog * T.waves, m = T.moveMap.get(b);
  const pf = T.fromPos.get(b), pt = T.toPos.get(b);
  b.scaffold = false; b._demolishing = false; b.ruined = false; b.born = 0;
  if (!m) {                                                // stationary: stands at its unchanged cell
    applyVis(b, b._epochPos[T.toE]); b.x = pt.x; b.y = pt.y; b.floors = b._epochPos[T.toE].floors;
    return items.push(b);
  }
  if (m.riseAt === null) {                                 // leaver: collapses where it stood, becomes a ruin
    applyVis(b, b._epochPos[T.fromE]); b.x = pf.x; b.y = pf.y; b.floors = b._epochPos[T.fromE].floors;
    b.ruined = true; b._collapseAt = T.startT; return items.push(b);
  }
  if (m.collapseAt !== null && wf < m.collapseAt) {        // not yet: still standing at the old cell
    applyVis(b, b._epochPos[T.fromE]); b.x = pf.x; b.y = pf.y; b.floors = b._epochPos[T.fromE].floors;
    items.push(b);
  } else if (m.collapseAt !== null && wf < m.collapseAt + COLLAPSE_W) {     // collapsing at the old cell
    applyVis(b, b._epochPos[T.fromE]); b.x = pf.x; b.y = pf.y; b.floors = b._epochPos[T.fromE].floors;
    b.ruined = true; b._demolishing = true;
    b._collapseAt = t - ((wf - m.collapseAt) / COLLAPSE_W) * 700;           // wave-progress → the 700ms fall
    items.push(b);
  } else if (wf < m.riseAt) {                              // in transit (craned hovers): skip drawing
  } else {                                                 // risen at the new cell, popping in + scaffolding
    applyVis(b, b._epochPos[T.toE]); b.x = pt.x; b.y = pt.y; b.floors = b._epochPos[T.toE].floors;
    if (!b._risenAt) b._risenAt = t;
    b.born = b._risenAt; b.scaffold = (t - b._risenAt) < 350;
    items.push(b);
  }
}

const countLE = (arr, i) => { let n = 0; for (const t of arr) if (t <= i) n++; return n; };
const GROWTH_RATE = 8;                                    // floors/sec the height eases toward its target
let easeLast = 0;

function recompute(i) {                                   // set targets + visible set for commit i (no anim)
  ptr = i;
  const e = epochAt(i);
  if (e !== epochIndex || state !== layouts[e].state) setEpoch(e);   // crossed a boundary, or scrubbed out of a live re-form
  const decayed = [];                                     // ruins past their mourning window → overgrown
  const shown = state.buildings.filter(b => {
    if (!bornAt.has(b) || bornAt.get(b) > i) return false;
    if (b.death !== undefined && i >= b.death + decaySpan) { decayed.push(b); return false; }
    return true;
  });
  for (const b of shown) {                                // target floors = share of the building's commits seen
    const n = countLE(b._touchAt, i);
    b._floorsTarget = Math.max(1, Math.ceil(b.finalFloors * n / (b._touchAt.length || 1)));
  }
  if (groundFinal)                                        // ground appears with the epoch (per-tile birth optional)
    for (let y = 0; y < groundFinal.length; y++) {
      const gf = groundFinal[y], gbr = groundBirth[y] || [], gr = state.ground[y];
      for (let x = 0; x < gf.length; x++) gr[x] = (gbr[x] ?? 0) <= i ? gf[x] : 2;
    }
  for (const b of decayed) {                              // nature reclaims the ruin's lot: pavement back to grass
    const c = b._epochPos[epochIndex]; if (!c) continue;
    const cx = Math.round(c.x - .5), cy = Math.round(c.y - .5);
    if (state.ground[cy]) state.ground[cy][cx] = 2;
  }
  state.items = [...props, ...decayed.map(b => b._sapling), ...shown];
  state.sortedRot = -1;                                  // force City.draw to re-sort painter order
  if (slider) slider.value = i;
  if (label) {
    const c = commits[i];
    label.textContent = c
      ? `${new Date(c.ts * 1000).toLocaleDateString()} · ${c.author} · ${c.subject}`.slice(0, 90)
        + `   (${i + 1}/${commits.length})  ·  ${layouts[epochIndex].ep.formation.id}`
      : `0/${commits.length}`;
  }
  if (dateEl) dateEl.textContent = commits[i] ? fmtDate(commits[i].ts) : '';   // date stamp follows the playhead
  renderExplain(shown, i);                               // refresh the live legend for this commit
}

function seek(i) {                                        // scrub / init: snap instantly, no tween or collapse
  transition = null;                                      // scrubbing snaps to the settled epoch (no live re-form)
  recompute(i);
  for (const b of state.buildings) {
    const vis = bornAt.has(b) && bornAt.get(b) <= i && !(b.death !== undefined && i >= b.death + decaySpan);
    b.floors = vis ? (b._floorsTarget ?? 0) : 0;
    b.ruined = vis && b.death !== undefined && i >= b.death;
    b.scaffold = false; b._collapseAt = 0;
  }
}

function tween(t) {                                       // per-frame: ease heights up, raise scaffolding while building
  if (!easeLast) easeLast = t;
  const dt = Math.min(.05, (t - easeLast) / 1000); easeLast = t;
  for (const b of state.items) {
    if (b.kind || b.ruined) continue;
    const target = b._floorsTarget ?? b.floors;
    if (b.floors < target - 0.02) { b.floors = Math.min(target, b.floors + dt * GROWTH_RATE); b.scaffold = true; }
    else { b.floors = target; b.scaffold = false; }
  }
}

function advance(to) {                                    // forward play: births pop in, touches flash, deaths collapse
  const now = performance.now();
  for (let k = ptr + 1; k <= to; k++) {
    for (const b of births[k]) b.born = now;                         // pop in / rebuild
    for (const b of mods[k]) if (bornAt.get(b) <= k) { b.flash = now; b.lit = 1; }   // construction beat
    for (const b of deaths[k]) { b.ruined = true; b._collapseAt = now; }             // demolition / move-out
  }
  recompute(to);
  for (const b of state.buildings)                        // newborns appear at full birth-height (pop-in does the rise)
    if (b._floorsTarget !== undefined && b.floors === 0 &&
        bornAt.get(b) <= to && !(b.death !== undefined && to >= b.death + decaySpan)) b.floors = b._floorsTarget;
}

function loop(t) {
  if (state) state.skyPhase = (ptr + 1) / commits.length;  // history walks dawn → night as the city ages
  if (transition) {                                        // a formation re-form is playing: hold the playhead
    if (drawTransition(t)) seek(transition.at);             // settle at full height (seek snaps floors; tween won't regrow)
    last = 0; requestAnimationFrame(loop); return;
  }
  if (playing && ptr < commits.length - 1) {
    if (!last) last = t;
    acc += (t - last) / 1000 * speed;
    last = t;
    if (acc >= 1) {
      const n = Math.floor(acc); acc -= n;
      const e = epochAt(ptr), nextStart = layouts[e + 1] ? layouts[e + 1].ep.start : Infinity;
      const target = Math.min(commits.length - 1, ptr + n);
      if (target >= nextStart) { advance(nextStart - 1); beginTransition(e, e + 1, nextStart); }   // re-form first
      else advance(target);
    }
    if (ptr >= commits.length - 1) { const justFinished = playing; setPlay(false); if (justFinished) onMovieComplete(); }
  } else { last = 0; }
  if (!transition) {
    if (intro) stepIntro(t);
    tween(t);
    tlCtx.clearRect(0, 0, tlCanvas.width, tlCanvas.height);
    City.draw(tlCtx, cam, state, t);
    const af = activeFocus();                              // hover link, both ways: card⇄map
    drawFocus(af.ping);                                    // gold-outline the map items the focus describes
    applyCardHighlight(af.cards);                          // raise the cards a hovered building belongs to
    syncScroll(af.ping);                                   // reveal that card if the map hover scrolled it off
    if (endCardAt) drawEndCard(t);                         // branded outro, only while recording a clip
  }
  requestAnimationFrame(loop);
}

// ---- live→movie opening settle: one continuous camera across the reload, not a hard cut ----
// Open on the frame the live view left, then ease pan+zoom to the movie's natural village fit. Rotation
// is a discrete viewing orientation, so it's adopted outright (the movie just plays at that angle) — only
// pan and zoom glide. A formation crossing supersedes the settle (beginTransition clears it).
let intro = null, introLast = 0;
function startIntro() {
  if (!savedCam) return;
  cam.rot = savedCam.rot;
  City.fit(cam, tlCanvas, state, ...FIT);          // recentre the village for the adopted orientation = target
  intro = { fx: savedCam.ox, fy: savedCam.oy, fs: savedCam.s, tx: cam.ox, ty: cam.oy, ts: cam.s, t: 0 };
  cam.ox = savedCam.ox; cam.oy = savedCam.oy; cam.s = savedCam.s;   // ...but start where the live view left off
  introLast = 0;
}
function stepIntro(t) {
  if (!introLast) introLast = t;
  intro.t = Math.min(1, intro.t + (t - introLast) / 700);
  introLast = t;
  const u = ease(intro.t);
  cam.ox = intro.fx + (intro.tx - intro.fx) * u;
  cam.oy = intro.fy + (intro.ty - intro.fy) * u;
  cam.s = intro.fs + (intro.ts - intro.fs) * u;
  if (intro.t >= 1) intro = null;
}

function setPlay(p) {
  playing = p; last = 0;
  if (p && ptr >= commits.length - 1) seek(-1);          // replay from the start
  document.getElementById('tl-play').textContent = playing ? '⏸' : '▶';
  if (!p && window.DEMO_MOVIE && ptr >= commits.length - 1) showFinishCTA();   // the demo holds on the finished city
}

function jumpChapter(dir) {                               // ⏮ / ⏭ and , / . hop between formation transitions
  setPlay(false);
  const marks = layouts.map(l => l.ep.start);            // each epoch begins at a transition (chapter) commit
  if (dir > 0) { const next = marks.find(m => m > ptr); seek(next !== undefined ? next : commits.length - 1); }
  else { const before = marks.filter(m => m < ptr); seek(before.length ? before[before.length - 1] : -1); }
}

// ---- shareable end-card: a ~1s branded outro baked into the recorded clip, so the canonical link rides
// in the pixels and survives platforms that strip outbound URLs. Drawn over the final frame while recording.
const forgeParam = new URLSearchParams(location.search).get('forge');
const canonText = () => {
  const m = /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(forgeParam || '');
  return m ? `agentopolis.codeblackwell.ai/c/${m[1]}/${m[2]}` : 'agentopolis.codeblackwell.ai';
};
const captureFps = (cores) => ((cores ?? navigator.hardwareConcurrency ?? 8) <= 4 ? 24 : 30);  // lighter on weak phones
let endCardAt = 0;
function drawEndCard(t) {
  const W = tlCanvas.width, H = tlCanvas.height, u = H / 18, k = Math.min(1, (t - endCardAt) / 300);
  tlCtx.save();
  tlCtx.globalAlpha = k * 0.9; tlCtx.fillStyle = '#241020'; tlCtx.fillRect(0, 0, W, H);
  tlCtx.globalAlpha = k; tlCtx.textAlign = 'center'; tlCtx.textBaseline = 'middle';
  tlCtx.fillStyle = '#f9efe3'; tlCtx.font = `${u * 1.7}px 'Silkscreen', monospace`;
  tlCtx.fillText(document.body.dataset.hallName || 'this city', W / 2, H * 0.40);
  tlCtx.fillStyle = '#d4a953'; tlCtx.font = `${u}px 'Silkscreen', monospace`;
  tlCtx.fillText(canonText(), W / 2, H * 0.55);
  tlCtx.fillStyle = '#c77aaa'; tlCtx.font = `${u * 0.8}px 'Silkscreen', monospace`;
  tlCtx.fillText('built by Claude Code', W / 2, H * 0.65);
  tlCtx.restore();
}
window.__endCard = { text: canonText, draw: drawEndCard, fps: captureFps };   // exposed for the end-card self-tests

// record one fast replay pass of the movie as a short video to share — the build itself is the payload.
// Resolves a Blob, or null if MediaRecorder/codecs are unavailable; share.js drives this in movie mode.
window.recordTimelapseClip = () => new Promise(resolve => {
  if (!window.MediaRecorder || !tlCanvas.captureStream) return resolve(null);
  // mp4/h264 where the browser records it (iOS Safari wants mp4 for the share sheet), else webm
  const TYPES = ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = TYPES.find(t => MediaRecorder.isTypeSupported(t));
  let rec;
  try { rec = new MediaRecorder(tlCanvas.captureStream(captureFps()), mimeType ? { mimeType } : undefined); }
  catch (e) { return resolve(null); }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => { endCardAt = 0; resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' })); };
  const prevSpeed = speed;
  const finish = () => {                                                 // build done → hold the branded outro, then cut
    clearTimeout(cap); clearInterval(poll); speed = prevSpeed;
    endCardAt = performance.now();
    setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 1200);
  };
  const cap = setTimeout(finish, 20000);                                 // hard cap so a huge repo can't run away
  const poll = setInterval(() => { if (!playing && ptr >= commits.length - 1) finish(); }, 150);
  seek(-1); speed = Math.max(3, Math.min(120, commits.length / 11));     // pace the pass to land near ~12s
  rec.start(); setPlay(true);
});

// the demo movie ends → hold on the finished city and point the viewer at the forge box to build their own
function showFinishCTA() {
  if (document.getElementById('tl-cta')) return;
  const cta = document.createElement('div');
  cta.id = 'tl-cta';
  cta.innerHTML = `<div class="cta-s">now build your own &#8593;</div>`
                + `<div class="cta-h">${esc(document.body.dataset.hallName || 'this city')} — built from ${commits.length} commits.</div>`;
  const forge = document.querySelector('#forge');        // flows in the forge box, just below the input
  (forge || document.body).appendChild(cta);
  document.querySelector('#forge input')?.focus();
}

// ---- grand-opening celebration: pixel confetti + firework bursts over the finished city. Fires ONCE, only
//      when a user's own forged repo first finishes building (not the demo's scripted ribbon-cut, not a re-watch). ----
function celebrate() {
  const cv = document.createElement('canvas');
  cv.id = 'tl-confetti';
  Object.assign(cv.style, { position: 'fixed', inset: '0', zIndex: 41, pointerEvents: 'none' });   // above the city, below the dialogue card (z42)
  cv.width = innerWidth; cv.height = innerHeight;
  document.body.appendChild(cv);
  const g = cv.getContext('2d');
  const COLORS = ['#d4a953', '#f3cfd9', '#52e3d4', '#7edeff', '#c0395b', '#f9efe3', '#e8a8bd'];
  const rnd = (a, b) => a + Math.random() * (b - a), pick = () => COLORS[Math.floor(Math.random() * COLORS.length)];
  const parts = [];
  for (let i = 0; i < 170; i++)                            // confetti rains from above, tumbling
    parts.push({ x: rnd(0, cv.width), y: rnd(-cv.height, 0), vx: rnd(-40, 40), vy: rnd(70, 220),
      s: rnd(4, 9), rot: rnd(0, 6.3), vr: rnd(-7, 7), col: pick(), conf: true });
  const burst = (cx, cy) => { const col = pick();          // a firework: a ring of sparks from one point
    for (let i = 0; i < 48; i++) { const a = i / 48 * 6.283, sp = rnd(50, 170);
      parts.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s: rnd(3, 6), col, life: rnd(.9, 1.5), age: 0 }); } };
  let start = 0, prev = 0, nextBurst = .15, fired = 0;
  (function frame(t) {
    if (!start) start = prev = t;
    const dt = Math.min(.05, (t - prev) / 1000), el = (t - start) / 1000; prev = t;
    if (el > nextBurst && fired < 6) { burst(rnd(cv.width * .15, cv.width * .85), rnd(cv.height * .15, cv.height * .5)); nextBurst += rnd(.25, .55); fired++; }
    g.clearRect(0, 0, cv.width, cv.height);
    for (const p of parts) {
      p.vy += (p.conf ? 130 : 200) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.conf) { p.rot += p.vr * dt; g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillStyle = p.col; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); g.restore(); }
      else { p.age += dt; const a = Math.max(0, 1 - p.age / p.life);
        if (a > 0) { g.globalAlpha = a; g.fillStyle = p.col; g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); g.globalAlpha = 1; } }
    }
    if (el < 5) requestAnimationFrame(frame); else cv.remove();
  })(performance.now());
}

let celebrated = false;                                    // guard: at most one grand opening per page load
function onMovieComplete() {
  if (celebrated || !isForge || scriptedForge) return;     // a user's own forge only — not the demo's scripted ribbon-cut
  const url = (citySrc.match(/url=([^&]+)/) || [])[1];
  if (!url) return;
  const key = 'apx-opened-' + url;
  if (localStorage.getItem(key)) return;                   // already threw this repo its grand opening
  localStorage.setItem(key, '1');
  celebrated = true;
  celebrate();
  setTimeout(() => window.tourCelebrate?.(), 1300);          // once the confetti is flying, the Chief of Staff takes a bow
}

// ---- transport bar (built in JS so the shared shell stays untouched) ----
function buildTransport() {
  // the bar lives in the map frame's flow, just below the canvas; the canvas yields a fixed strip for it
  // so the single view never scrolls. Fixed outer width + ellipsis label keep it from jittering per frame.
  // exit mirrors the entry: a local repo's movie returns to its live city, a forge returns to its quick
  // static city. A marathon is a curated playlist with no single live counterpart, so it gets no exit.
  const fm = citySrc.match(/url=([^&]+)/);
  const liveHref = fm ? '/?forge=' + fm[1] + '&static'
    : new URLSearchParams(location.search).has('marathon') ? null : '/';
  const css = `#transport{flex:0 0 auto;align-self:center;width:min(680px,100%);box-sizing:border-box;
    display:flex;align-items:center;gap:10px;padding:7px 12px;background:rgba(42,16,36,.9);
    border:2px solid var(--gold);box-shadow:3px 3px 0 var(--plum);font-family:'Silkscreen',monospace;
    color:var(--cream);font-size:10px}
    #transport button{cursor:pointer;background:var(--plum-soft);color:var(--cream);border:1px solid var(--gold);
    font:inherit;width:30px;height:26px;flex:0 0 auto}#transport button:hover{background:var(--gold);color:var(--plum)}
    #tl-track{flex:3 1 auto;min-width:120px;position:relative;display:flex;align-items:center}
    #tl-track #tl-seek{flex:1 1 auto;min-width:0;margin:0;accent-color:var(--gold)}
    #tl-ticks{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:13px;pointer-events:none}
    #tl-ticks i{position:absolute;top:0;width:2px;height:13px;margin-left:-1px;background:var(--cream);
      opacity:.6;box-shadow:0 0 2px rgba(26,10,20,.8)}
    #transport input[type=range]{accent-color:var(--gold)}
    #transport select{flex:0 0 auto;background:var(--plum-soft);color:var(--cream);border:1px solid var(--gold);font:inherit}
    #tl-label{flex:1 1 0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85}
    #tl-exit{width:auto;padding:0 9px}
    /* date stamp rides the top-right of the canvas, hugging the edge so it clears the title — synced to the playhead */
    #tl-date{position:absolute;top:14px;right:18px;z-index:4;pointer-events:none;text-align:right;
      font-family:'Silkscreen',monospace;font-size:13px;letter-spacing:.07em;color:var(--cream);
      opacity:.5;text-shadow:0 2px 7px rgba(0,0,0,.75)}
    /* phones: trim to the video-player essentials (play / scrub / speed / exit), bigger touch targets */
    @media (max-width:720px){#transport{gap:6px;padding:8px 8px;font-size:11px}
      #transport button{width:36px;height:36px}#tl-trans,#tl-shape,#tl-label{display:none}
      #tl-track{min-width:50px}#tl-seek{min-width:0}#tl-exit{padding:0 9px}
      #tl-date{font-size:10px;top:10px}}`;
  document.head.appendChild(document.createElement('style')).textContent = css;
  const bar = document.createElement('div');
  bar.id = 'transport';
  bar.innerHTML =
    `<button id="tl-prev" title="previous chapter (,)">⏮</button>` +
    `<button id="tl-play" title="play / pause (space)">▶</button>` +
    `<button id="tl-next" title="next chapter (.)">⏭</button>` +
    `<div id="tl-track"><input id="tl-seek" type="range" min="-1" max="${commits.length - 1}" value="-1"` +
       ` title="scrub (← →)"><div id="tl-ticks"></div></div>` +
    `<select id="tl-speed" title="playback speed">
       <option value="auto" selected>auto</option><option value="6">0.5×</option><option value="12">1×</option>
       <option value="24">2×</option><option value="40">3×</option><option value="60">5×</option>
       <option value="120">10×</option><option value="240">20×</option></select>` +
    `<select id="tl-trans" title="how the city re-forms between formations">` +
       TRANSITION_MODES.map(m => `<option value="${m}"${m === transMode ? ' selected' : ''}>${m}</option>`).join('') +
    `</select>` +
    `<select id="tl-shape" title="how building shapes are chosen">` +
       City.SHAPE_MODES.map(m => `<option value="${m}"${m === City.shapeMode ? ' selected' : ''}>${m}</option>`).join('') +
    `</select>` +
    `<span id="tl-label"></span>` +
    (liveHref ? `<button id="tl-exit" title="back to the live city">&#9632; live</button>` : '');
  const wrap = document.querySelector('.mapwrap');
  wrap.classList.add('tl-mode');                          // column layout: canvas on top, bar in the strip below
  wrap.appendChild(bar);
  dateEl = document.createElement('div'); dateEl.id = 'tl-date'; wrap.appendChild(dateEl);   // top center-right date stamp
  slider = bar.querySelector('#tl-seek');
  label = bar.querySelector('#tl-label');
  bar.querySelector('#tl-play').onclick = () => setPlay(!playing);
  bar.querySelector('#tl-prev').onclick = () => jumpChapter(-1);
  bar.querySelector('#tl-next').onclick = () => jumpChapter(1);
  slider.oninput = () => { setPlay(false); seek(+slider.value); };
  const ticks = bar.querySelector('#tl-ticks');           // a chapter mark at each formation transition
  for (let e = 1; e < layouts.length; e++) {
    const mark = document.createElement('i');
    mark.style.left = (layouts[e].ep.start + 1) / commits.length * 100 + '%';   // slider domain is [-1, len-1]
    mark.title = layouts[e].ep.formation.id;
    ticks.appendChild(mark);
  }
  bar.querySelector('#tl-speed').onchange = e => speed = e.target.value === 'auto' ? autoSpeed() : +e.target.value;
  bar.querySelector('#tl-trans').onchange = e => transMode = e.target.value;
  bar.querySelector('#tl-shape').onchange = e => {          // re-shape every pre-built epoch; the loop repaints
    City.setShapeMode(e.target.value);
    for (const l of layouts) City.applyShapes(l.state);
  };
  if (liveHref) bar.querySelector('#tl-exit').onclick = () => location.href = liveHref;
}

function buildLegend(data) {
  const legend = document.getElementById('legend');
  if (!legend) return;
  const controls = legend.lastElementChild;
  const add = html => { const el = document.createElement('div'); el.className = 'row';
    el.innerHTML = html; legend.insertBefore(el, controls); };
  const plaque = t => { const el = document.createElement('div'); el.className = 'plaque';
    el.textContent = t; legend.insertBefore(el, controls); };
  plaque('districts');
  for (const b of state.blocks)
    add(`<span class="chip" style="background:${b.comp.color}"></span>${b.comp.name.toLowerCase()}`);
}

// ---- explanation box: the dispatch floor becomes a live, repo-specific legend in movie mode ----
// Every card is filled from THIS commit's city. The shape card spells out the actual metrics
// (mass / dominance / layer balance) that picked the formation — the viewer sees the secret sauce,
// not a generic label. District + landmark cards appear/disappear as the history makes them true.
const KIND_ROLE = { civic: 'the town center & shared root files', frontend: 'UI, views & client code',
  storage: 'data, models & persistence', api: 'service endpoints & contracts',
  infra: 'CI, tooling, docker & scripts', tests: 'the quality-assurance quarter',
  docs: 'documentation & examples', service: 'application modules', auto: 'loose root files' };
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const card = (title, html, chip, focus, tip = focus) => `<div class="xcard"${focus ? ` data-focus="${focus}"` : ''}`
  + `${tip ? ` data-tip="${tip}"` : ''}><h5>${chip
  ? `<span class="chip" style="background:${chip}"></span>` : ''}${esc(title)}</h5><p>${html}</p></div>`;

// ---- pedagogical tooltips: hover any card for the "why" behind the thing it names ----
// Keyed by the card's data-tip topic (defaults to its focus key, so the landmark cards are covered for free).
const TIP = {
  commit: `<h6>One commit = one frame</h6>This movie replays the repo's git history commit by commit. The city is the repo as it stood at <b>this</b> commit — every file that existed is a building, and a building's height is the share of its own commits that have landed so far. The next commit redraws the frame; that's the growth you're watching.`,
  stats: `<h6>Live readout</h6>A running census of the city at this commit. <b>buildings</b> = files alive now, <b>lines</b> = their summed lines of code, <b>districts</b> = code clusters grown big enough to show, and <b>shape</b> = the formation the metrics below have chosen for this moment.`,
  reform: `<h6>Why the city re-formed</h6>The formation isn't fixed — it's recomputed as history unfolds. When the repo crosses a structural threshold (one area's imports start to dominate, the layers fall into balance, or it splinters into islands) the whole city re-forms. This card marks the exact commit it flipped, and which threshold did it.`,
  'form:village': `<h6>Small Town</h6>The repo is still small — fewer files than the downtown threshold. No area is large or interconnected enough to anchor a center, so the city stays a loose green hamlet of neighborhoods. Most repos start here.`,
  'form:acropolis': `<h6>Acropolis</h6>One dense core has outgrown a hamlet, but the repo still has only a district or two. Rather than sprawl, it terraces upward — a single concentrated core paved in concentric steps. The mark of an early codebase with one heavy center.`,
  'form:radial': `<h6>Radial</h6>One district carries far more than its even share of the repo's import coupling — other code leans on it heavily (high "mass" and "dominance"). The city orbits that hub in rings, like a downtown wrapped around a single landmark.`,
  'form:spine': `<h6>Spine</h6>The data-flow layers — front-end, services, storage — are roughly balanced in size. A full-stack boulevard stacks them back-to-front along one axis, so you can read the request path as a street.`,
  'form:constellation': `<h6>Constellation</h6>The repo has many districts, but a large fraction are islands — clusters that barely import from one another. Low cohesion turns the map into an archipelago of separate components bridged across water.`,
  'form:grid': `<h6>Grid</h6>Many peer districts of comparable weight, with no single coupling hub dominating. With no center to orbit, the city lays out as a downtown grid of equals — the look of a mature, modular codebase.`,
  district: `<h6>Districts & the coupling hub</h6>Files are clustered into districts by what they do — UI, storage, API, tests, infra — inferred from their paths and imports. Each gets its own color and plot, and grows as files land in it. The ★ <b>coupling hub</b> is the district the rest of the codebase imports from most: the city's center of gravity.`,
  hub: `<h6>Import hubs</h6>The tall antennas mark files in the repo's top 10% by incoming imports — the modules everything else depends on. They're load-bearing: a change to a hub file tends to ripple across the whole codebase, so they're worth watching.`,
  debt: `<h6>TODO debt</h6>Cranes hover over the files in the top 10% by count of TODO / FIXME / HACK markers — the city's unfinished lots, work the codebase has flagged for itself but not yet built out.`,
  deps: `<h6>Freight rail</h6>The freight line carries the project's third-party dependencies, read straight from its manifest (package.json, pyproject.toml, and the like). Each car is one external library the repo pulls in to run.`,
  docker: `<h6>Docker harbor</h6>Ships moored at the harbor are the container services the project declares in its Dockerfiles and compose files — its deployable units, at a glance.`,
  graves: `<h6>The graveyard</h6>Headstones below the city are files that once existed and were later deleted. They accumulate as the movie plays — the repo's archaeological layer, showing how much was torn down to get here.`,
  relics: `<h6>Village relics</h6>When a hamlet grows into a city its rural fixtures don't just vanish: the old well becomes a fountain, and the herd and windmill migrate to a city farm on the outskirts. Relics are the visual memory of the repo's small-town beginnings.`,
  street: `<h6>Street life</h6>Ambient life tracks recent activity — residents on foot and cars on the road thicken in whichever districts saw the most recent commits, and thin where work has gone quiet. A glanceable heat-map of where the action is now.`,
  stall: `<h6>Market stalls</h6>Stalls ring the central plaza, one per district still receiving commits at this point in history. As parts of the codebase fall dormant their stalls disappear, so the market shows the repo's currently-active surface.`,
  boat: `<h6>Canal traffic</h6>Canals divide the data-flow layers of the city. The boats working them stand for traffic between those layers — a nod to how data moves through the stack from one tier to the next.`,
};
let tipEl = null;
function hideTip() { if (tipEl) tipEl.style.display = 'none'; }
function placeTip(cardEl) {                                // float above the card, flip below + clamp if no room
  const r = cardEl.getBoundingClientRect(), t = tipEl.getBoundingClientRect();
  const left = Math.max(8, Math.min(r.left + r.width / 2 - t.width / 2, innerWidth - t.width - 8));
  const top = r.top - t.height - 10;
  tipEl.style.left = left + 'px';
  tipEl.style.top = (top < 8 ? r.bottom + 10 : top) + 'px';
}
function showTip(cardEl) {
  const html = TIP[cardEl.dataset.tip]; if (!html) return hideTip();
  tipEl.innerHTML = html; tipEl.style.display = 'block'; placeTip(cardEl);
}

function buildExplain() {
  const dock = document.getElementById('dock');
  if (!dock) return;
  if (window.DEMO_MOVIE) {                          // the agent-speed meme: keep the live dispatch hall, no explain cards
    startDemoLoop?.(state.buildings, { interval: 300 });
    return;
  }
  document.querySelector('#dock .dispatch')?.style.setProperty('display', 'none');   // retire the agent floor
  document.getElementById('ticker')?.style.setProperty('display', 'none');
  const css = `#explain{flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;
    overflow-y:auto;padding:2px}
    .xcard{flex:1 1 150px;min-width:140px;max-width:230px;background:rgba(42,16,36,.96);
    border:2px solid var(--gold);box-shadow:4px 4px 0 var(--plum-soft);display:flex;flex-direction:column;
    transition:transform .12s ease,box-shadow .12s ease,outline-color .12s ease;outline:2px solid transparent;outline-offset:1px}
    .xcard[data-focus]{cursor:pointer}
    .xcard[data-focus]:hover,.xcard.xfocus{transform:translateY(-4px);outline-color:#f2b5c9;
    box-shadow:5px 9px 0 var(--plum-soft),0 0 12px rgba(232,168,189,.55)}
    .xcard.live{flex:1 1 230px;max-width:320px}
    .xcard h5{background:var(--gold);color:var(--plum);font:700 10px 'Silkscreen',monospace;
    letter-spacing:.1em;text-transform:uppercase;padding:5px 8px;display:flex;align-items:center;gap:6px}
    .xcard h5 .chip{width:10px;height:10px;flex:0 0 10px;border:1px solid var(--plum)}
    .xcard p{font:9px 'Silkscreen',monospace;color:var(--cream);line-height:1.55;padding:7px 9px;margin:0}
    .reform-scroll{max-height:220px;overflow-y:auto}
    .reform-scroll p+p{border-top:1px solid rgba(243,207,217,.15)}
    .xcard .em{color:var(--gold)}
    #explain .stat-grid{margin:0}
    #explain .stat-value{color:var(--cream)}
    .xcard[data-tip]{cursor:help}
    #xtip{position:fixed;z-index:60;max-width:300px;display:none;pointer-events:none;
    background:rgba(28,10,24,.98);border:2px solid var(--gold);box-shadow:5px 5px 0 var(--plum-soft);
    padding:9px 11px;font:9px 'Silkscreen',monospace;color:var(--cream);line-height:1.6}
    #xtip h6{margin:0 0 5px;font:700 10px 'Silkscreen',monospace;color:var(--pink-deep);
    letter-spacing:.08em;text-transform:uppercase}
    #xtip b{color:var(--gold)}`;
  document.head.appendChild(document.createElement('style')).textContent = css;
  const box = document.createElement('div'); box.id = 'explain';
  dock.appendChild(box);
  tipEl = document.createElement('div'); tipEl.id = 'xtip'; document.body.appendChild(tipEl);
  box.addEventListener('mouseover', e => { const c = e.target.closest('.xcard[data-tip]'); if (c) showTip(c); });
  box.addEventListener('mouseout', e => { const c = e.target.closest('.xcard[data-tip]'); if (c && !c.contains(e.relatedTarget)) hideTip(); });
}

const FORM_TITLE = { village: 'Small Town', acropolis: 'Acropolis', radial: 'Radial', spine: 'Spine',
                     constellation: 'Constellation', grid: 'Grid' };
const RELIC_KIND = { cityfarm: 'city farm', windmill: 'windmill', fountain: 'fountain', watertower: 'water tower' };

function formationCard(id, s) {                            // the secret sauce, in this repo's own thresholds
  const k = City.FORM_CUT, d = s.dominance.toFixed(1), m = s.mass.toFixed(1);
  const layers = Object.entries(s.tiers).map(([l, v]) => `${l} ${v}`).join(' · ') || '—';
  const frag = (s.fragmentation * 100).toFixed(0);
  const why = {
    village: `Just ${s.nbuild} files — below the downtown threshold (≤${k.files} files).
      A green hamlet of neighborhoods, no center yet.`,
    acropolis: `Only <span class="em">${pl(s.n, 'core district')}</span> (≤${k.districts}) but ${s.nbuild} files —
      one dense core grown too big for a hamlet, paved in concentric terraces.`,
    radial: `<span class="em">${esc(s.hubName || 'one district')}</span> carries <span class="em">${d}×</span> its even
      share of the repo's coupling (mass ${m} ≥ ${k.mass}, dominance ${d} ≥ ${k.dominance}) — the city orbits it in rings.`,
    spine: `The data-flow layers are <span class="em">balanced</span> (${layers}) —
      a full-stack boulevard stacks them back-to-front.`,
    constellation: `<span class="em">${pl(s.n, 'district')}</span> (≥${k.peers}) but <span class="em">${frag}%</span> are
      islands (≥${(k.fragment * 100).toFixed(0)}%) — a fragmented archipelago, bridged across the water.`,
    grid: `<span class="em">${pl(s.n, 'peer district')}</span> with no dominant coupling hub
      (dominance ${d} < ${k.dominance}) and no balanced layer stack — a downtown grid of equals.`,
  };
  return card('Shape · ' + (FORM_TITLE[id] || id), why[id] || '', null, 'shape:' + (s.hub || ''), 'form:' + id);
}

function reformReason(to, s) {                             // the one threshold the repo crossed to trigger the re-form
  const k = City.FORM_CUT, d = s.dominance.toFixed(1), m = s.mass.toFixed(1);
  return {
    acropolis: `it outgrew the hamlet but stayed <span class="em">${pl(s.n, 'core district')}</span> — a single dense core.`,
    radial: `<span class="em">${esc(s.hubName || 'one district')}</span>'s coupling took over (mass ${m} ≥ ${k.mass}, dominance ${d} ≥ ${k.dominance}).`,
    spine: `the data-flow layers came into balance.`,
    constellation: `it fragmented into <span class="em">${pl(s.n, 'island district')}</span> across the water.`,
    grid: `it outgrew a single hub into <span class="em">${pl(s.n, 'peer district')}</span> with no clear center.`,
    village: `it settled back below the downtown threshold.`,
  }[to] || '';
}

// Additive history: one row per transition the repo has crossed so far — the full chain of how it
// reached its current shape, each with the commit it happened on and the threshold that triggered it.
function reformedCard() {
  if (epochIndex <= 0) return '';                          // epoch 0 was never re-formed into
  const rows = [];
  for (let k = 1; k <= epochIndex; k++) {
    const from = layouts[k - 1].ep.formation.id, to = layouts[k].ep.formation.id;
    const at = layouts[k].ep.start, c = commits[at];
    const s = City.statsOf({ zone: state.zone, buildings: layouts[k].ep.buildingsAlive });
    const when = c ? `commit ${at + 1} · ${new Date(c.ts * 1000).toLocaleDateString()}` : `commit ${at + 1}`;
    rows.push(`<p><span class="em">${FORM_TITLE[from] || from}</span> → <span class="em">${FORM_TITLE[to] || to}</span> at <span class="em">${when}</span>`
      + ` — ${reformReason(to, s)}${c ? `<br>"${esc(c.subject)}"` : ''}</p>`);
  }
  const now = layouts[epochIndex].ep.formation.id;
  return `<div class="xcard live" data-tip="reform" style="border-color:var(--pink-deep)">`
    + `<h5>⟳ Re-Formed · ${rows.length === 1 ? (FORM_TITLE[now] || now) : pl(rows.length, 'transition')}</h5>`
    + `<div class="reform-scroll">` + rows.join('') + `</div></div>`;
}

function renderExplain(shown, i) {
  const box = document.getElementById('explain');
  if (!box || !state) return;
  hideTip();                                              // DOM is about to be rebuilt; drop any open tooltip
  const c = commits[i], id = layouts[epochIndex].ep.formation.id;
  const s = City.statsOf({ zone: state.zone, buildings: shown });
  const perDist = {};                                     // standing buildings per district at this commit
  for (const b of shown) perDist[b.component] = (perDist[b.component] || 0) + 1;
  const districts = state.zone.components                 // hub first (the secret-sauce protagonist), then by size
    .filter(d => d.kind !== 'auto' && perDist[d.id])
    .sort((a, b) => (b.id === s.hub) - (a.id === s.hub) || perDist[b.id] - perDist[a.id]);
  const hubs = shown.filter(b => b.hub).length, debts = shown.filter(b => b.debt).length;
  const graves = state.buildings.filter(b => b.death !== undefined && i >= b.death).length;
  const loc = shown.reduce((a, b) => a + (b.loc || 0), 0);
  const amb = k => (state._props || []).filter(p => p.kind === k).length;   // ambient life present this epoch
  const relics = (state._props || []).filter(p => RELIC_KIND[p.kind]).length;
  const onFoot = amb('walker'), cars = amb('traffic'), boats = amb('boat'), stalls = amb('stall'), crows = amb('crow');
  const stat = (l, v) => `<div class="stat-cell"><span class="stat-label">${l}</span><span class="stat-value">${v}</span></div>`;
  const cards = [];
  if (c) cards.push(card('Now Playing', `<span class="em">${esc(new Date(c.ts * 1000).toLocaleDateString())}</span> · ${esc(c.author)}`
    + ` · ${pl(c.files.length, 'file')} changed<br>"${esc(c.subject)}"`, null, null, 'commit'));   // always first: the commit driving this frame
  cards.push(`<div class="xcard live" data-tip="stats"><h5>${esc(state.zone.repo || 'city')} · live</h5><div class="stat-grid">`
    + stat('commit', `${i + 1}/${commits.length}`) + stat('date', c ? new Date(c.ts * 1000).toLocaleDateString() : '—')
    + stat('buildings', shown.length) + stat('lines', loc.toLocaleString())
    + stat('districts', districts.length) + stat('shape', id) + `</div></div>`);
  const reformed = reformedCard(); if (reformed) cards.push(reformed);   // persists until the next re-form
  cards.push(formationCard(id, s));
  for (const d of districts)
    cards.push(card(d.name, `<span class="em">${pl(perDist[d.id], 'file')}</span> · ${KIND_ROLE[d.kind] || d.kind}`
      + (d.id === s.hub ? ' · <span class="em">★ coupling hub</span>' : ''), d.color, 'district:' + d.id, 'district'));
  if (hubs) cards.push(card('Import Hubs', `Antennas mark ${pl(hubs, 'file')} in the repo's top 10% by imports — the wiring others lean on.`, null, 'hub'));
  if (debts) cards.push(card('TODO Debt', `Cranes hang over ${pl(debts, 'file')} in the top 10% by TODO / FIXME count.`, null, 'debt'));
  if (state.deps.length) cards.push(card('Freight Rail', `${state.deps.length} package deps ride the freight line — read from the manifest.`, null, 'deps'));
  if (state.docker.length) cards.push(card('Docker Harbor', `${pl(state.docker.length, 'container service')} moored at the harbor — from compose / Dockerfiles.`, null, 'docker'));
  if (graves) cards.push(card('Graveyard', `${pl(graves, 'file')} deleted across history so far — headstones below the city${crows ? ', crows wheeling overhead' : ''}.`, null, 'graves'));
  if (relics) cards.push(card('Village Relics', `The old well became a fountain and the herd + windmill migrated to a city farm on the outskirts — ${pl(relics, 'relic')} the hamlet left behind.`, null, 'relics'));
  if (onFoot || cars) cards.push(card('Street Life', `<span class="em">${pl(onFoot, 'resident')}</span> out on foot and <span class="em">${pl(cars, 'car')}</span> on the roads — both thicken in the districts touched most recently.`, null, 'street'));
  if (stalls) cards.push(card('Market', `${pl(stalls, 'stall')} ring the plaza — one per district still seeing active commits.`, null, 'stall'));
  if (boats) cards.push(card('Canal Traffic', `${pl(boats, 'boat')} work the canals that divide the data-flow layers.`, null, 'boat'));
  const keepScroll = box.querySelector('.reform-scroll')?.scrollTop || 0;   // survive the innerHTML rebuild
  box.innerHTML = cards.join('');
  const scroller = box.querySelector('.reform-scroll');
  if (scroller)                                            // new transition → jump to it; otherwise hold the reader's place
    scroller.scrollTop = epochIndex > reformShown ? scroller.scrollHeight : keepScroll;
  reformShown = epochIndex;
}

// ---- card → map: hovering a card (or a building / fixture on the map) traces a thick gold outline
// around every item it names — the same bold highlighter the freight rail wears. Driven off the live
// :hover state each frame, so it survives the per-commit card rebuild with no listeners. ----
function propBox(p) {                                       // a point-prop's footprint: a small box at its anchor
  const { sx, sy } = City.proj(cam, p.x, p.y), s = cam.s;
  return { x0: sx - 8 * s, x1: sx + 8 * s, y0: sy - 14 * s, y1: sy + 2 * s };
}
function focusShapes(focus) {                              // hit-rects (buildings, cars) + rail segments to outline
  const [type, arg] = focus.split(':');
  const drawn = (state.items || []).filter(b => b.screen && !b.kind);
  if (type === 'district') return drawn.filter(b => b.component === arg);   // buildings → footprint silhouette
  if (type === 'hub') return drawn.filter(b => b.hub);
  if (type === 'debt') return drawn.filter(b => b.debt);
  if (type === 'graves') return drawn.filter(b => b.ruined);
  if (type === 'deps') return (state.hits || []).filter(h => /freight|package/i.test(h.tip || ''));
  if (type === 'docker') return (state.hits || []).filter(h => /service|image/i.test(h.tip || ''));
  if (type === 'relics') return (state.items || []).filter(p => RELIC_KIND[p.kind]).map(propBox);
  const kinds = type === 'street' ? ['walker', 'traffic'] : [type];   // ambient props
  return (state.items || []).filter(p => kinds.includes(p.kind)).map(propBox);
}

function drawFocus(focus) {
  if (!focus || !state) return;
  const ctx = tlCtx, s = cam.s;
  ctx.save();
  ctx.strokeStyle = '#ffd678'; ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2.5, 3 * s);
  if (focus.startsWith('shape')) {                         // the whole footprint: one gold diamond
    const c = [[0, 0], [state.W, 0], [state.W, state.H], [0, state.H]].map(([x, y]) => City.proj(cam, x, y));
    ctx.beginPath(); ctx.moveTo(c[0].sx, c[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i].sx, c[i].sy);
    ctx.closePath(); ctx.stroke(); ctx.restore(); return;
  }
  const foots = [];                                        // every item → an iso diamond, unioned into one silhouette
  for (const sh of focusShapes(focus)) {
    if (sh.foot !== undefined) foots.push(footPoly(sh));   // a real building: its projected footprint
    else if (sh.ax !== undefined) {                        // rail segment: re-stroke the line thick
      ctx.beginPath(); ctx.moveTo(sh.ax, sh.ay); ctx.lineTo(sh.bx, sh.by); ctx.stroke();
    } else foots.push(diamondFromBox(sh));                 // fixture hit-rect: inscribed diamond, same silhouette look
  }
  if (foots.length) drawSilhouette(ctx, foots);
  ctx.restore();
}

// A building's iso footprint: four base corners projected to screen (same square drawBuilding stands on).
function footPoly(b) {
  const f = (b.foot || 1) / 2;
  return [[b.x - f, b.y - f], [b.x + f, b.y - f], [b.x + f, b.y + f], [b.x - f, b.y + f]]
    .map(([x, y]) => City.proj(cam, x, y));
}
// A fixture has only a screen-space hit-rect (no world footprint) — inscribe a diamond so it joins the silhouette.
function diamondFromBox(b) {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return [{ sx: cx, sy: b.y0 }, { sx: b.x1, sy: cy }, { sx: cx, sy: b.y1 }, { sx: b.x0, sy: cy }];
}

// True silhouette: fill the union of all footprints on an offscreen mask, erase the interior shrunk
// by a band, colour what's left. Overlapping diamonds merge — only the outer boundary survives, so a
// district reads as one outline instead of a pile of boxes. The glow is the same gold highlighter.
let maskCv;
function drawSilhouette(ctx, polys) {
  const W = tlCanvas.width, H = tlCanvas.height, band = Math.max(2, 2.5 * cam.s);
  if (!maskCv) maskCv = document.createElement('canvas');
  if (maskCv.width !== W || maskCv.height !== H) { maskCv.width = W; maskCv.height = H; }
  const m = maskCv.getContext('2d');
  m.clearRect(0, 0, W, H);
  m.fillStyle = '#fff'; fillPolys(m, polys);                          // solid union
  m.globalCompositeOperation = 'destination-out';
  fillPolys(m, polys.map(p => insetPoly(p, band)));                   // punch out the interior → leaves the rim
  m.globalCompositeOperation = 'source-in';
  m.fillStyle = '#ffd678'; m.fillRect(0, 0, W, H);                    // tint the rim gold
  m.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.shadowColor = 'rgba(255,214,120,.7)'; ctx.shadowBlur = 8 * cam.s;
  ctx.drawImage(maskCv, 0, 0);
  ctx.restore();
}
function fillPolys(c, polys) {                             // one path, nonzero winding → overlaps union, not cancel
  c.beginPath();
  for (const p of polys) { c.moveTo(p[0].sx, p[0].sy); for (let i = 1; i < p.length; i++) c.lineTo(p[i].sx, p[i].sy); c.closePath(); }
  c.fill();
}
function insetPoly(p, d) {                                 // pull each corner d px toward the centroid
  const cx = (p[0].sx + p[1].sx + p[2].sx + p[3].sx) / 4, cy = (p[0].sy + p[1].sy + p[2].sy + p[3].sy) / 4;
  return p.map(q => { const dx = cx - q.sx, dy = cy - q.sy, L = Math.hypot(dx, dy) || 1; return { sx: q.sx + dx / L * d, sy: q.sy + dy / L * d }; });
}

// The hover link runs both ways: a hovered card OR a hovered building/fixture resolves to one focus.
// `ping` is what pulses on the map; `cards` is the set of data-focus keys whose legend cards raise.
let mapHit = null;                                         // building / fixture under the mouse on the map
function activeFocus() {
  const hov = document.querySelector('#explain .xcard[data-focus]:hover');
  if (hov) return { ping: hov.dataset.focus, cards: new Set([hov.dataset.focus]) };
  if (mapHit && mapHit.component) {                        // a building → its district (+ any feature it is)
    const cards = new Set(['district:' + mapHit.component]);
    if (mapHit.hub) cards.add('hub');
    if (mapHit.debt) cards.add('debt');
    if (mapHit.ruined) cards.add('graves');
    return { ping: 'district:' + mapHit.component, cards };
  }
  if (mapHit) {                                            // a fixture: freight car / ship / headstone
    const tip = mapHit.tip || '';
    if (/freight|package/i.test(tip)) return { ping: 'deps', cards: new Set(['deps']) };
    if (/service|image/i.test(tip)) return { ping: 'docker', cards: new Set(['docker']) };
    if (mapHit.scroll) return { ping: 'graves', cards: new Set(['graves']) };
  }
  return { ping: null, cards: new Set() };
}
function applyCardHighlight(keys) {                         // raise + outline the cards matching the active focus
  for (const el of document.querySelectorAll('#explain .xcard[data-focus]'))
    el.classList.toggle('xfocus', keys.has(el.dataset.focus));
}
let lastMapKey = null;
function syncScroll(ping) {                                 // map→card: reveal an off-screen card when the focus changes
  const key = mapHit ? ping : null;                        // only auto-scroll when the map drives the focus
  if (key === lastMapKey) { lastMapKey = key; return; }
  lastMapKey = key;
  if (key) document.querySelector('#explain .xcard[data-focus="' + key + '"]')
    ?.scrollIntoView({ block: 'nearest' });
}

// ---- interaction (compact: pan / zoom / rotate) ----
function zoom(k, mx = tlCanvas.width / 2, my = tlCanvas.height / 2) {
  cam.ox = mx + (cam.ox - mx) * k; cam.oy = my + (cam.oy - my) * k; cam.s *= k;
}
function rotate(d) { cam.rot = ((cam.rot || 0) + (d > 0 ? 1 : 7)) % 8; }
const CTL = { 'rot-': () => rotate(-1), 'rot+': () => rotate(1),
  'zoom+': () => zoom(1.18), 'zoom-': () => zoom(1 / 1.18),
  'reset': () => { cam.rot = 0; City.fit(cam, tlCanvas, state, ...FIT); } };
document.getElementById('mapctl').addEventListener('click', e => {
  const act = e.target.dataset.act; if (act && state) CTL[act]();
});
// keyboard transport — space play/pause, ← → scrub, , / . hop chapters, Home/End jump to ends, q/e rotate.
// A focused input/select keeps its native keys; the tour owns the rest of the keyboard while its overlay is up.
const tourActive = () => { const b = document.getElementById('tour-block'); return !!b && b.style.display === 'block'; };
window.addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) return;
  if (e.key === 'q' || e.key === 'e') { rotate(e.key === 'q' ? 1 : -1); return; }   // rotate works even mid-tour
  if (tourActive()) return;
  if (e.key === ' ') { e.preventDefault(); setPlay(!playing); }
  else if (e.key === 'ArrowRight') { setPlay(false); seek(Math.min(commits.length - 1, ptr + 1)); }
  else if (e.key === 'ArrowLeft') { setPlay(false); seek(Math.max(-1, ptr - 1)); }
  else if (e.key === '.' || e.key === '>') jumpChapter(1);
  else if (e.key === ',' || e.key === '<') jumpChapter(-1);
  else if (e.key === 'Home') { setPlay(false); seek(-1); }
  else if (e.key === 'End') { setPlay(false); seek(commits.length - 1); }
});
tlCanvas.addEventListener('wheel', m => {
  m.preventDefault();
  const r = tlCanvas.getBoundingClientRect();
  zoom(m.deltaY < 0 ? 1.12 : 1 / 1.12,
    (m.clientX - r.left) * (tlCanvas.width / r.width), (m.clientY - r.top) * (tlCanvas.height / r.height));
}, { passive: false });
let drag = null;
tlCanvas.addEventListener('mousedown', m => drag = { x: m.clientX, y: m.clientY });
window.addEventListener('mouseup', () => drag = null);
window.addEventListener('mousemove', m => {
  if (!drag) return;
  const r = tlCanvas.getBoundingClientRect();
  cam.ox += (m.clientX - drag.x) * (tlCanvas.width / r.width);
  cam.oy += (m.clientY - drag.y) * (tlCanvas.height / r.height);
  drag.x = m.clientX; drag.y = m.clientY;
});

// ---- hover tooltips: same City.pick inspector as the live city, plus the building's live encoding ----
function buildingTags(b) {                                 // decode the pixels the viewer is looking at
  const t = [];
  if (b.ruined) t.push('ruin — deleted file');
  if (b.scaffold) t.push('under construction');
  if (b.lit > 0.5) t.push('lit windows — touched recently');
  if (b.billboard) t.push("billboard — district's hottest third");
  if (b.hub) t.push('antennas — import hub');
  if (b.debt) t.push('crane — TODO / FIXME debt');
  return t;
}
function tipAt(mx, my, cx, cy) {
  const hit = state && City.pick(state, mx, my);
  mapHit = hit || null;                                     // drives the reverse link: building → its card
  const tip = document.getElementById('tooltip');
  if (hit && hit.scroll) { City.roster(hit.tip, cx, cy); tip.style.display = 'none'; }
  else if (hit) {
    City.roster('');
    const tags = hit.path ? buildingTags(hit) : [];
    tip.textContent = hit.tip || `${hit.path} · ${hit.floors | 0} fl (lines + coupling) · ${hit.commits} commits`
      + (tags.length ? '\n' + tags.join('\n') : '');
    tip.style.left = `${cx + 14}px`; tip.style.top = `${cy + 14}px`; tip.style.display = 'block';
  } else { City.roster(''); tip.style.display = 'none'; }
}
tlCanvas.addEventListener('mousemove', m => {
  if (drag) return;
  const r = tlCanvas.getBoundingClientRect();
  tipAt((m.clientX - r.left) * (tlCanvas.width / r.width),
        (m.clientY - r.top) * (tlCanvas.height / r.height), m.clientX, m.clientY);
});
tlCanvas.addEventListener('mouseleave', () => {
  mapHit = null;                                            // drop the reverse-link highlight when the mouse leaves
  document.getElementById('tooltip').style.display = 'none'; City.roster('');
});
attachTouch(tlCanvas, {                                     // the movie was mouse-only; give it touch on phones
  pan: (dx, dy) => { cam.ox += dx; cam.oy += dy; document.getElementById('tooltip').style.display = 'none'; },
  pinch: (k, mx, my) => zoom(k, mx, my),
  twist: rotate,
  hold: tipAt,
});
