// Time-lapse engine: replays a repo's git history as a growing EvoStreets city.
// Buildings reveal in birth order, grow floors as commits touch them, ruin + overgrow when
// deleted, and — across a directory restructure — demolish in their old district and rebuild
// in the new one, the surrounding streets contracting to reclaim the freed space (budget-controlled).
// A transport bar drives play / scrub / speed / re-zoning budget.
const tlCanvas = document.getElementById('map');
const tlCtx = tlCanvas.getContext('2d');
const cam = { ox: 0, oy: 0, s: 1 };
let state = null, commits = [], births = [], mods = [], deaths = [], bornAt = new Map(), props = [];
let groundFinal = null, groundBirth = null, decaySpan = 0;
let contractions = [], budget = 1;                        // re-zoning: outboard block slides in by round(E*budget)
let ptr = -1, playing = false, speed = 12, acc = 0, last = 0, slider = null, label = null;

(async () => {
  const resp = await fetch(window.CITY_SRC || 'city-data.json').then(r => r.ok ? r.json() : Promise.reject(r.status));
  let data, tl;
  if (resp && resp.timeline) { data = resp.data; tl = resp.timeline; }   // forge: one full-clone bundle
  else { data = resp; tl = await fetch(window.TIMELINE_SRC || 'timeline.json').then(r => r.ok ? r.json() : Promise.reject(r.status)); }
  commits = tl.commits;
  const dead = reconstructDead(commits, data.buildings, data.zone)   // lifetime estate: files that died before HEAD
    .sort((a, b) => b.commits - a.commits).slice(0, 80);             // cap to bound sprawl from churn
  if (dead.length) data.buildings = data.buildings.concat(dead);
  index(data);                                           // per-building b.birth + b._touchAt (rename-folded)
  const ghosts = splitMovers(data, detectBoundaries(commits));  // restructures → demolished old self + rebuilt new self
  if (ghosts.length) data.buildings = data.buildings.concat(ghosts);
  buildSchedule(data.buildings);                         // births[] / mods[] / deaths[] / bornAt from each lifecycle
  data.zone.plan = 'evostreets';                         // grow the city as a street network, birth-ordered
  state = City.layout(data);                             // same building objects → b.birth drives placement
  props = state.items.filter(it => it.kind);             // props stay; buildings get revealed over time
  for (const b of state.buildings) { b.finalFloors = b.floors; b.floors = 0; }   // start empty; grow into finalFloors
  decaySpan = Math.max(1, Math.ceil(commits.length * 0.15));   // mourning window before nature reclaims a ruin
  for (const b of state.buildings) if (b.death !== undefined)  // a sapling waits to sprout where the husk stood
    b._sapling = { kind: 'tree', x: b.x, y: b.y, seed: City.hash(b.path), sapling: true };
  groundFinal = state.ground.map(r => r.slice());        // streets surface as their buildings arrive
  groundBirth = state.groundBirth || [];
  while (groundBirth.length < groundFinal.length) groundBirth.push(new Array(state.W).fill(0));  // cemetery: always
  computeContraction(detectBoundaries(commits));         // measure freed regions so the city can reclaim them
  buildLegend(data);
  buildTransport();
  City.fit(cam, tlCanvas, state, 150, 30, 1.18);
  seek(-1);
  requestAnimationFrame(loop);
})().catch(e => console.error('timelapse load failed', e));

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

// Detect bulk directory moves: a commit where many renames share one prefix remap (a/.. -> b/..).
function detectBoundaries(commits) {
  const head = (frm, to) => {                            // strip common trailing segments → the moved prefix
    const a = frm.split('/'), b = to.split('/'); let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return [a.slice(0, a.length - n).join('/'), b.slice(0, b.length - n).join('/')];
  };
  const out = [];
  commits.forEach((c, i) => {
    const groups = {};
    for (const f of c.files) if (f.c === 'R' && f.from) {
      const [of_, ot] = head(f.from, f.p);
      if (of_ === ot) continue;
      (groups[of_ + '\n' + ot] ||= { from: of_, to: ot, pairs: [] }).pairs.push({ old: f.from, nw: f.p });
    }
    for (const g of Object.values(groups)) if (g.pairs.length >= 4) out.push({ commit: i, ...g });
  });
  return out;
}

// Split each bulk-moved file into a ghost at its old path (born at its real birth, demolishes at the
// boundary) and the HEAD building rebuilt at its new path (arrives at the boundary). Returns the ghosts.
function splitMovers(data, boundaries) {
  const resolve = renameAlias();
  const byPath = new Map(data.buildings.map(b => [b.path, b]));
  const ghosts = [];
  for (const bd of boundaries) for (const { old, nw } of bd.pairs) {
    const head = byPath.get(resolve(nw));
    if (!head || head._rezoned || !head._touchAt) continue;
    const pre = head._touchAt.filter(t => t < bd.commit), post = head._touchAt.filter(t => t >= bd.commit);
    if (!pre.length || !post.length) continue;           // must straddle the boundary to count as a move
    ghosts.push({ path: old, component: head.component, loc: head.loc || 20, commits: pre.length,
      centrality: 0, age_days: 0, files: 1, classes: 0, imports: 0, todos: 0,
      ext: old.includes('.') ? old.split('.').pop().toLowerCase() : '',
      _touchAt: pre, birth: pre[0], death: bd.commit, _ghost: true });
    head._touchAt = post; head.birth = bd.commit; head._rezoned = true;   // instance arrives at the boundary
  }
  return ghosts;
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

// Per-street contraction: when the moved-out directory G leaves its parent street P, only the
// children of P that branch *after* G slide back along P's axis to close the gap (clipped to P's
// bounding box, so nothing outside P's subtree moves). Uses the geometry EvoStreets exposed.
function childOf(P, path) {                                // the direct child-dir of P on path, or null (a file in P)
  const rest = P === '' ? path : path.slice(P.length + 1);
  if (!rest.includes('/')) return null;
  const seg = rest.split('/')[0];
  return P === '' ? seg : P + '/' + seg;
}
function computeContraction(boundaries) {
  for (const b of state.buildings) { b._bx = b.x; b._by = b.y; b._out = []; }
  contractions = [];
  const streets = state.streets || {};
  for (const bd of boundaries) {
    const g = streets[bd.from];                            // the directory that moved away
    if (!g) continue;                                      // root-file moves have no street node → no contraction
    const P = bd.from.includes('/') ? bd.from.slice(0, bd.from.lastIndexOf('/')) : '';
    const pbox = P === '' ? { x0: 0, y0: 0, x1: state.W, y1: state.H }
                          : (streets[P] && streets[P].bbox) || { x0: 0, y0: 0, x1: state.W, y1: state.H };
    const bc = { commit: bd.commit, axis: g.axis, branchAlong: g.branchAlong, gw: g.thick + 1, pbox, P };
    contractions.push(bc);
    for (const b of state.buildings) {                     // tag P's later-branching descendants to slide
      if (P !== '' && b.path !== P && !b.path.startsWith(P + '/')) continue;
      const cp = childOf(P, b.path), ca = cp && streets[cp] ? streets[cp].branchAlong : undefined;
      if (ca !== undefined && ca > g.branchAlong + 0.5) b._out.push(bc);
    }
  }
}

const countLE = (arr, i) => { let n = 0; for (const t of arr) if (t <= i) n++; return n; };
const GROWTH_RATE = 8;                                    // floors/sec the height eases toward its target
let easeLast = 0;

function recompute(i) {                                   // set targets + visible set for commit i (no anim)
  ptr = i;
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
  for (const b of state.buildings) {                      // re-zoning slide: P's later children close the gap G left
    let dx = 0, dy = 0;
    for (const bc of b._out || []) if (i >= bc.commit) { const sh = Math.round(bc.gw * budget); bc.axis === 0 ? dx -= sh : dy -= sh; }
    b._tx = (b._bx ?? b.x) + dx; b._ty = (b._by ?? b.y) + dy;
  }
  if (groundFinal) {                                      // ground = thresholded final, with each gap's tail shifted in
    const active = contractions.filter(bc => i >= bc.commit && Math.round(bc.gw * budget) > 0);
    for (let y = 0; y < groundFinal.length; y++) {
      const gr = state.ground[y], W = groundFinal[y].length;
      for (let x = 0; x < W; x++) {
        let sx = x, sy = y;                               // back-map this display cell through the active shifts
        for (const bc of active) {
          const sh = Math.round(bc.gw * budget), p = bc.pbox;
          if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;   // only within P's subtree
          if (bc.axis === 0) { if (x > bc.branchAlong - sh) sx += sh; } else { if (y > bc.branchAlong - sh) sy += sh; }
        }
        const gfR = groundFinal[sy], gbR = groundBirth[sy] || [];
        gr[x] = (gfR && sx < gfR.length && (gbR[sx] ?? 0) <= i) ? gfR[sx] : 2;
      }
    }
  }
  for (const b of decayed) {                              // nature reclaims the ruin's lot: pavement back to grass
    const cx = Math.round(b._tx - .5), cy = Math.round(b._ty - .5);
    if (state.ground[cy]) state.ground[cy][cx] = 2;
  }
  state.items = [...props, ...decayed.map(b => b._sapling), ...shown];
  state.sortedRot = -1;                                  // force City.draw to re-sort painter order
  if (slider) slider.value = i;
  if (label) {
    const c = commits[i];
    label.textContent = c
      ? `${new Date(c.ts * 1000).toLocaleDateString()} · ${c.author} · ${c.subject}`.slice(0, 90)
        + `   (${i + 1}/${commits.length})`
      : `0/${commits.length}`;
  }
}

function seek(i) {                                        // scrub / init: snap instantly, no tween or collapse
  recompute(i);
  for (const b of state.buildings) {
    const vis = bornAt.has(b) && bornAt.get(b) <= i && !(b.death !== undefined && i >= b.death + decaySpan);
    b.floors = vis ? (b._floorsTarget ?? 0) : 0;
    b.ruined = vis && b.death !== undefined && i >= b.death;
    b.scaffold = false; b._collapseAt = 0;
    if (b._tx !== undefined) { b.x = b._tx; b.y = b._ty; }   // snap to the reclaimed position
  }
}

function tween(t) {                                       // per-frame: ease heights up, raise scaffolding while building
  if (!easeLast) easeLast = t;
  const dt = Math.min(.05, (t - easeLast) / 1000); easeLast = t;
  for (const b of state.items) {
    if (b.kind) continue;
    if (b._tx !== undefined) {                            // ease toward the reclaimed position (urban renewal slide)
      const k = Math.min(1, dt * 6);
      b.x += (b._tx - b.x) * k; b.y += (b._ty - b.y) * k;
    }
    if (b.ruined) continue;
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
  if (playing && ptr < commits.length - 1) {
    if (!last) last = t;
    acc += (t - last) / 1000 * speed;
    last = t;
    if (acc >= 1) { const n = Math.floor(acc); acc -= n; advance(Math.min(commits.length - 1, ptr + n)); }
    if (ptr >= commits.length - 1) setPlay(false);
  } else { last = 0; }
  tween(t);
  tlCtx.clearRect(0, 0, tlCanvas.width, tlCanvas.height);
  City.draw(tlCtx, cam, state, t);
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
    #tl-budget-l{display:flex;align-items:center;gap:4px}#tl-budget{width:64px}
    #tl-label{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.85}`;
  document.head.appendChild(document.createElement('style')).textContent = css;
  const bar = document.createElement('div');
  bar.id = 'transport';
  bar.innerHTML =
    `<button id="tl-play" title="play / pause">▶</button>` +
    `<input id="tl-seek" type="range" min="-1" max="${commits.length - 1}" value="-1">` +
    `<select id="tl-speed" title="commits per second">
       <option value="4">0.3×</option><option value="12" selected>1×</option>
       <option value="40">3×</option><option value="120">10×</option></select>` +
    (contractions.length                                  // only show the re-zoning dial when there's a restructure
      ? `<label id="tl-budget-l" title="re-zoning reclaim: 0 = leave a vacant lot, 1 = slide the city in">⛏<input id="tl-budget" type="range" min="0" max="1" step="0.05" value="${budget}"></label>` : '') +
    `<span id="tl-label"></span>`;
  document.querySelector('.mapwrap').appendChild(bar);
  slider = bar.querySelector('#tl-seek');
  label = bar.querySelector('#tl-label');
  bar.querySelector('#tl-play').onclick = () => setPlay(!playing);
  slider.oninput = () => { setPlay(false); seek(+slider.value); };
  bar.querySelector('#tl-speed').onchange = e => speed = +e.target.value;
  const bud = bar.querySelector('#tl-budget');
  if (bud) bud.oninput = () => { budget = +bud.value; seek(ptr); };   // re-layout live as you scrub the dial
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
