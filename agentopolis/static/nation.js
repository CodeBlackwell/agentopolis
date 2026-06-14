// Nation view: a top-down pixel world map — each state a biome province, repos as town
// icons keyed by archetype family. Click a city to fly-zoom + crossfade into its full
// isometric Agentopolis city (the existing City engine). Zoom back out returns to the map.
const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const backBtn = document.getElementById('back');
const tierBtn = { world: null, state: null, city: null };
document.querySelectorAll('#tiers button').forEach(b => tierBtn[b.dataset.tier] = b);
const { hash, shade } = City;
const TILE = 22;                                           // top-down tile size in px at scale 1
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp = (a, b, k) => a + (b - a) * k;

let nation = null;
let mode = 'map';                                          // 'map' | 'city'
let trans = null;                                          // {dir:'in'|'out', k, c}
let savedMap = null;                                       // map cam to restore on drill-out
let focusState = null;                                     // province framed in map mode (state tier)
let mapTween = null, stateFitS = 1;                        // eased map-cam target + state framing scale
let currentCity = null, lastCity = null;                   // active city; last one visited (for tier snap)
const mapCam = { ox: 0, oy: 0, s: 1 };
const cityCam = { ox: 0, oy: 0, s: 1, rot: 0, cx: 0, cy: 0 };
let cityFitS = 1;                                          // city scale at full fit (zoom-out drill trigger)

const tproj = (x, y) => ({ sx: mapCam.ox + x * TILE * mapCam.s, sy: mapCam.oy + y * TILE * mapCam.s });
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function mixHex(a, b, k) {
  const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
  const ch = sh => Math.round(((x >> sh) & 255) * (1 - k) + ((y >> sh) & 255) * k);
  return '#' + [ch(16), ch(8), ch(0)].map(v => v.toString(16).padStart(2, '0')).join('');
}

// ---- layout: pack cities into integer tile grids per state, stamp a terrain grid ----
const WATER = 0, PLAZA = 1, SEA = 2;
// town colour = its own dominant language (state identity now lives in the terrain, not the icon)
const LANG = { py: '#4b8bbe', js: '#e8c41c', mjs: '#e8c41c', jsx: '#61dafb', ts: '#3178c6', tsx: '#61dafb',
  md: '#c9b78a', html: '#e34c26', css: '#8e5d9f', scss: '#cf649a', go: '#00add8', rs: '#dea584',
  rb: '#cc342d', java: '#b5651d', kt: '#a97bff', sql: '#4a6b5c', vue: '#42b883', svelte: '#ff3e00',
  cypher: '#008cc1', cs: '#178600', php: '#777bb4', sh: '#89e051', toml: '#9c6b35', yaml: '#cb6c6c',
  yml: '#cb6c6c', png: '#7d6b8a', json: '#8a8f98' };
// province biome = its cities' dominant family → terrain base/dark cast + ground prop
const BIOME = { backend:  { base: '#243018', dark: '#18230f', prop: 'tree' },   // forested highlands
                frontend: { base: '#2f3a1c', dark: '#222b12', prop: 'bush' },   // bright meadow
                infra:    { base: '#333028', dark: '#24221c', prop: 'rock' },   // industrial rock
                data:     { base: '#16302f', dark: '#0f2322', prop: 'reed' },   // wetland
                docs:     { base: '#352f1a', dark: '#262111', prop: 'dune' },   // parchment savanna
                neutral:  { base: '#243018', dark: '#18230f', prop: 'tree' } };
const PLAZA_TAN = '#cdbd95', PLAZA_TAN2 = '#c2b187';
function plazaPalette(c, landTint) {                         // each town pad: lang-tinted, biome-echoed, age-weathered
  const fade = c._age_daysPct ?? .5;                         // weathering = age rank within the nation, not a day count
  const k = lerp(.28, .10, fade);                            // fresher repos take a stronger language tint
  let fill = mixHex(PLAZA_TAN, c.color, k), fillAlt = mixHex(PLAZA_TAN2, c.color, k);
  fill = mixHex(fill, landTint, .12); fillAlt = mixHex(fillAlt, landTint, .12);   // echo the province biome
  if (fade > .5) {                                           // older half of the nation bleaches toward cracked grey
    const grey = (fade - .5) / .5 * .35;
    fill = mixHex(fill, '#9a958a', grey); fillAlt = mixHex(fillAlt, '#8f8a80', grey);
  }
  return { fill, fillAlt,
           edge: shade(fill, .72),                           // border ring: a darker path outline
           accent: shade(c.color, 1.15),                     // center marker pops in the language hue
           cobble: (c._commitsPct ?? 0) > .5 };              // top-committed half get paved pads, rest stay dirt
}
function layoutNation(data) {
  const byRepo = {};
  const color = Object.fromEntries(data.states.map(s => [s.id, s.color]));
  for (const c of data.cities) {
    c.fr = clamp(Math.round(Math.sqrt(c.files) / 6) + 1, 2, 4);
    c.color = LANG[c.lang] || color[c.state] || '#7d6b8a';   // tinted by its own language
    byRepo[c.repo] = c;
  }
  const rank = (key, asc) => {                              // 0..1 position within the nation, not an absolute cutoff
    const order = [...data.cities].sort((a, b) => (asc ? 1 : -1) * ((a[key] ?? 0) - (b[key] ?? 0)));
    const n = order.length;
    order.forEach((c, i) => (c[`_${key}Pct`] = n < 2 ? .5 : i / (n - 1)));
  };
  rank('age_days', true);                                   // _age_daysPct: 0 freshest → 1 oldest in this nation
  rank('commits', true);                                    // _commitsPct: 0 least → 1 most committed
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));               // 137.5° — the sunflower angle, no two spokes align
  const blocks = data.states.map((st, si) => {
    const list = st.repos.map(r => byRepo[r]).filter(Boolean).sort((a, b) => b.fr - a.fr);
    const cell = Math.max(...list.map(c => 2 * c.fr + 1)) + 1;   // one city's footprint = the spiral's pitch
    // radial seniority: the oldest repo founds the plaza core, juniors spiral outward by age (golden angle)
    const senior = [...list].sort((a, b) => (b.age_days ?? 0) - (a.age_days ?? 0) || b.fr - a.fr);
    const spread = cell / Math.sqrt(Math.PI);               // ring pitch so neighbours sit ~one footprint apart
    let rmax = 0;
    senior.forEach((c, i) => {
      const ang = i * GOLDEN + (hash(`a${c.repo}`) % 1000 / 1000 - .5) * .6;        // organic angular wobble
      const rad = spread * Math.sqrt(i) * (1 + (hash(`r${c.repo}`) % 1000 / 1000 - .5) * .18);
      c._rx = Math.cos(ang) * rad; c._ry = Math.sin(ang) * rad;
      rmax = Math.max(rmax, Math.hypot(c._rx, c._ry));
    });
    const span = Math.ceil((rmax + cell / 2 + 1) * 2) + 1;  // square island sized to the disk + outer clearing
    const fam = {};
    for (const c of list) fam[c.family] = (fam[c.family] || 0) + 1;
    const biome = (Object.entries(fam).sort((a, b) => b[1] - a[1])[0] || ['neutral'])[0];
    const ages = list.map(c => c.age_days).sort((a, b) => a - b);
    const vitality = clamp(1 - (ages[ages.length >> 1] || 9999) / 365, 0, 1);   // fresh → lush + intact coast
    const ground = BIOME[biome] || BIOME.neutral;
    return { st, si, list, cell, biome, vitality, prop: ground.prop, iw: span, ih: span,
             land: mixHex(st.color, ground.base, .42), landAlt: mixHex(st.color, ground.dark, .52) };
  }).filter(b => b.list.length);
  const byBlock = Object.fromEntries(blocks.map(b => [b.si, b]));

  const area = blocks.reduce((a, b) => a + b.iw * b.ih, 0);
  const targetW = Math.max(...blocks.map(b => b.iw), Math.round(Math.sqrt(area) * 1.2));

  function skylinePlace(orderedBlocks, λ, anchors) {
    const sky = new Array(targetW + SEA).fill(SEA);
    for (const b of orderedBlocks) {
      let bestX = SEA, bestScore = Infinity;
      for (let cx = SEA; cx + b.iw <= sky.length; cx++) {
        let peak = 0;
        for (let dx = 0; dx < b.iw; dx++) peak = Math.max(peak, sky[cx + dx]);
        const bias = anchors ? Math.abs(cx - (anchors[b.biome] ?? cx)) : 0;
        const score = peak + λ * bias;
        if (score < bestScore) { bestScore = score; bestX = cx; }
      }
      let peak = 0;
      for (let dx = 0; dx < b.iw; dx++) peak = Math.max(peak, sky[bestX + dx]);
      b.x0 = bestX; b.y0 = peak;
      for (let dx = 0; dx < b.iw; dx++) sky[bestX + dx] = peak + b.ih + SEA;
      b.list.forEach(c => {                                  // drop the precomputed spiral onto the placed island
        c.x = b.x0 + b.iw / 2 + c._rx;
        c.y = b.y0 + b.ih / 2 + c._ry;
      });
    }
  }

  // Pass 1: size-first, no affinity — discover natural biome centroids
  blocks.sort((a, b) => b.iw * b.ih - a.iw * a.ih);
  skylinePlace(blocks, 0, null);

  const biomeCX = {}, biomeCnt = {};
  for (const b of blocks) {
    biomeCX[b.biome] = (biomeCX[b.biome] || 0) + b.x0 + b.iw / 2;
    biomeCnt[b.biome] = (biomeCnt[b.biome] || 0) + 1;
  }
  const anchors = Object.fromEntries(Object.keys(biomeCX).map(k => [k, biomeCX[k] / biomeCnt[k]]));

  // Pass 2: sort by biome anchor X (left→right), large-first within biome; re-place with affinity pull
  blocks.sort((a, b) => {
    const da = anchors[a.biome] ?? 0, db = anchors[b.biome] ?? 0;
    return da !== db ? da - db : b.iw * b.ih - a.iw * a.ih;
  });
  skylinePlace(blocks, 0.3, anchors);

  const W = Math.max(...blocks.map(b => b.x0 + b.iw)) + SEA;
  const H = Math.max(...blocks.map(b => b.y0 + b.ih)) + SEA;
  const g = Array.from({ length: H }, () => new Array(W).fill(WATER));
  for (const b of blocks)
    for (let ty = b.y0; ty < b.y0 + b.ih && ty < H; ty++)
      for (let tx = b.x0; tx < b.x0 + b.iw && tx < W; tx++) g[ty][tx] = 10 + b.si;
  const pz = Array.from({ length: H }, () => new Array(W).fill(null));
  const blockOfCity = {};
  for (const b of blocks) for (const c of b.list) blockOfCity[c.repo] = b;
  for (const c of data.cities) {                           // town site: shaped, tinted clearing per repo
    const pr = clamp(c.fr - 1, 1, 2), seed = hash(c.repo);
    const pal = plazaPalette(c, (blockOfCity[c.repo] || {}).land || PLAZA_TAN);
    const cx = Math.floor(c.x), cy = Math.floor(c.y);
    for (let dy = -pr; dy <= pr; dy++)
      for (let dx = -pr; dx <= pr; dx++) {
        const cheb = Math.max(Math.abs(dx), Math.abs(dy));
        if (pr >= 2 && Math.abs(dx) === pr && Math.abs(dy) === pr) continue;        // cut corners → octagon
        if (pr >= 2 && cheb === pr && hash(`pz${seed}.${dx}.${dy}`) % 5 === 0) continue;   // ragged edge
        const tx = cx + dx, ty = cy + dy;
        if (!(g[ty]?.[tx] >= 10)) continue;
        g[ty][tx] = PLAZA;
        pz[ty][tx] = { pal, role: (dx === 0 && dy === 0) ? 'center' : cheb === pr ? 'edge' : 'inner' };
      }
  }
  const edges = [];                                        // ragged coastline: erode ~1/3 of shore land
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (g[y][x] >= 10 && (g[y - 1]?.[x] === WATER || g[y + 1]?.[x] === WATER ||
                            g[y][x - 1] === WATER || g[y][x + 1] === WATER)) edges.push([x, y]);
  for (const [x, y] of edges) {                              // stale provinces weather away more shoreline
    const v = byBlock[g[y][x] - 10]?.vitality ?? .5;
    if (hash(`e${x},${y}`) % Math.round(lerp(2, 4, v)) === 0) g[y][x] = WATER;
  }
  const props = [];
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      const b = byBlock[g[ty][tx] - 10];
      if (!b) continue;
      const h = hash(`t${tx},${ty}`);
      if (h % Math.round(lerp(9, 4, b.vitality)) === 0)      // lush vital provinces, sparse stale ones
        props.push({ x: tx + .5, y: ty + .5, seed: h, kind: b.prop });
    }
  return { blocks, byBlock, cities: data.cities, props, byRepo, g, pz, W, H, root: data.root };
}

function camFor(x0, y0, x1, y1, padX, padY) {              // cam that frames a tile rect, centered
  const s = Math.min((canvas.width - padX) / ((x1 - x0) * TILE), (canvas.height - padY) / ((y1 - y0) * TILE));
  return { s, ox: canvas.width / 2 - (x0 + x1) / 2 * TILE * s, oy: canvas.height / 2 - (y0 + y1) / 2 * TILE * s };
}
const worldCam = () => camFor(0, 0, nation.W, nation.H, 60, 90);
function fitMap() { Object.assign(mapCam, worldCam()); }

// ---- state tier: frame one province (camera + dim), no new rendering ----
function focusOn(b) { focusState = b; mapTween = camFor(b.x0, b.y0, b.x0 + b.iw, b.y0 + b.ih, 120, 160); stateFitS = mapTween.s; updateChrome(); }
function unfocus() { focusState = null; mapTween = worldCam(); updateChrome(); }
function pickState(mx, my) {
  const x = (mx - mapCam.ox) / (TILE * mapCam.s), y = (my - mapCam.oy) / (TILE * mapCam.s);
  return nation.blocks.find(b => x >= b.x0 && x <= b.x0 + b.iw && y >= b.y0 && y <= b.y0 + b.ih) || null;
}
function drawDim() {                                       // darken everything outside the focused province
  const b = focusState, a = tproj(b.x0, b.y0), c = tproj(b.x0 + b.iw, b.y0 + b.ih);
  ctx.fillStyle = 'rgba(18,8,20,.5)';
  ctx.fillRect(0, 0, canvas.width, a.sy);
  ctx.fillRect(0, c.sy, canvas.width, canvas.height - c.sy);
  ctx.fillRect(0, a.sy, a.sx, c.sy - a.sy);
  ctx.fillRect(c.sx, a.sy, canvas.width - c.sx, c.sy - a.sy);
}
const blockOf = id => nation.blocks.find(b => b.st.id === id) || null;
const trunc = s => s.length > 14 ? s.slice(0, 13) + '…' : s;

// ---- field guide: legend content follows the active tier (world / state / city) ----
const lgChip = (c, label) => `<div class="row"><span class="chip" style="background:${c}"></span>${label}</div>`;
const lgFlag = (c, label) => `<div class="row"><span style="color:${c};font-size:11px;line-height:1;flex-shrink:0">▶</span>&nbsp;${label}</div>`;
const FAMILY_LEGEND = [
  ['#4b8bbe', '⬠', 'backend &mdash; octagon (py go rs…)'],
  ['#e8c41c', '▭', 'frontend &mdash; banner (js ts vue…)'],
  ['#86867c', '⬡', 'infra &mdash; hexagon (yml tf sh…)'],
  ['#4a6b5c', '◉', 'data &mdash; ring (sql csv ipynb…)'],
  ['#c9b78a', '&#8745;', 'docs &mdash; arch (md rst txt…)'],
  ['#7d6b8a', '&#9671;', 'misc &mdash; diamond'],
];
const LG_TOWNS =
  '<h4>Towns &mdash; repos</h4>'
  + FAMILY_LEGEND.map(([c, sym, label]) =>
      `<div class="row"><span class="chip" style="background:${c}"></span><span style="font-size:11px;line-height:1">${sym}</span>&nbsp;${label}</div>`).join('')
  + '<div class="sub">base shape = role &middot; tint = language</div>'
  + '<div class="row"><span class="chips">'
  + ['#4b8bbe', '#3178c6', '#e8c41c', '#00add8', '#dea584', '#c9b78a'].map(c => `<span class="chip" style="background:${c}"></span>`).join('')
  + '</span>py&nbsp;ts&nbsp;js&nbsp;go&nbsp;rs&nbsp;md</div>'
  + '<div class="sub">lang label at zoom &ge;.45 &middot; size = file count</div>'
  + lgChip('#d4a953', 'gold ring = most-committed repos')
  + lgChip('#64a2c8', 'dashed ring = upper third by commits')
  + '<div class="row"><span class="chip ring"></span>halo = freshest quarter of the nation</div>'
  + lgFlag('#e67e22', '▶ orange flag = has infra (tf / docker)')
  + lgFlag('#3498db', '▶ blue flag = has web frontend')
  + lgFlag('#9b59b6', '▶ purple flag = has docs');
const LG_BIOMES =
  '<h4>Provinces &mdash; states</h4>'
  + lgChip('#2f7d46', 'forest = backend') + lgChip('#54b365', 'meadow = frontend') + lgChip('#c7b083', 'savanna = docs')
  + lgChip('#3f8c6b', 'wetland = data') + lgChip('#86867c', 'rock = infra')
  + '<div class="sub">lush &harr; bare coast = fresh &harr; stale &middot; land tint = state</div>';
const LG_CITY =
  '<h4>City &mdash; this repo</h4>'
  + '<div class="sub">plan: rings&nbsp;hub &middot; grid&nbsp;modules &middot; spine&nbsp;full-stack</div>'
  + lgChip('#d4a953', 'floors = code + coupling') + lgChip('#ffd678', 'lit = touched recently')
  + lgChip('#52e3d4', 'billboard = hottest third') + lgChip('#7edeff', 'antennas = import hub')
  + lgChip('#c98f4a', 'crane = TODO debt') + lgChip('#1d5a72', 'canals = layer edges')
  + lgChip('#c0395b', 'freight = package deps') + lgChip('#2b2230', 'ships = docker services')
  + lgChip('#6e7178', 'graves = deleted files');
const vitWord = v => v > .66 ? 'thriving' : v > .33 ? 'settled' : 'weathered';
function renderLegend() {
  const el = document.getElementById('panel-guide-body');
  if (!el) return;
  let html = '';
  if (focusState) {
    const b = focusState;
    html += `<div class="sub">${b.st.name} &middot; ${b.biome} &middot; ${vitWord(b.vitality)}</div>` + LG_TOWNS;
  } else html += LG_BIOMES + LG_TOWNS;
  el.innerHTML = html;
}

function renderCityPanel(c) {
  const plaque = document.getElementById('city-plaque');
  if (plaque) plaque.textContent = (c.name || c.repo).toUpperCase();
  const body = document.getElementById('panel-city-stats');
  if (!body) return;
  const age = c.age_days === 9999 ? 'ancient' : c.age_days < 1 ? 'today' : `${c.age_days}d ago`;
  const flags = [
    c.hasInfra    && ['#e67e22', 'has infra (tf / docker)'],
    c.hasFrontend && ['#3498db', 'has web frontend'],
    c.hasDocs     && ['#9b59b6', 'has docs'],
  ].filter(Boolean);
  body.innerHTML = `
    <div class="stat-grid">
      <div class="stat-cell"><span class="stat-label">files</span><span class="stat-value">${c.files}</span></div>
      <div class="stat-cell"><span class="stat-label">commits</span><span class="stat-value">${c.commits}</span></div>
      <div class="stat-cell"><span class="stat-label">last active</span><span class="stat-value">${age}</span></div>
      <div class="stat-cell"><span class="stat-label">province</span><span class="stat-value">${stateName(c.state)}</span></div>
    </div>
    <div class="city-tags">
      ${c.lang   ? `<span class="city-tag">${c.lang}</span>` : ''}
      ${c.family ? `<span class="city-tag">${c.family}</span>` : ''}
    </div>
    ${flags.length ? `<div class="city-flags"><h4>Features</h4>${flags.map(([col, label]) =>
      `<div class="flag-item"><span style="color:${col};font-size:11px;line-height:1">▶</span>&nbsp;${label}</div>`
    ).join('')}</div>` : ''}
    <div class="city-guide">${LG_CITY}</div>`;
}

function switchPanel(which) {
  document.getElementById('panel-guide').classList.toggle('panel-hidden', which !== 'guide');
  document.getElementById('panel-city').classList.toggle('panel-hidden', which !== 'city');
}

function updateChrome() {                                  // back button + [World ▸ State ▸ City] breadcrumb
  backBtn.style.display = (mode === 'city' || focusState) ? 'block' : 'none';
  const backLabel = mode === 'city' ? (focusState ? focusState.st.name.toUpperCase() : 'WORLD MAP') : 'WORLD MAP';
  backBtn.innerHTML = '&#8593; ' + backLabel;
  const active = mode === 'city' ? 'city' : focusState ? 'state' : 'world';
  const sb = focusState || ((currentCity || lastCity) && blockOf((currentCity || lastCity).state));
  const cityT = currentCity || lastCity;
  const set = (tier, on, label) => {
    tierBtn[tier].textContent = label;
    tierBtn[tier].classList.toggle('active', active === tier);
    tierBtn[tier].classList.toggle('off', !on && active !== tier);
  };
  set('world', true, 'WORLD');
  set('state', !!sb, sb ? trunc(sb.st.name) : 'STATE');
  set('city', !!cityT, cityT ? trunc(cityT.name || cityT.repo) : 'CITY');
  renderLegend();                                          // legend tracks the active tier
  if (typeof setHallContext === 'function')                // dispatch floor reskins to the active tier
    setHallContext(active === 'world' ? 'nation' : active,
      active === 'world' ? nation.root : active === 'state' ? sb.st.name : (cityT.name || cityT.repo));
}

// snap navigation used by the breadcrumb (always reachable: up a tier, or back to the last city)
function navWorld() { if (mode === 'city') { focusState = null; savedMap = worldCam(); drillOut(); } else if (focusState) unfocus(); updateChrome(); }
function navState() {
  const sb = focusState || ((currentCity || lastCity) && blockOf((currentCity || lastCity).state));
  if (!sb) return;
  if (mode === 'city') { focusState = sb; const cam = camFor(sb.x0, sb.y0, sb.x0 + sb.iw, sb.y0 + sb.ih, 120, 160); stateFitS = cam.s; savedMap = cam; drillOut(); }
  else focusOn(sb);
  updateChrome();
}
function navCity() { const c = currentCity || lastCity; if (c && mode !== 'city') drillIn(c); }

// ---- top-down terrain ----
function drawMapGround(t) {
  const { g, W, H } = nation, z = mapCam.s * TILE, sz = Math.ceil(z) + 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = tproj(x, y);
      if (p.sx < -z || p.sx > canvas.width || p.sy < -z || p.sy > canvas.height) continue;
      const code = g[y][x], alt = (x + y) % 2;
      if (code === WATER) {
        ctx.fillStyle = alt ? '#2a6b86' : '#256079'; ctx.fillRect(p.sx, p.sy, sz, sz);
        if ((x * 7 + y * 11) % 5 === 0) {
          ctx.strokeStyle = `rgba(190,228,238,${.12 + .12 * Math.sin(t / 650 + x * 1.7 + y)})`;
          ctx.lineWidth = Math.max(1, mapCam.s);
          ctx.beginPath(); ctx.moveTo(p.sx + z * .25, p.sy + z * .5); ctx.lineTo(p.sx + z * .75, p.sy + z * .5); ctx.stroke();
        }
      } else if (code === PLAZA) {
        const m = nation.pz[y][x];
        if (!m) { ctx.fillStyle = alt ? '#cdbd95' : '#c2b187'; ctx.fillRect(p.sx, p.sy, sz, sz); }
        else {
          ctx.fillStyle = m.role === 'edge' ? m.pal.edge : m.role === 'center' ? m.pal.accent
                                            : alt ? m.pal.fill : m.pal.fillAlt;
          ctx.fillRect(p.sx, p.sy, sz, sz);
          if (m.role === 'inner' && m.pal.cobble && (x * 5 + y * 3) % 3 === 0) {   // paved speckle for veterans
            ctx.fillStyle = shade(m.pal.fill, .85);
            ctx.fillRect(p.sx + z * .25, p.sy + z * .25, Math.ceil(z * .5), Math.ceil(z * .5));
          }
        }
      }
      else {
        const b = nation.byBlock[code - 10];
        const coast = g[y - 1]?.[x] === WATER || g[y + 1]?.[x] === WATER || g[y]?.[x - 1] === WATER || g[y]?.[x + 1] === WATER;
        ctx.fillStyle = coast ? (alt ? '#d8c89a' : '#cdbb89') : (alt ? b.land : b.landAlt);
        ctx.fillRect(p.sx, p.sy, sz, sz);
      }
    }
}

function drawProp(c) {                                       // biome ground cover (tree/bush/rock/reed/dune)
  const p = tproj(c.x, c.y), z = mapCam.s * TILE;
  if (c.kind === 'rock') {
    ctx.fillStyle = '#6b6b63'; ctx.beginPath(); ctx.arc(p.sx, p.sy, z * .26, 0, 7); ctx.fill();
    ctx.fillStyle = '#86867c'; ctx.beginPath(); ctx.arc(p.sx - z * .07, p.sy - z * .07, z * .15, 0, 7); ctx.fill();
  } else if (c.kind === 'reed') {
    ctx.strokeStyle = '#3f8c6b'; ctx.lineWidth = Math.max(1, mapCam.s);
    for (const dx of [-.12, 0, .12]) { ctx.beginPath(); ctx.moveTo(p.sx + dx * z, p.sy + z * .2); ctx.lineTo(p.sx + dx * z, p.sy - z * .25); ctx.stroke(); }
  } else if (c.kind === 'dune') {
    ctx.fillStyle = '#c7b083'; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, z * .34, z * .16, 0, 0, 7); ctx.fill();
  } else if (c.kind === 'bush') {
    ctx.fillStyle = '#3f9a52'; ctx.beginPath(); ctx.arc(p.sx, p.sy, z * .2, 0, 7); ctx.fill();
    ctx.fillStyle = '#54b365'; ctx.beginPath(); ctx.arc(p.sx + z * .1, p.sy - z * .05, z * .13, 0, 7); ctx.fill();
  } else {                                                   // tree
    ctx.fillStyle = '#235e36'; ctx.beginPath(); ctx.arc(p.sx, p.sy, z * .32, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f7d46'; ctx.beginPath(); ctx.arc(p.sx - z * .08, p.sy - z * .08, z * .2, 0, 7); ctx.fill();
  }
}

// ---- family-keyed town icons (top-down) ----
function box(sx, sy, w, h, col) {
  ctx.fillStyle = col; ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
  ctx.strokeStyle = 'rgba(20,10,22,.55)'; ctx.lineWidth = Math.max(1, mapCam.s); ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
}
const ICON = {
  backend(sx, sy, u, col) {                                // keep: walls + corner turrets
    box(sx, sy, u, u, shade(col, .95));
    for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) box(sx + dx * u * .42, sy + dy * u * .42, u * .3, u * .3, shade(col, 1.2));
    box(sx, sy, u * .42, u * .42, shade(col, 1.25));
  },
  frontend(sx, sy, u, col, t, seed) {                      // plaza with a glowing marquee
    box(sx, sy, u, u * .82, shade(col, 1.05));
    ctx.fillStyle = `rgba(82,227,212,${.6 + .35 * Math.sin(t / 600 + seed)})`;
    ctx.fillRect(sx - u * .4, sy - u * .12, u * .8, u * .24);
  },
  docs(sx, sy, u, col) {                                   // library: ridge + column dots
    box(sx, sy, u * 1.1, u * .72, shade(col, 1));
    ctx.strokeStyle = shade(col, .55); ctx.lineWidth = Math.max(1, mapCam.s);
    ctx.beginPath(); ctx.moveTo(sx - u * .55, sy); ctx.lineTo(sx + u * .55, sy); ctx.stroke();
    ctx.fillStyle = '#f1e6d6';
    for (const u2 of [-.36, -.12, .12, .36]) ctx.fillRect(sx + u2 * u - mapCam.s, sy + u * .26, 2 * mapCam.s, u * .12);
  },
  infra(sx, sy, u, col, t, seed) {                         // factory: shed + smokestack puff
    box(sx, sy, u, u * .7, shade(col, .85));
    ctx.fillStyle = '#3a3f4a'; ctx.beginPath(); ctx.arc(sx + u * .3, sy - u * .2, u * .16, 0, 7); ctx.fill();
    for (let i = 0; i < 3; i++) { const k = (t / 900 + i / 3 + seed % 7) % 1, rr = (2 + 4 * k) * mapCam.s;
      ctx.fillStyle = `rgba(200,200,212,${.32 * (1 - k)})`; ctx.beginPath(); ctx.arc(sx + u * .3, sy - u * .2 - 10 * k * mapCam.s, rr, 0, 7); ctx.fill(); }
  },
  data(sx, sy, u, col) {                                   // silos: concentric tanks
    for (const [dx, r] of [[-.28, .34], [.28, .34], [0, .26]]) {
      ctx.fillStyle = shade(col, 1.1); ctx.beginPath(); ctx.arc(sx + dx * u, sy, r * u, 0, 7); ctx.fill();
      ctx.strokeStyle = shade(col, .5); ctx.lineWidth = Math.max(1, mapCam.s); ctx.stroke();
    }
  },
  neutral(sx, sy, u, col) {                                // hamlet: a few rooftops
    for (const [dx, dy] of [[-.3, -.2], [.32, -.1], [0, .28]]) box(sx + dx * u, sy + dy * u, u * .5, u * .5, shade(col, 1));
  },
};

// ---- per-repo backdrop: family-keyed shape, language-tinted, age-faded ----
function drawBasePlate(sx, sy, u, col, family, agePct) {
  const s = mapCam.s, fade = lerp(.30, .10, agePct);         // freshest pad solid, oldest faint — rank, not days
  ctx.fillStyle = hexA(col, fade);
  ctx.strokeStyle = hexA(col, Math.min(1, fade * 2.2));
  ctx.lineWidth = Math.max(1, 1.8 * s);
  ctx.beginPath();
  if (family === 'backend') {               // octagon — fortress pad
    const r = u * .84, k = r * .38;
    ctx.moveTo(sx - k, sy - r); ctx.lineTo(sx + k, sy - r);
    ctx.lineTo(sx + r, sy - k); ctx.lineTo(sx + r, sy + k);
    ctx.lineTo(sx + k, sy + r); ctx.lineTo(sx - k, sy + r);
    ctx.lineTo(sx - r, sy + k); ctx.lineTo(sx - r, sy - k);
  } else if (family === 'frontend') {       // rounded rect — modern banner
    const w = u * .92, h = u * .66, rx = u * .22;
    ctx.roundRect ? ctx.roundRect(sx - w, sy - h, w * 2, h * 2, rx)
                  : ctx.rect(sx - w, sy - h, w * 2, h * 2);
  } else if (family === 'infra') {          // hexagon — industrial tile
    const r = u * .82;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + i * Math.PI / 3;
      i === 0 ? ctx.moveTo(sx + r * Math.cos(a), sy + r * Math.sin(a))
              : ctx.lineTo(sx + r * Math.cos(a), sy + r * Math.sin(a));
    }
  } else if (family === 'data') {           // circle — tank base
    ctx.arc(sx, sy, u * .82, 0, Math.PI * 2);
  } else if (family === 'docs') {           // arch — classical library pediment
    const w = u * .86, h = u * .5;
    ctx.moveTo(sx - w, sy + h);
    ctx.lineTo(sx - w, sy - h * .15);
    ctx.arc(sx, sy - h * .15, w, Math.PI, 0);
    ctx.lineTo(sx + w, sy + h);
  } else {                                  // diamond — misc/neutral
    ctx.moveTo(sx, sy - u * .86); ctx.lineTo(sx + u * .7, sy);
    ctx.lineTo(sx, sy + u * .86); ctx.lineTo(sx - u * .7, sy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (family === 'data' && s >= .3) {       // inner concentric ring
    ctx.strokeStyle = hexA(col, Math.min(1, fade * 1.8));
    ctx.lineWidth = Math.max(1, s);
    ctx.beginPath(); ctx.arc(sx, sy, u * .5, 0, Math.PI * 2); ctx.stroke();
  }
}

// ---- commit-tier badge: gold solid for veterans, teal dashed for actives ----
function drawTierBadge(sx, sy, u, cPct, t, seed) {
  if (cPct <= 2 / 3) return;                                 // only the upper third by commits earns a ring
  const elite = cPct > 8 / 9;                                // top sliver of the nation → gold
  const rgb = elite ? '212,169,83' : '100,162,200', pulse = .45 + .28 * Math.sin(t / 900 + seed);
  ctx.strokeStyle = `rgba(${rgb},${elite ? pulse : pulse * .75})`;
  ctx.lineWidth = Math.max(1.5, (elite ? 2.6 : 1.8) * mapCam.s);
  ctx.setLineDash(elite ? [] : [4 * mapCam.s, 3 * mapCam.s]);
  ctx.beginPath(); ctx.ellipse(sx, sy, u * .97, u * .8, 0, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

// ---- pennant flags: hasInfra / hasFrontend / hasDocs fly above the icon ----
function drawPennants(sx, sy, u, c) {
  const flags = [];
  if (c.hasInfra) flags.push('#e67e22');
  if (c.hasFrontend) flags.push('#3498db');
  if (c.hasDocs) flags.push('#9b59b6');
  if (!flags.length) return;
  const s = mapCam.s;
  flags.forEach((col, i) => {
    const px = sx + (i - (flags.length - 1) / 2) * u * .44;
    const base = sy - u * .84, pole = base - u * .58;
    ctx.strokeStyle = '#2b1622'; ctx.lineWidth = Math.max(1, s);
    ctx.beginPath(); ctx.moveTo(px, base); ctx.lineTo(px, pole); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(px, pole);
    ctx.lineTo(px + u * .28, pole + u * .18);
    ctx.lineTo(px, pole + u * .36);
    ctx.closePath(); ctx.fill();
  });
}

function drawIcon(c, t) {
  const p = tproj(c.x, c.y), u = (10 + c.fr * 6) * mapCam.s, seed = hash(c.repo);
  if ((c._age_daysPct ?? 1) < 1 / 4) {                    // warm halo on the freshest quarter of the nation
    ctx.strokeStyle = `rgba(255,214,120,${.28 + .22 * Math.sin(t / 600 + seed)})`;
    ctx.lineWidth = Math.max(2, 3 * mapCam.s);
    ctx.beginPath(); ctx.ellipse(p.sx, p.sy, u * .98, u * .8, 0, 0, Math.PI * 2); ctx.stroke();
  }
  drawBasePlate(p.sx, p.sy, u, c.color, c.family, c._age_daysPct ?? .5);
  ctx.fillStyle = 'rgba(20,10,22,.24)';                    // drop shadow
  ctx.beginPath(); ctx.ellipse(p.sx, p.sy + u * .52, u * .62, u * .26, 0, 0, 7); ctx.fill();
  drawTierBadge(p.sx, p.sy, u, c._commitsPct ?? 0, t, seed);
  (ICON[c.family] || ICON.neutral)(p.sx, p.sy, u, c.color, t, seed);
  if (mapCam.s >= .45 && c.lang) {                         // lang badge
    const label = c.lang.slice(0, 2).toUpperCase();
    ctx.font = `bold ${Math.max(6, Math.round(5.5 * mapCam.s))}px Silkscreen, monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,10,22,.85)';
    ctx.fillText(label, p.sx + .5, p.sy + .5);
    ctx.fillStyle = '#f9efe3';
    ctx.fillText(label, p.sx, p.sy);
  }
  drawPennants(p.sx, p.sy, u, c);
  c._scr = p; c._u = u;
}

const hitsBox = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function cityLabel(c, placed) {
  if (mapCam.s < .35) return;
  const p = tproj(c.x, c.y), u = (10 + c.fr * 6) * mapCam.s;
  const sz = Math.max(11, Math.min(19, 15 * mapCam.s));
  ctx.font = `${sz}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  const label = c.name || c.repo;
  const name = label.length > 20 ? label.slice(0, 19) + '…' : label;
  const w = ctx.measureText(name).width, by = p.sy + u * .8;     // text baseline
  const box = { x: p.sx - w / 2 - 6, y: by - sz + 1, w: w + 12, h: sz + 6 };
  if (placed.some(o => hitsBox(box, o))) return;                // first-placed (larger) labels keep the spot
  placed.push(box);
  ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 4);
  ctx.fillStyle = 'rgba(20,10,22,.78)'; ctx.fill();             // plate for contrast over terrain
  ctx.lineWidth = 1.5; ctx.strokeStyle = c.color; ctx.stroke();  // family-tinted edge ties plate to its city
  ctx.fillStyle = '#f9efe3'; ctx.fillText(name, p.sx, by + 2);
}

function stateLabel(b) {
  const text = b.st.name.toUpperCase();
  const p = tproj(b.x0 + b.iw / 2, b.y0 + .3);
  const availPx = (tproj(b.x0 + b.iw, b.y0).sx - tproj(b.x0, b.y0).sx) * 0.82;
  let sz = Math.min(42, Math.max(10, 20 * mapCam.s));
  ctx.font = `bold ${sz}px Silkscreen, monospace`;
  while (sz > 10 && ctx.measureText(text).width > availPx) {
    sz -= 1;
    ctx.font = `bold ${sz}px Silkscreen, monospace`;
  }
  const squeeze = Math.min(1, availPx / ctx.measureText(text).width);   // long names compress instead of bleeding into the next province
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20,10,22,.75)';
  ctx.lineJoin = 'round';
  ctx.save();
  ctx.translate(p.sx, p.sy);
  ctx.scale(squeeze, 1);
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = hexA(b.st.color, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawMap(t) {
  drawMapGround(t);
  for (const c of nation.props) drawProp(c);
  for (const c of nation.cities) drawIcon(c, t);
  const placed = [];                                            // bigger repos claim label space first; neighbors yield
  for (const c of [...nation.cities].sort((a, b) => b.fr - a.fr)) cityLabel(c, placed);
  for (const b of nation.blocks) stateLabel(b);
}

// ---- drill: lazy-fetch the city, fly-zoom the map, crossfade into the iso city ----
function ensureCity(c) {
  if (c.cityState || c.fetching) return;
  c.fetching = true;
  fetch(`city-data.json?repo=${encodeURIComponent(c.repo)}`)
    .then(r => r.ok ? r.json() : Promise.reject(r.status))
    .then(d => { c.cityState = City.layout(d); })
    .catch(() => { c.fetching = false; });
}

function drillIn(c) {
  if (trans || mode === 'city') return;
  ensureCity(c);
  lastCity = c; updateChrome();
  savedMap = { ...mapCam };                                 // restore point for drill-out
  const s = mapCam.s * 5;                                   // fly the map in onto the city
  trans = { dir: 'in', k: 0, c, target: { s, ox: canvas.width / 2 - c.x * TILE * s, oy: canvas.height / 2 - c.y * TILE * s } };
}

function drillOut() {
  if (trans || mode === 'map') return;
  trans = { dir: 'out', k: 1, c: currentCity };       // savedMap restores the world or framed-state cam
}

function startCity(c) {
  mode = 'city'; trans = null;
  City.fit(cityCam, canvas, c.cityState, 90, 0, 1);
  cityFitS = cityCam.s; cityCam.rot = 0;
  renderCityPanel(c); switchPanel('city');
  updateChrome();
}

function frame(t) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (mode === 'map' && !trans) {
    if (mapTween) {
      for (const k of ['s', 'ox', 'oy']) mapCam[k] = lerp(mapCam[k], mapTween[k], .16);
      if (Math.abs(mapTween.s - mapCam.s) < mapTween.s * .01) { Object.assign(mapCam, mapTween); mapTween = null; }
    }
    drawMap(t);
    if (focusState) drawDim();
    requestAnimationFrame(frame); return;
  }
  if (mode === 'city' && !trans) {
    City.draw(ctx, cityCam, currentCity.cityState, t);
    requestAnimationFrame(frame); return;
  }
  // transition: crossfade map (zooming) and the iso city
  const c = trans.c;
  trans.k += ((trans.dir === 'in' ? (c.cityState ? 1 : .82) : 0) - trans.k) * .12;
  const tg = trans.dir === 'in' ? trans.target : savedMap;
  if (tg) for (const key of ['s', 'ox', 'oy']) mapCam[key] = lerp(mapCam[key], tg[key], .12);
  ctx.globalAlpha = 1 - trans.k; drawMap(t); ctx.globalAlpha = 1;
  if (c.cityState) {
    if (!currentCity || currentCity !== c) { currentCity = c; City.fit(cityCam, canvas, c.cityState, 90, 0, 1); cityFitS = cityCam.s; }
    ctx.globalAlpha = trans.k; City.draw(ctx, cityCam, c.cityState, t); ctx.globalAlpha = 1;
  }
  if (trans.dir === 'in' && trans.k > .97 && c.cityState) startCity(c);
  else if (trans.dir === 'out' && trans.k < .03) { mode = 'map'; trans = null; currentCity = null; switchPanel('guide'); updateChrome(); }
  requestAnimationFrame(frame);
}

async function init() {
  nation = layoutNation(await (await fetch('nation-data.json')).json());
  fitMap();
  updateChrome();
  requestAnimationFrame(frame);
}

// ---- controls ----
function zoom(k, mx = canvas.width / 2, my = canvas.height / 2) {
  if (trans) return;
  const cam = mode === 'city' ? cityCam : mapCam;
  cam.ox = mx + (cam.ox - mx) * k; cam.oy = my + (cam.oy - my) * k; cam.s *= k;
  if (mode === 'city') {
    if (cam.s < cityFitS * .55) drillOut();
  } else {
    if (cam.s < worldCam().s) Object.assign(cam, worldCam());
    mapTween = null; if (focusState && mapCam.s < stateFitS * .7) unfocus();
    if (k > 1) {                                        // zoom in: drill once a city fills the view
      const c = pickCity(mx, my);
      if (c && (10 + c.fr * 6) * cam.s > Math.min(canvas.width, canvas.height) * .25) drillIn(c);
    }
  }
}
const rotCam = () => cityCam;
const CTL = { 'rot-': () => mode === 'city' && (rotCam().rot = (rotCam().rot + 7) % 8),
              'rot+': () => mode === 'city' && (rotCam().rot = (rotCam().rot + 1) % 8),
              'zoom+': () => zoom(1.18), 'zoom-': () => zoom(1 / 1.18),
              'reset': () => mode === 'city' ? drillOut() : focusState ? unfocus() : fitMap() };
document.getElementById('mapctl').addEventListener('click', e => { const a = e.target.dataset.act; if (a && nation) CTL[a](); });
backBtn.addEventListener('click', () => { if (mode === 'city') drillOut(); else if (focusState) unfocus(); });
document.getElementById('tiers').addEventListener('click', e => {
  const tier = e.target.dataset.tier;
  if (!tier || !nation || trans) return;
  ({ world: navWorld, state: navState, city: navCity })[tier]();
});
window.addEventListener('keydown', e => {
  if (mode === 'city' && (e.key === 'q' || e.key === 'e')) CTL[e.key === 'q' ? 'rot+' : 'rot-']();
});

let drag = null, moved = false;
canvas.addEventListener('mousedown', m => { drag = { x: m.clientX, y: m.clientY }; moved = false; });
window.addEventListener('mouseup', () => drag = null);
canvas.addEventListener('wheel', m => {
  m.preventDefault();
  const r = canvas.getBoundingClientRect();
  zoom(m.deltaY < 0 ? 1.12 : 1 / 1.12, (m.clientX - r.left) * (canvas.width / r.width), (m.clientY - r.top) * (canvas.height / r.height));
}, { passive: false });

canvas.addEventListener('click', m => {
  if (moved || trans) return;
  const r = canvas.getBoundingClientRect();
  const mx = (m.clientX - r.left) * (canvas.width / r.width), my = (m.clientY - r.top) * (canvas.height / r.height);
  if (mode === 'city') return;                            // inside a city: no further drill-down
  const c = pickCity(mx, my);
  if (c) { drillIn(c); return; }                           // town → city; province → state focus; sea → unfocus
  const b = pickState(mx, my);
  if (b && b !== focusState) focusOn(b);
  else if (!b && focusState) unfocus();
});

function pickCity(mx, my) {
  let best = null, bd = Infinity;
  for (const c of nation.cities) {
    if (!c._scr) continue;
    const d = Math.hypot(mx - c._scr.sx, my - c._scr.sy);
    if (d < c._u && d < bd) { bd = d; best = c; }
  }
  return best;
}

canvas.addEventListener('mousemove', m => {
  const r = canvas.getBoundingClientRect();
  const kx = canvas.width / r.width, ky = canvas.height / r.height;
  const mx = (m.clientX - r.left) * kx, my = (m.clientY - r.top) * ky;
  if (drag) {
    moved = true; mapTween = null;
    const cam = mode === 'city' ? cityCam : mapCam;
    cam.ox += (m.clientX - drag.x) * kx; cam.oy += (m.clientY - drag.y) * ky;
    drag = { x: m.clientX, y: m.clientY };
    return;
  }
  let text = null;
  if (mode === 'city' && currentCity) {
    const b = City.pick(currentCity.cityState, mx, my);
    if (b) text = b.tip || `${b.path} · ${b.floors} fl · ${b.loc} loc · ${b.commits} commits`;
  } else if (mode === 'map') {
    const c = pickCity(mx, my);
    if (c) text = `${c.name || c.repo} · ${stateName(c.state)} · ${c.files} files · ${c.commits} commits · ${c.age_days}d · ${c.family}`;
  }
  if (text) {
    tooltip.textContent = text;
    tooltip.style.left = `${m.clientX + 14}px`; tooltip.style.top = `${m.clientY + 14}px`; tooltip.style.display = 'block';
  } else tooltip.style.display = 'none';
});

function stateName(id) { return (nation.blocks.find(b => b.st.id === id) || { st: {} }).st.name || id; }

init();
