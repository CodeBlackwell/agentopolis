// Time-lapse engine: replays a repo's git history as a city climbing the formation ladder.
// As the repo grows past thresholds the city RE-FORMS (village → radial/spine → grid); within an
// epoch buildings reveal in birth order, grow floors, ruin + overgrow when deleted. Each formation
// is a fixed per-epoch layout; boundaries are crossed with a demolish-and-rebuild transition.
const tlCanvas = document.getElementById('map');
const tlCtx = tlCanvas.getContext('2d');
const cam = { ox: 0, oy: 0, s: 1 };
let state = null, commits = [], births = [], mods = [], deaths = [], bornAt = new Map(), props = [];
// match backing store to box × DPR; on resize re-fit the current epoch's village to the new shape
autosizeCanvas(tlCanvas, () => { if (state) City.fit(cam, tlCanvas, state, 150, 30, 1.18); })();
let groundFinal = null, groundBirth = null, decaySpan = 0;
let layouts = [], epochIndex = -1;                        // one fixed layout per formation epoch
let transition = null;                                    // active demolish-and-rebuild between two epochs
let ptr = -1, playing = false, speed = 12, acc = 0, last = 0, slider = null, label = null;
let megaCommit = 15;                                      // commit-size gate for coupling; set relatively in index()

const citySrc = window.CITY_SRC || 'city-data.json';
const isForge = citySrc.includes('forge-timelapse');
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
  try { const r = await fetch(citySrc); if (!r.ok) throw r.status; resp = await r.json(); }
  catch (e) {                                             // forge clone failed / too large / gate busy → quick city
    const m = citySrc.match(/url=(.+)$/);
    if (isForge && m) { location.href = '/?forge=' + m[1] + '&static'; return; }
    throw e;
  }
  let data, tl;
  if (resp && resp.timeline) { data = resp.data; tl = resp.timeline; }   // forge: one full-clone bundle
  else { data = resp; tl = await fetch(window.TIMELINE_SRC || 'timeline.json').then(r => r.ok ? r.json() : Promise.reject(r.status)); }
  commits = tl.commits;
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
  speed = autoSpeed();                                    // size playback to ~finish in 20s regardless of repo size
  setPlay(true);                                          // a movie plays itself
  requestAnimationFrame(loop);
})().catch(e => { loading.remove(); console.error('timelapse load failed', e); });

const autoSpeed = () => Math.max(3, Math.min(120, commits.length / 20));   // commits per second

function showLoading() {                                  // shown while a forge repo clones + seeds
  const el = document.createElement('div');
  el.id = 'tl-loading';
  const h = document.querySelector('header h1 .m-city');
  el.textContent = '⏳ building ' + ((h && h.textContent) || 'the city') + ' …';
  Object.assign(el.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 8, color: '#f9efe3', font: "14px 'Silkscreen', monospace",
    letterSpacing: '.1em', textShadow: '0 2px 6px rgba(0,0,0,.85)', pointerEvents: 'none' });
  (document.querySelector('.mapwrap') || document.body).appendChild(el);
  return el;
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
  City.fit(cam, tlCanvas, state, 150, 30, 1.18);
}

// ---- formation transition: an animated demolish-and-rebuild between two epoch layouts ----
const ease = u => u * u * (3 - 2 * u);
const fitScale = st => { const c = {}; City.fit(c, tlCanvas, st, 150, 30, 1.18); return c.s; };
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
    if (ptr >= commits.length - 1) setPlay(false);
  } else { last = 0; }
  if (!transition) {
    if (intro) stepIntro(t);
    tween(t);
    tlCtx.clearRect(0, 0, tlCanvas.width, tlCanvas.height);
    City.draw(tlCtx, cam, state, t);
    const af = activeFocus();                              // hover link, both ways: card⇄map
    drawFocus(t, af.ping);                                 // ping the map items the focus describes
    applyCardHighlight(af.cards);                          // raise the cards a hovered building belongs to
    syncScroll(af.ping);                                   // reveal that card if the map hover scrolled it off
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
  City.fit(cam, tlCanvas, state, 150, 30, 1.18);          // recentre the village for the adopted orientation = target
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

// record one fast replay pass of the movie as a short video to share — the build itself is the payload.
// Resolves a Blob, or null if MediaRecorder/codecs are unavailable; share.js drives this in movie mode.
window.recordTimelapseClip = () => new Promise(resolve => {
  if (!window.MediaRecorder || !tlCanvas.captureStream) return resolve(null);
  // mp4/h264 where the browser records it (iOS Safari wants mp4 for the share sheet), else webm
  const TYPES = ['video/mp4;codecs=h264', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = TYPES.find(t => MediaRecorder.isTypeSupported(t));
  let rec;
  try { rec = new MediaRecorder(tlCanvas.captureStream(30), mimeType ? { mimeType } : undefined); }
  catch (e) { return resolve(null); }
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
  const prevSpeed = speed;
  const finish = () => { clearTimeout(cap); clearInterval(poll); speed = prevSpeed; if (rec.state !== 'inactive') rec.stop(); };
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
  cta.innerHTML = `<div class="cta-h">${esc(document.body.dataset.hallName || 'this city')} — built from ${commits.length} commits.</div>`
                + `<div class="cta-s">now build your own &#8595;</div>`;
  const wrap = document.querySelector('.mapwrap') || document.body;
  wrap.classList.add('cta-on');                          // drops the forge box below the headline
  wrap.appendChild(cta);
  document.querySelector('#forge input')?.focus();
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
    #tl-seek{flex:3 1 auto;min-width:120px;accent-color:var(--gold)}
    #transport input[type=range]{accent-color:var(--gold)}
    #transport select{flex:0 0 auto;background:var(--plum-soft);color:var(--cream);border:1px solid var(--gold);font:inherit}
    #tl-label{flex:1 1 0;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85}
    #tl-exit{width:auto;padding:0 9px}
    /* phones: trim to the video-player essentials (play / scrub / speed / exit), bigger touch targets */
    @media (max-width:720px){#transport{gap:7px;padding:8px 10px;font-size:11px}
      #transport button{width:40px;height:36px}#tl-trans,#tl-label{display:none}
      #tl-seek{min-width:90px}#tl-exit{padding:0 12px}}`;
  document.head.appendChild(document.createElement('style')).textContent = css;
  const bar = document.createElement('div');
  bar.id = 'transport';
  bar.innerHTML =
    `<button id="tl-play" title="play / pause">▶</button>` +
    `<button id="tl-skip" title="skip to the finished city">⏭</button>` +
    `<input id="tl-seek" type="range" min="-1" max="${commits.length - 1}" value="-1">` +
    `<select id="tl-speed" title="playback speed">
       <option value="auto" selected>auto</option><option value="4">slow</option>
       <option value="12">1×</option><option value="40">3×</option><option value="120">10×</option></select>` +
    `<select id="tl-trans" title="how the city re-forms between formations">` +
       TRANSITION_MODES.map(m => `<option value="${m}"${m === transMode ? ' selected' : ''}>${m}</option>`).join('') +
    `</select>` +
    `<span id="tl-label"></span>` +
    (liveHref ? `<button id="tl-exit" title="back to the live city">&#9632; live</button>` : '');
  const wrap = document.querySelector('.mapwrap');
  wrap.classList.add('tl-mode');                          // column layout: canvas on top, bar in the strip below
  wrap.appendChild(bar);
  slider = bar.querySelector('#tl-seek');
  label = bar.querySelector('#tl-label');
  bar.querySelector('#tl-play').onclick = () => setPlay(!playing);
  bar.querySelector('#tl-skip').onclick = () => { setPlay(false); seek(commits.length - 1); };
  slider.oninput = () => { setPlay(false); seek(+slider.value); };
  bar.querySelector('#tl-speed').onchange = e => speed = e.target.value === 'auto' ? autoSpeed() : +e.target.value;
  bar.querySelector('#tl-trans').onchange = e => transMode = e.target.value;
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
const card = (title, html, chip, focus) => `<div class="xcard"${focus ? ` data-focus="${focus}"` : ''}><h5>${chip
  ? `<span class="chip" style="background:${chip}"></span>` : ''}${esc(title)}</h5><p>${html}</p></div>`;

function buildExplain() {
  const dock = document.getElementById('dock');
  if (!dock) return;
  if (window.DEMO_MOVIE) {                          // the agent-speed meme: keep the live dispatch hall, no explain cards
    startDemoLoop?.(state.buildings, { interval: 900 });
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
    .xcard .em{color:var(--gold)}
    #explain .stat-grid{margin:0}
    #explain .stat-value{color:var(--cream)}`;
  document.head.appendChild(document.createElement('style')).textContent = css;
  const box = document.createElement('div'); box.id = 'explain';
  dock.appendChild(box);
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
  return card('Shape · ' + (FORM_TITLE[id] || id), why[id] || '', null, 'shape:' + (s.hub || ''));
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

// Persists until the next transition: which two shapes, the exact commit it happened on, and why.
function reformedCard() {
  if (epochIndex <= 0) return '';                          // epoch 0 was never re-formed into
  const from = layouts[epochIndex - 1].ep.formation.id, to = layouts[epochIndex].ep.formation.id;
  const at = layouts[epochIndex].ep.start, c = commits[at];
  const s = City.statsOf({ zone: state.zone, buildings: layouts[epochIndex].ep.buildingsAlive });
  const when = c ? `commit ${at + 1} · ${new Date(c.ts * 1000).toLocaleDateString()}` : `commit ${at + 1}`;
  return `<div class="xcard live" style="border-color:var(--pink-deep)"><h5>⟳ Re-Formed · ${FORM_TITLE[to] || to}</h5>`
    + `<p><span class="em">${FORM_TITLE[from] || from}</span> → <span class="em">${FORM_TITLE[to] || to}</span> at <span class="em">${when}</span>`
    + ` — ${reformReason(to, s)}${c ? `<br>"${esc(c.subject)}"` : ''}</p></div>`;
}

function renderExplain(shown, i) {
  const box = document.getElementById('explain');
  if (!box || !state) return;
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
    + ` · ${pl(c.files.length, 'file')} changed<br>"${esc(c.subject)}"`));   // always first: the commit driving this frame
  cards.push(`<div class="xcard live"><h5>${esc(state.zone.repo || 'city')} · live</h5><div class="stat-grid">`
    + stat('commit', `${i + 1}/${commits.length}`) + stat('date', c ? new Date(c.ts * 1000).toLocaleDateString() : '—')
    + stat('buildings', shown.length) + stat('lines', loc.toLocaleString())
    + stat('districts', districts.length) + stat('shape', id) + `</div></div>`);
  const reformed = reformedCard(); if (reformed) cards.push(reformed);   // persists until the next re-form
  cards.push(formationCard(id, s));
  for (const d of districts)
    cards.push(card(d.name, `<span class="em">${pl(perDist[d.id], 'file')}</span> · ${KIND_ROLE[d.kind] || d.kind}`
      + (d.id === s.hub ? ' · <span class="em">★ coupling hub</span>' : ''), d.color, 'district:' + d.id));
  if (hubs) cards.push(card('Import Hubs', `Antennas mark ${pl(hubs, 'file')} in the repo's top 10% by imports — the wiring others lean on.`, null, 'hub'));
  if (debts) cards.push(card('TODO Debt', `Cranes hang over ${pl(debts, 'file')} in the top 10% by TODO / FIXME count.`, null, 'debt'));
  if (state.deps.length) cards.push(card('Freight Rail', `${state.deps.length} package deps ride the freight line — read from the manifest.`, null, 'deps'));
  if (state.docker.length) cards.push(card('Docker Harbor', `${pl(state.docker.length, 'container service')} moored at the harbor — from compose / Dockerfiles.`, null, 'docker'));
  if (graves) cards.push(card('Graveyard', `${pl(graves, 'file')} deleted across history so far — headstones below the city${crows ? ', crows wheeling overhead' : ''}.`, null, 'graves'));
  if (relics) cards.push(card('Village Relics', `The old well became a fountain and the herd + windmill migrated to a city farm on the outskirts — ${pl(relics, 'relic')} the hamlet left behind.`, null, 'relics'));
  if (onFoot || cars) cards.push(card('Street Life', `<span class="em">${pl(onFoot, 'resident')}</span> out on foot and <span class="em">${pl(cars, 'car')}</span> on the roads — both thicken in the districts touched most recently.`, null, 'street'));
  if (stalls) cards.push(card('Market', `${pl(stalls, 'stall')} ring the plaza — one per district still seeing active commits.`, null, 'stall'));
  if (boats) cards.push(card('Canal Traffic', `${pl(boats, 'boat')} work the canals that divide the data-flow layers.`, null, 'boat'));
  box.innerHTML = cards.join('');
}

// ---- card → map ping: hovering a card pulses the items it names, in a colour that CONTRASTS each
// item (the complement of its own colour) so a gold district never gets a gold ping. Driven off the
// live :hover state each frame, so it survives the per-commit card rebuild with no listeners. ----
function complement(hex) {                                  // hue-rotate 180° + lift toward a vivid glow
  if (!hex || hex[0] !== '#') return '#7edeff';
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let h = 0, s = mx === mn ? 0 : l > .5 ? (mx - mn) / (2 - mx - mn) : (mx - mn) / (mx + mn);
  if (mx !== mn) h = mx === r ? ((g - b) / (mx - mn) + (g < b ? 6 : 0)) / 6
    : mx === g ? ((b - r) / (mx - mn) + 2) / 6 : ((r - g) / (mx - mn) + 4) / 6;
  h = (h + .5) % 1; s = Math.max(.65, s);
  const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const hue = u => { u = (u + 1) % 1; return u < 1 / 6 ? p + (q - p) * 6 * u : u < .5 ? q
    : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p; };
  const to = u => Math.round(Math.min(1, hue(u) * 1.25) * 255);
  return `rgb(${to(h + 1 / 3)},${to(h)},${to(h - 1 / 3)})`;
}
const hitCenter = h => h.ax !== undefined
  ? { sx: (h.ax + h.bx) / 2, sy: (h.ay + h.by) / 2 } : { sx: (h.x0 + h.x1) / 2, sy: (h.y0 + h.y1) / 2 };

function focusPoints(focus) {                              // screen points (with each item's own colour) to ping
  const [type, arg] = focus.split(':');
  const drawn = (state.items || []).filter(b => b.screen && !b.kind);
  const base = b => ({ sx: b.screen.sx, sy: b.screen.y1 ?? b.screen.top, color: b.color || '#d4a953' });
  if (type === 'district') return drawn.filter(b => b.component === arg).map(base);
  if (type === 'hub') return drawn.filter(b => b.hub).map(base);
  if (type === 'debt') return drawn.filter(b => b.debt).map(base);
  if (type === 'graves') return drawn.filter(b => b.ruined).map(b => ({ ...base(b), color: '#6e7178' }));
  if (type === 'relics') return (state.items || []).filter(p => RELIC_KIND[p.kind])
    .map(p => ({ ...City.proj(cam, p.x, p.y), color: '#8fb9a8' }));
  if (type === 'deps') return (state.hits || []).filter(h => /freight|package/i.test(h.tip || ''))
    .map(h => ({ ...hitCenter(h), color: '#2b2230' }));
  if (type === 'docker') return (state.hits || []).filter(h => /service|image/i.test(h.tip || ''))
    .map(h => ({ ...hitCenter(h), color: '#2b2230' }));
  const kinds = type === 'street' ? ['walker', 'traffic'] : [type];   // ambient props ping at their anchor
  return (state.items || []).filter(p => kinds.includes(p.kind))
    .map(p => ({ ...City.proj(cam, p.x, p.y), color: '#8fb9a8' }));
}

function drawFocus(t, focus) {
  if (!focus || !state) return;
  const ctx = tlCtx, k = (Math.sin(t / 260) + 1) / 2;   // 0..1 breathe
  ctx.save();
  if (focus.startsWith('shape')) {                         // the whole footprint: one breathing diamond
    const c = [[0, 0], [state.W, 0], [state.W, state.H], [0, state.H]].map(([x, y]) => City.proj(cam, x, y));
    ctx.strokeStyle = '#7edeff'; ctx.shadowColor = '#7edeff'; ctx.shadowBlur = 8 + 12 * k;
    ctx.globalAlpha = .3 + .5 * k; ctx.lineWidth = Math.max(2, 2.5 * cam.s);
    ctx.beginPath(); ctx.moveTo(c[0].sx, c[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(c[i].sx, c[i].sy);
    ctx.closePath(); ctx.stroke(); ctx.restore(); return;
  }
  ctx.lineWidth = Math.max(1.5, 1.6 * cam.s);
  for (const p of focusPoints(focus)) {
    const col = complement(p.color), rx = (6 + 9 * k) * cam.s;
    ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 6 + 10 * k;
    ctx.globalAlpha = .35 + .55 * k;
    ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, rx * .55, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
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
  'reset': () => { cam.rot = 0; City.fit(cam, tlCanvas, state, 150, 30, 1.18); } };
document.getElementById('mapctl').addEventListener('click', e => {
  const act = e.target.dataset.act; if (act && state) CTL[act]();
});
window.addEventListener('keydown', e => { if (e.key === 'q' || e.key === 'e') rotate(e.key === 'q' ? 1 : -1); });
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
