// Time-lapse engine: replays a repo's git history as a city climbing the formation ladder.
// As the repo grows past thresholds the city RE-FORMS (village → radial/spine → grid); within an
// epoch buildings reveal in birth order, grow floors, ruin + overgrow when deleted. Each formation
// is a fixed per-epoch layout; boundaries are crossed with a demolish-and-rebuild transition.
const tlCanvas = document.getElementById('map');
const tlCtx = tlCanvas.getContext('2d');
const cam = { ox: 0, oy: 0, s: 1 };
let state = null, commits = [], births = [], mods = [], deaths = [], bornAt = new Map(), props = [];
let groundFinal = null, groundBirth = null, decaySpan = 0;
let layouts = [], epochIndex = -1;                        // one fixed layout per formation epoch
let transition = null;                                    // active demolish-and-rebuild between two epochs
let ptr = -1, playing = false, speed = 12, acc = 0, last = 0, slider = null, label = null;

const citySrc = window.CITY_SRC || 'city-data.json';
const isForge = citySrc.includes('forge-timelapse');
document.getElementById('replay')?.remove();             // already in the movie; drop the entry button
const loading = showLoading();

(async () => {
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
    .sort((a, b) => b.commits - a.commits).slice(0, 80);             // cap to bound sprawl from churn
  if (dead.length) data.buildings = data.buildings.concat(dead);
  index(data);                                           // per-building b.birth + b._touchAt (rename-folded)
  buildSchedule(data.buildings);                         // births[] / mods[] / deaths[] / bornAt from each lifecycle
  decaySpan = Math.max(1, Math.ceil(commits.length * 0.15));   // mourning window before nature reclaims a ruin
  const epochs = detectEpochs(data, commits);            // the formations this repo climbs over its history
  window.__epochs = epochs;
  layouts = buildEpochLayouts(data, epochs);             // one fixed layout per epoch; snapshots b._epochPos
  setEpoch(0);                                           // activate the first formation
  buildLegend(data);
  buildTransport();
  seek(-1);
  loading.remove();
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
function index(data) {
  const resolve = renameAlias();
  const exact = new Map(data.buildings.map(b => [b.path, b]));
  const find = p => { const r = resolve(p);
    return exact.get(r) || data.buildings.find(b => r === b.path || r.startsWith(b.path + '/')) || null; };
  for (const b of data.buildings) b._touchAt = [];
  commits.forEach((c, i) => {
    const hit = new Set();                               // dedupe files that fold into one building this commit
    for (const f of c.files) {
      const b = find(f.p);
      if (!b || hit.has(b)) continue;
      hit.add(b); b._touchAt.push(i);
    }
  });
  for (const b of data.buildings) if (b._touchAt.length) b.birth = b._touchAt[0];
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
      deps: data.deps, docker: data.docker, dead: data.dead, _planFn: ep.formation.plan });
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
}

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
    tween(t);
    tlCtx.clearRect(0, 0, tlCanvas.width, tlCanvas.height);
    City.draw(tlCtx, cam, state, t);
  }
  requestAnimationFrame(loop);
}

function setPlay(p) {
  playing = p; last = 0;
  if (p && ptr >= commits.length - 1) seek(-1);          // replay from the start
  document.getElementById('tl-play').textContent = playing ? '⏸' : '▶';
}

// ---- transport bar (built in JS so the shared shell stays untouched) ----
function buildTransport() {
  const css = `#transport{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:9;
    display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(42,16,36,.9);
    border:2px solid var(--gold);box-shadow:3px 3px 0 var(--plum);font-family:'Silkscreen',monospace;
    color:var(--cream);font-size:10px;max-width:92vw}
    #transport button{cursor:pointer;background:var(--plum-soft);color:var(--cream);border:1px solid var(--gold);
    font:inherit;width:30px;height:26px}#transport button:hover{background:var(--gold);color:var(--plum)}
    #tl-seek{width:min(40vw,360px);accent-color:var(--gold)}
    #transport input[type=range]{accent-color:var(--gold)}
    #transport select{background:var(--plum-soft);color:var(--cream);border:1px solid var(--gold);font:inherit}
    #tl-label{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85}`;
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
    `<span id="tl-label"></span>`;
  document.querySelector('.mapwrap').appendChild(bar);
  slider = bar.querySelector('#tl-seek');
  label = bar.querySelector('#tl-label');
  bar.querySelector('#tl-play').onclick = () => setPlay(!playing);
  bar.querySelector('#tl-skip').onclick = () => { setPlay(false); seek(commits.length - 1); };
  slider.oninput = () => { setPlay(false); seek(+slider.value); };
  bar.querySelector('#tl-speed').onchange = e => speed = e.target.value === 'auto' ? autoSpeed() : +e.target.value;
  bar.querySelector('#tl-trans').onchange = e => transMode = e.target.value;
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
