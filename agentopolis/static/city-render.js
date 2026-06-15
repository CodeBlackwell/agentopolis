// Agentopolis City lib — diamond-ring radial layout from zoning + git seed, iso drawing, live growth.
// Pages talk to the `City` object; CityScape (loaded after) draws ground/water/props.
const City = (() => {
  const HW = 26, HH = 13, FLOOR = 14;
  const proj = (cam, x, y) => {
    const r = cam.rot || 0;
    if (cam._r !== r) { cam._r = r; cam._c = Math.cos(r * Math.PI / 4); cam._s = Math.sin(r * Math.PI / 4); }
    if (r) {
      const dx = x - cam.cx, dy = y - cam.cy;
      x = cam.cx + dx * cam._c + dy * cam._s;
      y = cam.cy - dx * cam._s + dy * cam._c;
    }
    return { sx: cam.ox + (x - y) * HW * cam.s, sy: cam.oy + (x + y) * HH * cam.s };
  };
  const lift = (p, h) => ({ sx: p.sx, sy: p.sy - h });
  const lerp = (a, c, u) => ({ sx: a.sx + (c.sx - a.sx) * u, sy: a.sy + (c.sy - a.sy) * u });
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const dkey = rot => {                                     // painter's key for any eighth turn
    const a = rot * Math.PI / 4;
    const u = Math.cos(a) - Math.sin(a), v = Math.cos(a) + Math.sin(a);
    return p => u * p.x + v * p.y;
  };
  const spin = (cam, pts) => {                              // relabel corners: 0=screen top, then clockwise
    if (!cam.rot) return pts;
    let k = 0;
    for (let i = 1; i < 4; i++) if (pts[i].sy < pts[k].sy) k = i;
    return [...pts.slice(k), ...pts.slice(0, k)];
  };
  const q = (vals, k) => vals.sort((x, y) => x - y)[Math.floor(vals.length * k)] ?? 0;
  const near = (h, mx, my) => {                             // point within w of segment ax,ay→bx,by
    const dx = h.bx - h.ax, dy = h.by - h.ay;
    const u = Math.max(0, Math.min(1, ((mx - h.ax) * dx + (my - h.ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(mx - (h.ax + u * dx), my - (h.ay + u * dy)) < h.w;
  };

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.round(Math.min(255, v * f));
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }

  function mix(hexA, hexB, k) {
    const a = parseInt(hexA.slice(1), 16), b = parseInt(hexB.slice(1), 16);
    const ch = sh => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
    return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
  }

  function quad(ctx, a, b, c, d, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
    ctx.closePath();
    ctx.fill();
  }

  // ---- city plan: the layout FORM follows the repo's structure. Three generators emit the
  //      same blocks + ground contract; choosePlan picks one (or .agentopolis.json pins "plan"). ----
  // codes: 0 street, 1 avenue, 2 green, 3 plaza, 4 river, 5 bridge, 6 cemetery, 10+id district pavement
  function newBlock(state, comp, list) {
    const block = { comp, list, lots: [], next: 0,
                    pave: [mix('#57455a', comp.color, .22), mix('#4d3d50', comp.color, .22)] };
    block.id = state.blocks.length;
    state.blocks.push(block);
    return block;
  }
  const centroid = b => {
    b.lx = b.lots.reduce((a, l) => a + l.x, 0) / (b.lots.length || 1);
    b.ly = b.lots.reduce((a, l) => a + l.y, 0) / (b.lots.length || 1);
  };
  const groupsOf = data =>                                  // [civic, ...one group per layer], non-empty
    [data.zone.components.filter(c => c.kind === 'civic'),
     ...data.zone.layers.map(l =>
       data.zone.components.filter(c => c.layer === l && c.kind !== 'civic'))].filter(g => g.length);
  const need = (comp, list) => Math.max(comp.kind === 'civic' ? 6 : 1, list.length) + 2;   // +2 spare lots

  const widen = bw => bw + Math.floor(bw / 2);            // gross width that yields bw lot-columns after alleys

  function paveRect(state, g, block, x0, y0, w, h) {
    const plaza = block.comp.kind === 'civic';
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (y < 0 || x < 0 || y >= state.H || x >= state.W) continue;
        if (state.reserved && state.reserved.has(x + ',' + y)) { g[y][x] = 2; continue; }   // relic plot: stay green
        if (!plaza && w >= 4 && (x - x0) % 3 === 2) { g[y][x] = 0; continue; }   // back-alley: no lot is landlocked
        g[y][x] = plaza ? 3 : 10 + block.id;
        block.lots.push({ x: x + .5, y: y + .5 });
      }
    centroid(block);
  }

  // ---- form A: concentric diamond rings around the civic plaza (hub-and-spoke repos) ----
  function planRadial(state, data, byComp) {
    const annuli = [];
    let r = 2;                                              // rings 0-1 are the city-hall plaza
    for (const comps of groupsOf(data)) {
      const lists = comps.map(c => byComp[c.id] || []);
      const needs = lists.map((l, k) => need(comps[k], l));
      const total = needs.reduce((a, b) => a + b, 0);
      const lanes = k => 8 * k - 4 - 4 * (Math.floor(k / 3) + Math.floor((k - 1) / 3));   // minus spokes + alleys
      let r1 = r, cap = 0;
      while (cap < total) { if ((r1 - r) % 3 !== 2) cap += lanes(r1); r1++; }    // every 3rd ring is a street
      annuli.push({ comps, lists, need: needs, r0: r, r1, tiles: [] });
      r = r1 + 2 + hash(`canal${annuli.length}`) % 2;       // canal between annuli, 2-3 rings wide
    }
    const Rmax = r - 1, margin = 3, cx = margin + Rmax, cy = cx;
    state.W = state.H = 2 * Rmax + 2 * margin + 1;
    state.cityHall = { x: cx + .5, y: cy + .5 };
    state.origin = { x: cx + .5, y: cy + .5 };             // shared frame anchor
    const g = Array.from({ length: state.H }, () => new Array(state.W).fill(2));
    for (let y = 0; y < state.H; y++)
      for (let x = 0; x < state.W; x++) {
        const dx = x - cx, dy = y - cy, rr = Math.max(Math.abs(dx), Math.abs(dy));
        if (rr <= 1) g[y][x] = 3;                           // city-hall plaza
        else if (rr > Rmax) continue;                       // parkland past the city limits
        else {
          const ann = annuli.find(a => rr >= a.r0 && rr < a.r1);
          if (!ann) g[y][x] = !dx || !dy ? 5 : 4;           // grachtengordel: canal ring, spokes bridge it
          else if (!dx || !dy) g[y][x] = 0;                 // 4 radial spokes
          else if ((rr - ann.r0) % 3 === 2) g[y][x] = 1;    // minor ring street splits the wedge mass
          else if ((Math.abs(dy) === rr ? Math.abs(dx) : Math.abs(dy)) % 3 === 0)
            g[y][x] = 0;                                    // radial alley: max 2 buildings per row
          else ann.tiles.push({ x, y, r: rr, a: Math.atan2(dy, dx) });
        }
      }
    for (const ann of annuli) {
      ann.tiles.sort((t1, t2) => t1.a - t2.a);              // atan2 seam lands on the west spoke
      const total = ann.need.reduce((a, b) => a + b, 0);
      let acc = 0, i0 = 0;
      ann.comps.forEach((comp, k) => {
        acc += ann.need[k];
        const i1 = Math.round(ann.tiles.length * acc / total);
        const block = newBlock(state, comp, ann.lists[k]);
        const tiles = ann.tiles.slice(i0, i1).sort((t1, t2) => t1.r - t2.r || t1.a - t2.a);
        i0 = i1;
        let cap = tiles.length;                             // keep ≥2 spare lots for live growth
        for (const tl of tiles) {
          if (state.reserved && state.reserved.has(tl.x + ',' + tl.y)) continue;   // relic plot: leave greenery
          if (tl.r === ann.r1 - 1 && comp.kind !== 'civic' && cap > block.list.length + 2 &&
              hash(`c${tl.x},${tl.y}`) % 3 === 0) { cap--; continue; }   // ragged outskirts stay green
          g[tl.y][tl.x] = comp.kind === 'civic' ? 3 : 10 + block.id;
          block.lots.push({ x: tl.x + .5, y: tl.y + .5 });
        }
        centroid(block);
      });
    }
    state.ground = g;
  }

  // ---- form B: Manhattan grid of superblocks (many loosely-coupled districts) ----
  function planGrid(state, data, byComp) {
    const cells = groupsOf(data).flat().map(c => {
      const list = byComp[c.id] || [], n = need(c, list);
      const bw = Math.max(2, Math.round(Math.sqrt(n * 1.4)));
      return { comp: c, list, w: widen(bw), h: Math.max(2, Math.ceil(n / bw)) };
    });
    const targetW = Math.max(Math.ceil(Math.sqrt(cells.reduce((a, c) => a + (c.w + 1) * (c.h + 1), 0))),
                             ...cells.map(c => c.w));
    const margin = 3, gap = 1;
    let x = margin, y = margin, rowH = 0, maxX = margin;
    for (const cell of cells) {                             // shelf-pack rectangles into roughly-square rows
      if (x > margin && x + cell.w - margin > targetW) { x = margin; y += rowH + gap; rowH = 0; }
      cell.x0 = x; cell.y0 = y;
      x += cell.w + gap; rowH = Math.max(rowH, cell.h); maxX = Math.max(maxX, cell.x0 + cell.w);
    }
    state.W = maxX + margin; state.H = y + rowH + margin;
    const g = Array.from({ length: state.H }, (_, yy) =>   // street interior, parkland border
      Array.from({ length: state.W }, (_, xx) =>
        xx < 2 || yy < 2 || xx >= state.W - 2 || yy >= state.H - 2 ? 2 : 0));
    for (const cell of cells)
      paveRect(state, g, newBlock(state, cell.comp, cell.list), cell.x0, cell.y0, cell.w, cell.h);
    for (let yy = 0; yy < state.H; yy++)                    // every 4th street row becomes an avenue
      for (let xx = 0; xx < state.W; xx++) if (g[yy][xx] === 0 && yy % 4 === 0) g[yy][xx] = 1;
    state.ground = g;
    const civic = state.blocks.find(b => b.comp.kind === 'civic') || state.blocks[0];
    state.cityHall = { x: civic.lx, y: civic.ly };
    state.origin = { x: state.W / 2, y: state.H / 2 };     // shared frame anchor (map center)
  }

  // ---- form C: a boulevard with districts strung along it (few / strongly-layered repos) ----
  function planSpine(state, data, byComp) {
    const cells = groupsOf(data).flat().map(c => {          // ordered civic → back → mid → front → under
      const list = byComp[c.id] || [], n = need(c, list);
      const h = Math.max(2, Math.min(4, Math.round(Math.sqrt(n))));
      return { comp: c, list, h, w: widen(Math.max(2, Math.ceil(n / h))) };
    });
    const margin = 3, gap = 1, spineW = 2, maxDepth = Math.max(...cells.map(c => c.h));
    const cyTop = margin + maxDepth;
    state.H = cyTop + spineW + maxDepth + margin;
    let x = margin, side = 0;
    for (const cell of cells) {                             // alternate districts above / below the boulevard
      cell.x0 = x; cell.y0 = side ? cyTop + spineW : cyTop - cell.h;
      x += cell.w + gap; side ^= 1;
    }
    state.W = x + margin;
    const g = Array.from({ length: state.H }, () => new Array(state.W).fill(2));
    for (let y = cyTop; y < cyTop + spineW; y++)            // the boulevard runs the city's length
      for (let xx = margin - 1; xx < state.W - margin + 1; xx++) g[y][xx] = 1;
    for (const cell of cells)
      paveRect(state, g, newBlock(state, cell.comp, cell.list), cell.x0, cell.y0, cell.w, cell.h);
    state.ground = g;
    const civic = state.blocks.find(b => b.comp.kind === 'civic') || state.blocks[0];
    state.cityHall = { x: civic.lx, y: civic.ly };
    state.origin = { x: state.W / 2, y: state.H / 2 };     // shared frame anchor (map center)
  }

  // ---- form D: a green commons ringed by neighborhoods, dirt lanes as spokes (small / simple repos) ----
  function lane(g, x0, y0, x1, y1) {                       // straight dirt lane, only carved over greenery
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let i = 0; i <= n; i++) {
      const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
      if (g[y] && g[y][x] === 2) g[y][x] = 0;
    }
  }
  function planVillage(state, data, byComp) {
    const wings = groupsOf(data).flat().filter(c => c.kind !== 'civic').map(c => {
      const list = byComp[c.id] || [], n = need(c, list), bw = Math.max(2, Math.round(Math.sqrt(n * 1.2)));
      return { comp: c, list, w: widen(bw), h: Math.max(2, Math.ceil(n / bw)) };
    });
    const N = wings.length || 1, ext = Math.max(2, ...wings.map(w => Math.max(w.w, w.h)));
    let R = 3 + Math.ceil(ext / 2);                         // ring radius: wings hug the green's edge
    while (N > 1 && 2 * R * Math.sin(Math.PI / N) < ext + 2) R++;   // splay wings so they never collide
    const c = R + Math.ceil(ext / 2) + 3;                   // center; map spans the far wing + a tree margin
    state.W = state.H = 2 * c + 1;
    state.cityHall = { x: c + .5, y: c + .5 };
    state.origin = { x: c + .5, y: c + .5 };               // shared frame anchor: relics keep stable coords
    const g = Array.from({ length: state.H }, () => new Array(state.W).fill(2));
    for (let y = 0; y < state.H; y++)
      for (let x = 0; x < state.W; x++) {
        const rr = Math.max(Math.abs(x - c), Math.abs(y - c));
        if (rr <= 1) g[y][x] = 3;                           // hall pad
        else if (rr === 2) g[y][x] = 1;                     // ring lane around the green (gets lamps)
      }
    wings.forEach((wing, k) => {
      const a = -Math.PI / 2 + 2 * Math.PI * k / N;         // first wing due north, then clockwise
      const wx = c + Math.round(R * Math.cos(a)), wy = c + Math.round(R * Math.sin(a));
      lane(g, c, c, wx, wy);                                // spoke from the green to the neighborhood
      paveRect(state, g, newBlock(state, wing.comp, wing.list),
               wx - (wing.w >> 1), wy - (wing.h >> 1), wing.w, wing.h);
    });
    state.ground = g;
    state.village = true;
  }

  // ---- form E: EvoStreets — the directory tree as a street network. Files line their dir's street
  //      in birth order; sub-dirs branch perpendicular (axis alternates by depth). Append-stable:
  //      a building's spot is a pure function of its path + birth rank, so it never moves as the
  //      repo grows — which lets the time-lapse reveal it in its final place. ----
  function streetTree(buildings) {
    const root = { dirs: new Map(), files: [] };
    for (const b of buildings) {
      const segs = b.path.split('/');
      let node = root;
      for (let i = 0; i < segs.length - 1; i++)
        node = node.dirs.get(segs[i]) || node.dirs.set(segs[i], { dirs: new Map(), files: [], seg: segs[i] }).get(segs[i]);
      node.files.push(b);
    }
    return root;
  }
  const byBirth = (a, b) => (a.birth ?? 0) - (b.birth ?? 0) || (a.path < b.path ? -1 : 1);
  function measureStreet(node) {                          // bottom-up: len (along street) + thick (across)
    node.files.sort(byBirth);
    node.bw = Math.max(1, Math.round(Math.sqrt(node.files.length)));   // file block runs bw wide
    let cursor = node.files.length ? node.bw + 2 : 1, perp = Math.ceil(node.files.length / node.bw);
    node.minBirth = node.files[0]?.birth ?? Infinity;     // earliest file → when this street first appears
    node.kids = [...node.dirs.values()].sort((a, b) => (a.files[0]?.birth ?? 0) - (b.files[0]?.birth ?? 0));
    for (const k of node.kids) {
      measureStreet(k);
      k.a0 = cursor; cursor += k.thick + 1;                // child branch consumes parent-along = child.thick
      perp = Math.max(perp, 1 + k.len);                    // and extends parent-perp = child.len
      node.minBirth = Math.min(node.minBirth, k.minBirth);
    }
    node.len = cursor; node.thick = 1 + perp;              // +1 for the street row at perp 0
  }
  // top-down: emit absolute street + lot cells, and record each dir's geometry (for the time-lapse's
  // per-street re-zoning contraction): the axis it branches along, that branch coordinate, its footprint
  // (thick) along the parent, and its subtree bounding box.
  function assignStreet(node, ox, oy, axis, paint, lot, streets, dirPath, parentAxis, branchAlong) {
    const A = (a, p) => axis === 0 ? { x: ox + a, y: oy + p } : { x: ox + p, y: oy + a };
    const box = { x0: ox, y0: oy, x1: ox, y1: oy };
    const grow = (x, y) => { if (x < box.x0) box.x0 = x; if (y < box.y0) box.y0 = y; if (x > box.x1) box.x1 = x; if (y > box.y1) box.y1 = y; };
    for (let a = 0; a < node.len; a++) { const c = A(a, 0); paint(c.x, c.y, node.minBirth); grow(c.x, c.y); }
    node.files.forEach((b, i) => { const c = A(1 + i % node.bw, 1 + Math.floor(i / node.bw)); lot(b, c.x, c.y); grow(c.x, c.y); });
    for (const k of node.kids) {
      const o = A(k.a0, 1);
      const kb = assignStreet(k, o.x, o.y, 1 - axis, paint, lot, streets,
                              dirPath ? dirPath + '/' + k.seg : k.seg, axis, (axis === 0 ? ox : oy) + k.a0);
      grow(kb.x0, kb.y0); grow(kb.x1, kb.y1);
    }
    if (streets && dirPath) streets[dirPath] = { axis: parentAxis, branchAlong, thick: node.thick, bbox: box };
    return box;
  }
  function planEvostreets(state, data, byComp) {
    const root = streetTree(data.buildings);
    measureStreet(root);
    const margin = 3;
    state.W = root.len + 2 * margin; state.H = root.thick + 2 * margin;
    const g = Array.from({ length: state.H }, () => new Array(state.W).fill(2));
    const gb = Array.from({ length: state.H }, () => new Array(state.W).fill(Infinity));  // per-tile reveal birth
    const inb = (x, y) => x >= 0 && y >= 0 && x < state.W && y < state.H;
    const cell = {}, streets = {};
    assignStreet(root, margin, margin, 0,
      (x, y, birth) => { if (inb(x, y)) { if (g[y][x] === 2) g[y][x] = 0; if (birth < gb[y][x]) gb[y][x] = birth; } },
      (b, x, y) => { cell[b.path] = { x, y }; }, streets, '', 0, margin);
    state.streets = streets;                               // dir-path -> {axis, branchAlong, thick, bbox}
    for (const comp of data.zone.components) {             // one block per component; lots in birth order
      const list = (byComp[comp.id] || []).filter(b => cell[b.path]).sort(byBirth);
      if (!list.length) continue;
      const block = newBlock(state, comp, list);
      block.ordered = true;                                // fillBlock must keep this lot↔building pairing
      for (const b of list) {
        const c = cell[b.path];
        if (inb(c.x, c.y)) { g[c.y][c.x] = 10 + block.id; gb[c.y][c.x] = b.birth ?? Infinity; }
        block.lots.push({ x: c.x + .5, y: c.y + .5 });
      }
      centroid(block);
    }
    state.ground = g;
    state.groundBirth = gb;                                // time-lapse reveals tiles as their buildings arrive
    state.cityHall = { x: margin + .5, y: margin - 1.5 };  // trailhead of the main boulevard, in parkland
    state.origin = { x: state.W / 2, y: state.H / 2 };     // shared frame anchor
  }

  const PLANS = { radial: planRadial, grid: planGrid, spine: planSpine, village: planVillage,
                  evostreets: planEvostreets };
  const PIPE = ['back', 'mid', 'front'];                   // the data-flow stack; 'under' isn't a stage
  // The FORM is a claim about structure the data must support: a measurable coupling hub (radial),
  // a balanced full-stack split (spine), or peer modules with no center (grid). Order matters —
  // size is only a legibility floor, never the shape decision. Thresholds sit in the data's gaps.
  function statsOf(data) {                                  // the metrics the formation thresholds read
    const real = data.zone.components.filter(c => c.kind !== 'civic' && c.kind !== 'auto');
    const wsum = {}, wt = {};                               // commit-weighted mean centrality per district
    for (const b of data.buildings) {                       // (commit weight damps one-off mega-commit noise)
      wsum[b.component] = (wsum[b.component] || 0) + b.centrality * b.commits;
      wt[b.component] = (wt[b.component] || 0) + b.commits;
    }
    const coup = real.map(c => wt[c.id] ? wsum[c.id] / wt[c.id] : 0);
    const mass = coup.reduce((a, b) => a + b, 0);
    const dominance = mass ? Math.max(...coup) / mass * real.length : 0;   // 1 even → n one district carries all
    const tier = {};                                        // district counts per data-flow layer
    for (const c of real) if (PIPE.includes(c.layer)) tier[c.layer] = (tier[c.layer] || 0) + 1;
    const t = Object.values(tier);
    return { n: real.length, nbuild: data.buildings.length, mass, dominance,
             balanced: t.length >= 2 && Math.min(...t) / Math.max(...t) >= 0.4 };
  }

  // The ladder of formations a repo climbs as it grows. First whose enters() holds wins (same
  // precedence + thresholds as the old choosePlan). The time-lapse walks this over history.
  const FORMATIONS = [
    { id: 'village', plan: planVillage, enters: s => s.n <= 2 || s.nbuild <= 40 },   // hamlet: green + neighborhoods
    { id: 'radial',  plan: planRadial,  enters: s => s.mass >= 5 && s.dominance >= 2.5 },  // a hub rings orbit
    { id: 'spine',   plan: planSpine,   enters: s => s.balanced && s.nbuild <= 180 },      // balanced stack → boulevard
    { id: 'grid',    plan: planGrid,    enters: () => true },                              // many peers (fallback)
  ];
  function chooseFormation(data) {
    const s = statsOf(data);
    return FORMATIONS.find(f => f.enters(s)) || FORMATIONS[FORMATIONS.length - 1];
  }
  const choosePlan = data => chooseFormation(data).plan;    // back-compat: layout() still calls choosePlan

  // What each piece of village dressing becomes as the city outgrows the hamlet (time-lapse transitions).
  const FATES = {
    windmill:   { fate: 'relic',     place: 'outskirts' },                 // travels with the farm
    cow:        { fate: 'transform', place: 'outskirts', into: 'cityfarm' },
    well:       { fate: 'transform', place: 'anchor',    into: 'fountain' },
    watertower: { fate: 'relic',     place: 'anchor' },
    tree:       { fate: 'relic',     place: 'anchor' },
    hay:        { fate: 'demolish' },
    fence:      { fate: 'demolish' },
    ufo:        { fate: 'demolish' },
  };

  function addCemetery(state, data) {                       // dead files: graveyard rows below the city
    if (!(data.dead || []).length) return;
    const y0 = state.H;
    state.graves = data.dead.map((d, i) =>
      ({ kind: 'grave', path: d.path, born: d.born, died: d.died,
         x: 2.5 + (i % 8) * 1.2, y: y0 + .7 + Math.floor(i / 8), seed: hash(d.path) }));
    const fmt = ts => ts ? new Date(ts * 1000).toLocaleDateString() : '?';
    const age = (a, b) => !a || !b ? '?'
      : (b - a) >= 31536000 ? `${((b - a) / 31536000).toFixed(1)}y` : `${Math.round((b - a) / 86400)}d`;
    state.graveTip = state.graves
      .map(g => `🪦 ${g.path} · born ${fmt(g.born)} · died ${fmt(g.died)} · ${age(g.born, g.died)}`)
      .join('\n');
    const rows = Math.ceil(state.graves.length / 8);
    state.cemetery = { y0, rows, x1: Math.min(state.W - 1, 13) };
    for (let i = 0; i <= rows; i++) state.ground.push(new Array(state.W).fill(2));
    for (let r = 0; r < rows; r++)
      for (let x = 1; x < state.cemetery.x1; x++) state.ground[y0 + r][x] = 6;
    state.props.push(...state.graves);
    state.H = y0 + rows + 1;
  }

  function sprinkle(state) {                                // greenery + lamps from the finished ground fabric
    state.ground.forEach((row, y) => row.forEach((code, x) => {
      const h = hash(`g${x},${y}`);
      if (code === 2 && h % 3 === 0) state.props.push({ kind: 'tree', x: x + .5, y: y + .5, seed: h });
      if (code === 1 && x % 6 === 3 && h % 2) state.props.push({ kind: 'lamp', x: x + .5, y: y + .6, seed: h });
    }));
  }

  // Find a clear parkland tile, ranked & filtered — reused by relic/outskirts placement so a feature
  // never lands on a road, off-map, or atop another. opts: {near, prefer:'open'|'outer', minRoom,
  // ring:{min,max} (radius from origin), avoid:[{x,y,r}]}. Returns {x,y,room,rr} or null.
  function clearPocket(state, opts = {}) {
    const grass = (x, y) => !!(state.ground[y] && state.ground[y][x] === 2);
    const o = state.origin || { x: state.W / 2, y: state.H / 2 };
    const cands = [];
    for (let y = 1; y < state.H - 1; y++)                   // includes the perimeter green belt (the outskirts)
      for (let x = 1; x < state.W - 1; x++) {
        if (!grass(x, y)) continue;
        let room = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) room += grass(x + dx, y + dy) ? 1 : 0;
        if (room < (opts.minRoom || 0)) continue;
        const rr = Math.hypot(x + .5 - o.x, y + .5 - o.y);
        if (opts.ring && (rr < opts.ring.min || rr > opts.ring.max)) continue;
        if ((opts.avoid || []).some(a => Math.hypot(x + .5 - a.x, y + .5 - a.y) <= (a.r || 3))) continue;
        cands.push({ x, y, room, rr });
      }
    if (!cands.length) return null;
    const near = opts.near;
    cands.sort((a, b) => opts.prefer === 'outer' ? b.rr - a.rr
      : near ? Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y)
      : b.room - a.room);
    return cands[0];
  }

  function villageDressing(state) {                       // pasture life: a fenced herd, a hay field, farm landmarks
    const c = state.cityHall.x - .5;
    const grass = (x, y) => !!(state.ground[y] && state.ground[y][x] === 2);
    const place = (kind, x, y, extra) => state.props.push({ kind, x, y, seed: hash(`${kind}${x}${y}`), ...extra });
    const cluster = (kind, a, spread, n) => {             // sunflower scatter: organic, evenly spread, no row
      for (let i = 0; i < n; i++) {
        const ang = i * 2.399963 + (hash(`${kind}${i}`) % 100) / 100;   // golden angle + a little jitter
        const rad = spread * Math.sqrt((i + .5) / n);
        place(kind, a.x + .5 + Math.cos(ang) * rad, a.y + .5 + Math.sin(ang) * rad);
      }
    };
    const open = [];                                      // pasture tiles ranked by elbow room (clear paddocks)
    for (let y = 2; y < state.H - 2; y++)
      for (let x = 2; x < state.W - 2; x++) {
        const r = Math.max(Math.abs(x - c), Math.abs(y - c));
        if (!grass(x, y) || r < 5 || r >= c) continue;
        let room = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) room += grass(x + dx, y + dy) ? 1 : 0;
        open.push({ x, y, room });
      }
    if (!open.length) return;
    open.sort((a, b) => b.room - a.room);
    const used = [];
    const claim = () => {                                 // openest pasture tile that's clear of prior features
      const o = open.find(o => used.every(u => Math.hypot(o.x - u.x, o.y - u.y) > 5))
             || open.find(o => !used.includes(o)) || open[0];
      used.push(o); return o;
    };
    const tower = open.slice().sort((a, b) =>             // back-edge landmark on the horizon
      Math.hypot(a.x - c, a.y - 2) - Math.hypot(b.x - c, b.y - 2))[0];
    place('watertower', tower.x + .5, tower.y + .5); used.push(tower);
    const pad = claim();                                  // a fenced paddock of grazing cattle
    cluster('cow', pad, 1.4, 5);
    place('ufo', pad.x + .5, pad.y + .5);                 // a little saucer buzzing above the herd
    for (let i = -2; i < 2; i++) for (const [x, y, dx, dy] of
      [[pad.x + i, pad.y - 2, 1, 0], [pad.x + i, pad.y + 2, 1, 0],
       [pad.x - 2, pad.y + i, 0, 1], [pad.x + 2, pad.y + i, 0, 1]])
      if (grass(x, y)) place('fence', x + .5, y + .5, { dx, dy });
    const dist = (o, t) => Math.hypot(o.x - t.x, o.y - t.y);
    const near = open.find(o => !used.includes(o) &&     // windmill: clear pasture just beyond the pen
      dist(o, pad) >= 3 && dist(o, pad) <= 5);
    const mill = near || { x: pad.x, y: pad.y - 4 };
    used.push(mill); place('windmill', mill.x + .5, mill.y + .5);
    const hay = open.find(o => !used.includes(o) &&      // haystacks: pasture just outside the pen, clear of the mill
      dist(o, pad) >= 3 && dist(o, pad) <= 4 && dist(o, mill) >= 3);
    const clear = [[tower, 1.6], [mill, 1.4], [pad, 3.4]];   // farm plots are cleared ground
    if (hay) { used.push(hay); cluster('hay', hay, .5, 3); clear.push([hay, 1.3]); }
    state.props = state.props.filter(p => p.kind !== 'tree'
      || clear.every(([f, r]) => Math.hypot(p.x - f.x - .5, p.y - f.y - .5) > r));
  }

  function layout(data) {
    const state = { zone: data.zone, blocks: [], buildings: [], props: [],
                    byPath: new Map(), items: [], clouds: [], cityHall: null };
    state.reserved = data.reserved || null;                 // relic cells the plan must route around
    const byComp = {};
    for (const b of data.buildings) (byComp[b.component] ??= []).push(b);
    (data._planFn || PLANS[data.zone.plan] || choosePlan(data))(state, data, byComp);   // _planFn pins a formation per epoch
    addCemetery(state, data);
    sprinkle(state);
    if (state.village && state.cityHall) {                  // a well anchors the green commons
      state.props.push({ kind: 'well', x: state.cityHall.x + 1.5, y: state.cityHall.y + 1.5, seed: 7 });
      villageDressing(state);
    }
    state.deps = data.deps || [];
    state.docker = data.docker || [];
    state.cuts = {                                          // repo-relative thresholds, no absolutes
      commits: q(data.buildings.map(b => b.commits), 2 / 3),
      imports: q(data.buildings.map(b => b.imports || 0), .9),
      todos: q(data.buildings.map(b => b.todos || 0), .9) };
    for (const block of state.blocks) fillBlock(state, block);
    state.sortedRot = 0;
    const k0 = dkey(0);
    state.items = [...state.buildings, ...state.props].sort((a, b) => k0(a) - k0(b));
    state.clouds = data.zone.clouds.map((c, i) => ({ name: c.name, tether: c.tether, band: 60 + (i % 2) * 52 }));
    return state;
  }

  // file-type forms: ext picks the massing; district kind still owns color + dressing
  const FORM = { md: 'house', rst: 'house', txt: 'house',
                 json: 'shed', yml: 'shed', yaml: 'shed', toml: 'shed', lock: 'shed',
                 cfg: 'shed', ini: 'shed', html: 'storefront', css: 'storefront',
                 sh: 'garage', sql: 'silo',
                 env: 'vault', pem: 'vault', key: 'vault', crt: 'vault', cert: 'vault',
                 p12: 'vault', pfx: 'vault', jks: 'vault', keystore: 'vault', gpg: 'vault', asc: 'vault' };
  const RANK = { storefront: 1, vault: 1, shed: 2, garage: 2, silo: 2, house: 3 };   // towers downtown, houses outermost
  const FCAP = { house: 1, shed: 1, garage: 1, storefront: 2, silo: 3, vault: 2 };
  const FFOOT = { house: .5, shed: .55, garage: .6, storefront: .9, silo: .6, vault: .7 };

  function fillBlock(state, block) {
    const under = block.comp.layer === 'under';
    for (const b of block.list) {                           // mass adds floors: +1 per loc decade past 100
      b.floors = under ? 1 : 1 + b.centrality + (b.commits > state.cuts.commits ? 1 : 0)
               + Math.max(0, Math.floor(Math.log10(b.loc + 1)) - 1);
      if (state.village && !under) b.floors += hash(b.path + 'v') % 4 === 0 ? 1 : 0;   // break the flat carpet
      b.floors = Math.min(b.floors, FCAP[FORM[b.ext]] ?? 14);
      if (state.village) b.lit = Math.max(0, .5 + (hash(b.path) % 40) / 100);   // dusk hamlet: windows glow warm
    }
    const cuts = { commits: q(block.list.map(b => b.commits), 2 / 3),
                   age: q(block.list.map(b => b.age_days), 1 / 3) };
    for (const b of block.list)                             // each district spotlights its own active third
      b.billboard = b.commits > cuts.commits || b.age_days < cuts.age;
    if (!block.ordered)                                    // evostreets pins lots to birth order; don't re-sort
      block.list.sort((a, b) =>                             // lots run downtown→outskirts: towers center,
        (RANK[FORM[a.ext]] ?? 0) - (RANK[FORM[b.ext]] ?? 0) // same-form runs stay contiguous → neighborhoods
        || b.floors - a.floors);
    block.list.forEach((b, i) => place(state, block, b, i));
    block.next = block.list.length;
    for (let i = block.next; i < block.lots.length; i++) {  // leftover lots get dressing
      const lot = block.lots[i];
      if (state.cityHall && Math.abs(lot.x - state.cityHall.x) < 2 &&
          Math.abs(lot.y - state.cityHall.y) < 1.8) continue;   // hall footprint stays clear
      const h = hash(block.comp.id + i);
      const kind = under ? (h % 3 ? 'car' : 'crates')
                 : h % 4 === 0 ? 'tree' : h % 4 === 1 ? 'car' : null;
      if (kind) state.props.push({ kind, ...lot, seed: h, block, lot: i });
    }
  }

  function place(state, block, b, i) {
    const under = block.comp.layer === 'under';
    const lot = block.lots[i];
    b.color = block.comp.color;
    b.arch = block.comp.kind;                               // NOT b.kind — that flags props
    b.heightScale = under ? .35 : 1;
    b.form = FORM[b.ext];
    b.foot = FFOOT[b.form]
           ?? (b.floors === 1 && !under ? .96               // minnows join into terraces
              : .55 + .38 * Math.min(1, Math.log10(b.loc + 1) / 4));
    const j = hash(b.path), m = .4 * (1 - b.foot);          // jitter within the lot's free margin,
    b.x = lot.x + m * ((j % 5) - 2) / 2;                    // so terraces (foot .96) barely move
    b.y = lot.y + m * (((j >> 2) % 5) - 2) / 2;
    b.hub = b.imports > state.cuts.imports;
    b.debt = b.todos > state.cuts.todos;
    b.lit ??= Math.max(0, 1 - b.age_days / 240);
    state.buildings.push(b);
    state.byPath.set(b.path, b);
  }

  const matches = (path, g) =>
    g.startsWith('*') ? path.endsWith(g.slice(1)) : g.includes('*') ? path.startsWith(g.split('*')[0]) : path === g;

  function addBuilding(state, path) {
    const comp = state.zone.components.find(c => c.globs.some(g => matches(path, g)));
    const block = state.blocks.find(bl => bl.comp === comp);
    if (!block || block.next >= block.lots.length) return null;
    const b = { path, component: comp.id, loc: 30, commits: 0, centrality: 0, age_days: 0,
                files: 1, floors: 1, lit: 1, billboard: true, born: performance.now(),
                ext: path.includes('.') ? path.split('.').pop().toLowerCase() : '' };
    const i = block.next++;
    const prop = state.props.find(p => p.block === block && p.lot === i);
    if (prop) prop.hidden = true;
    place(state, block, b, i);
    state.items.push(b);
    const k = dkey(state.sortedRot);
    state.items.sort((a, c) => k(a) - k(c));
    return b;
  }

  function applyEvent(state, e) {
    if (e.commit) {
      for (const b of state.buildings)
        if (b.scaffold) { b.scaffold = false; b.floors = Math.min(b.floors + 1, FCAP[b.form] ?? 14); b.flash = performance.now(); }
      return;
    }
    if (!e.path) return;
    let b = state.byPath.get(e.path);
    if (!b && ['Edit', 'Write', 'NotebookEdit'].includes(e.tool)) b = addBuilding(state, e.path);
    if (!b) return;
    b.lit = 1;
    if (['Edit', 'Write', 'NotebookEdit'].includes(e.tool)) b.scaffold = true;
  }

  function fit(cam, canvas, state, reserve = 210, bias = 55, overscan = 1) {
    cam.cx = state.W / 2; cam.cy = state.H / 2;             // rotation pivot
    cam.s = overscan * Math.min((canvas.width - 40) / ((state.W + state.H) * HW),
                                (canvas.height - reserve) / ((state.W + state.H) * HH));
    cam.ox = 0; cam.oy = 0;
    const center = proj(cam, state.W / 2, state.H / 2);
    cam.ox = canvas.width / 2 - center.sx;
    cam.oy = canvas.height / 2 + bias - center.sy;
  }

  // ---- buildings ----
  function drawRuin(ctx, cam, b) {                        // a deleted file's husk: a low, gray, roofless stub
    const f = b.foot * .5;
    const base = spin(cam, [proj(cam, b.x - f, b.y - f), proj(cam, b.x + f, b.y - f),
                            proj(cam, b.x + f, b.y + f), proj(cam, b.x - f, b.y + f)]);
    const h = FLOOR * .5 * cam.s;
    const top = base.map(p => lift(p, h));
    quad(ctx, base[3], base[2], top[2], top[3], '#352f3b');
    quad(ctx, base[2], base[1], top[1], top[2], '#433b49');
    quad(ctx, top[0], top[1], top[2], top[3], '#241f2a');   // dark caved-in roof
    b.screen = { sx: (base[1].sx + base[3].sx) / 2, top: top[2].sy - 4,
                 x0: base[3].sx, x1: base[1].sx, y0: top[2].sy, y1: base[2].sy };
  }

  function drawCollapse(ctx, cam, b, k) {                  // demolition: the body sinks into the husk, dust rises
    const f = b.foot * .5;
    const base = spin(cam, [proj(cam, b.x - f, b.y - f), proj(cam, b.x + f, b.y - f),
                            proj(cam, b.x + f, b.y + f), proj(cam, b.x - f, b.y + f)]);
    const full = Math.max(1, b.floors) * FLOOR, husk = FLOOR * .5;
    const h = (full * (1 - k) + husk * k) * cam.s;
    const top = base.map(p => lift(p, h));
    const g = mix(b.color || '#5a4a5e', '#352f3b', k);     // colour fades to ruin-grey as it falls
    quad(ctx, base[3], base[2], top[2], top[3], shade(g, .55));
    quad(ctx, base[2], base[1], top[1], top[2], shade(g, .75));
    quad(ctx, top[0], top[1], top[2], top[3], shade(g, 1.0));
    const cx = (top[1].sx + top[3].sx) / 2, cy = (top[0].sy + top[2].sy) / 2, s = cam.s;
    for (let i = 0; i < 4; i++) {                           // dust puffs
      const a = i * 1.7 + k * 3, r = (3 + 6 * k) * s;
      ctx.fillStyle = `rgba(150,140,150,${.4 * (1 - k)})`;
      ctx.fillRect(cx + Math.cos(a) * 8 * s - r / 2, cy + Math.sin(a) * 4 * s - r / 2 - h * .3, r, r);
    }
    b.screen = { sx: cx, top: cy - 4, x0: base[3].sx, x1: base[1].sx, y0: top[2].sy, y1: base[2].sy };
  }

  function drawBuilding(ctx, cam, b, t) {
    if (b.ruined) {                                        // collapse for ~700ms, then settle to a husk
      const k = b._collapseAt ? (t - b._collapseAt) / 700 : 1;
      if (b._demolishing) return k < 1 ? drawCollapse(ctx, cam, b, k) : undefined;   // moving out: no husk left
      return k < 1 ? drawCollapse(ctx, cam, b, k) : drawRuin(ctx, cam, b);
    }
    const pop = b.born ? Math.min(1, (t - b.born) / 600) : 1;
    const f = b.foot * pop / 2;
    const base = spin(cam, [proj(cam, b.x - f, b.y - f), proj(cam, b.x + f, b.y - f),
                            proj(cam, b.x + f, b.y + f), proj(cam, b.x - f, b.y + f)]);
    const h = b.floors * FLOOR * b.heightScale * pop * cam.s;
    const top = base.map(p => lift(p, h));
    quad(ctx, base[3], base[2], top[2], top[3], shade(b.color, .55));
    quad(ctx, base[2], base[1], top[1], top[2], shade(b.color, .75));
    quad(ctx, top[0], top[1], top[2], top[3], shade(b.color, 1.05));
    const form = FORMS[b.form];
    if (h > 14 * cam.s && !form && b.arch !== 'storage' && b.arch !== 'docs')
      drawWindows(ctx, cam, base, h, b, t);
    const pent = pop === 1 && !form && !ARCH[b.arch] && b.classes >= 2 && b.floors >= 2;
    if (form) form(ctx, cam, b, base, top, h, t);           // file-type massing beats district dressing
    else if (ARCH[b.arch]) ARCH[b.arch](ctx, cam, b, base, top, h, t);
    else if (pent) drawPenthouse(ctx, cam, b, h);
    else if (pop === 1) roofProps(ctx, cam, b, top, t);
    if (pop === 1 && !pent) langSign(ctx, cam, b, top);
    if (pop === 1 && b.hub && b.floors >= 2) drawAntennas(ctx, cam, b, top, t);
    if (pop === 1 && b.debt && b.floors >= 2 && !pent) drawCrane(ctx, cam, b, top, t);
    if (b.scaffold) drawScaffold(ctx, cam, base, h);
    if (b.flash && t - b.flash < 1500) drawFlash(ctx, cam, top, (t - b.flash) / 1500);
    b.screen = { sx: (base[1].sx + base[3].sx) / 2, top: top[2].sy - 4,
                 x0: base[3].sx, x1: base[1].sx, y0: top[2].sy, y1: base[2].sy };
  }

  function drawWindows(ctx, cam, base, h, b, t) {
    const seed = hash(b.path);
    const glow = Math.max(b.lit, (seed % 10 < 3 ? .35 : 0) + Math.sin(t / 900 + seed) * .04);
    const tint = b.arch === 'frontend' ? '126,222,255' : '255,214,120';   // glass vs warm
    for (let k = 0; k < b.floors; k++) {
      const y = -((k + .55) / b.floors) * h;
      for (const [a, c, off] of [[base[3], base[2], 0], [base[2], base[1], b.floors]]) {
        const lit = glow > 0 && (seed >> (k + off)) % 3 !== 0;
        ctx.fillStyle = lit ? `rgba(${tint},${Math.min(1, .25 + glow)})` : 'rgba(20,12,24,.55)';
        for (const u of [.3, .65]) {
          const x = a.sx + (c.sx - a.sx) * u, yy = a.sy + (c.sy - a.sy) * u + y;
          ctx.fillRect(x - 2 * cam.s, yy, 4 * cam.s, 5 * cam.s);
        }
      }
    }
  }

  // ---- kind-specific dressing, drawn over the base box; replaces roofProps ----
  const ARCH = {
    storage(ctx, cam, b, base, top, h) {                    // domed tank with seams
      const cx = (top[1].sx + top[3].sx) / 2, cy = (top[0].sy + top[2].sy) / 2;
      const rx = (top[1].sx - top[3].sx) / 2;
      ctx.fillStyle = shade(b.color, 1.25);
      ctx.beginPath(); ctx.ellipse(cx, cy, rx * .8, rx * .42, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shade(b.color, .45);
      ctx.lineWidth = Math.max(1, 1.2 * cam.s);
      for (const k of [.35, .7]) {
        ctx.beginPath();
        ctx.moveTo(base[3].sx, base[3].sy - h * k);
        ctx.lineTo(base[2].sx, base[2].sy - h * k);
        ctx.lineTo(base[1].sx, base[1].sy - h * k);
        ctx.stroke();
      }
    },
    api(ctx, cam, b, base, top, h, t) {                     // gateway arches + lamp
      const s = cam.s;
      for (const [a, c] of [[base[3], base[2]], [base[2], base[1]]]) {
        const mx = (a.sx + c.sx) / 2, my = (a.sy + c.sy) / 2;
        const w = Math.abs(c.sx - a.sx) * .2, ah = Math.min(h * .45, 12 * s);
        ctx.fillStyle = '#140c18';
        ctx.fillRect(mx - w, my - ah, 2 * w, ah);
        ctx.beginPath(); ctx.ellipse(mx, my - ah, w, ah * .6, 0, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,214,120,${.5 + .2 * Math.sin(t / 700 + mx)})`;
        ctx.fillRect(mx - s, my - ah * 1.9, 2 * s, 2 * s);
      }
    },
    frontend(ctx, cam, b, base, top, h, t) {                // rooftop billboard
      const s = cam.s, seed = hash(b.path);
      if (!b.billboard) return;                             // active buildings advertise (repo-relative)
      const cx = (top[1].sx + top[3].sx) / 2, cy = (top[0].sy + top[2].sy) / 2;
      ctx.fillStyle = '#1a0a16';
      ctx.fillRect(cx - 9 * s, cy - 13 * s, 18 * s, 9 * s);
      ctx.fillRect(cx - 6 * s, cy - 4 * s, 2 * s, 4 * s);
      ctx.fillRect(cx + 4 * s, cy - 4 * s, 2 * s, 4 * s);
      ctx.fillStyle = `rgba(82,227,212,${.55 + .35 * Math.sin(t / 600 + seed)})`;
      ctx.fillRect(cx - 7 * s, cy - 11.5 * s, 14 * s, 6 * s);
    },
    tests(ctx, cam, b, base, top, h) {                      // hazard stripe band
      const s = cam.s;
      ctx.setLineDash([3 * s, 3 * s]);
      ctx.strokeStyle = '#d4a953';
      ctx.lineWidth = Math.max(1, 2 * s);
      ctx.beginPath();
      ctx.moveTo(base[3].sx, base[3].sy - h * .5);
      ctx.lineTo(base[2].sx, base[2].sy - h * .5);
      ctx.lineTo(base[1].sx, base[1].sy - h * .5);
      ctx.stroke();
      ctx.setLineDash([]);
    },
    infra(ctx, cam, b, base, top, h, t) {                   // smokestack + puffs
      const s = cam.s, seed = hash(b.path);
      const cx = (top[1].sx + top[3].sx) / 2 + 4 * s, cy = (top[0].sy + top[2].sy) / 2;
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(cx - 2 * s, cy - 10 * s, 4 * s, 10 * s);
      ctx.fillStyle = '#c0395b';
      ctx.fillRect(cx - 2 * s, cy - 10 * s, 4 * s, 2 * s);
      for (let i = 0; i < 3; i++) {
        const k = (t / 900 + i / 3 + seed % 7) % 1, r = (2 + 3 * k) * s;
        ctx.fillStyle = `rgba(200,200,212,${.3 * (1 - k)})`;
        ctx.fillRect(cx - r / 2, cy - 10 * s - 8 * k * s - r, r, r);
      }
    },
    docs(ctx, cam, b, base, top, h) {                       // columned facade
      const s = cam.s;
      ctx.fillStyle = '#f9efe3';
      for (const [a, c] of [[base[3], base[2]], [base[2], base[1]]])
        for (const u of [.25, .55, .85]) {
          const x = a.sx + (c.sx - a.sx) * u, y = a.sy + (c.sy - a.sy) * u;
          ctx.fillRect(x - s, y - h * .85, 2 * s, h * .85);
        }
    },
  };

  // ---- ext-driven massing, drawn instead of district dressing ----
  const FORMS = {
    house(ctx, cam, b, base, top, h) {                      // hipped roof, door, one warm window
      const s = cam.s;
      const apex = lift({ sx: (top[1].sx + top[3].sx) / 2, sy: (top[0].sy + top[2].sy) / 2 },
                        Math.min(7 * s, h * .55));          // roof scales with squat under-layer bodies
      for (const [a, c, f] of [[top[3], top[2], .65], [top[2], top[1], .9]]) {
        ctx.fillStyle = shade('#a8584a', f);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(apex.sx, apex.sy);
        ctx.closePath(); ctx.fill();
      }
      const door = lerp(base[2], base[1], .5);
      ctx.fillStyle = '#140c18';
      ctx.fillRect(door.sx - 1.5 * s, door.sy - h * .45, 3 * s, h * .45);
      const win = lerp(base[3], base[2], .5);
      ctx.fillStyle = b.lit > .1 || hash(b.path) % 2 ? 'rgba(255,214,120,.85)' : 'rgba(20,12,24,.55)';
      ctx.fillRect(win.sx - 2 * s, win.sy - h * .55, 4 * s, h * .3);
    },
    shed(ctx, cam, b, base, top, h) {                       // corrugated seams
      ctx.strokeStyle = shade(b.color, .4);
      ctx.lineWidth = Math.max(1, cam.s);
      ctx.beginPath();
      for (const [a, c] of [[base[3], base[2]], [base[2], base[1]]])
        for (const u of [.25, .5, .75]) {
          const p = lerp(a, c, u);
          ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx, p.sy - h * .8);
        }
      ctx.stroke();
    },
    garage(ctx, cam, b, base, top, h) {                     // slatted roll-up door
      const p0 = lerp(base[2], base[1], .18), p1 = lerp(base[2], base[1], .82);
      quad(ctx, p0, p1, lift(p1, h * .72), lift(p0, h * .72), '#8a8f98');
      ctx.strokeStyle = '#4a3a4e';
      ctx.lineWidth = Math.max(1, cam.s);
      ctx.beginPath();
      for (const k of [.2, .4, .6]) {
        ctx.moveTo(p0.sx, p0.sy - h * k); ctx.lineTo(p1.sx, p1.sy - h * k);
      }
      ctx.stroke();
    },
    storefront(ctx, cam, b, base, top, h) {                 // glass front + awning band
      const s = cam.s;
      for (const [a, c] of [[base[3], base[2]], [base[2], base[1]]]) {
        const p0 = lerp(a, c, .1), p1 = lerp(a, c, .9);
        quad(ctx, lift(p0, s), lift(p1, s), lift(p1, h * .5), lift(p0, h * .5), 'rgba(126,222,255,.5)');
        quad(ctx, lift(p0, h * .5), lift(p1, h * .5), lift(p1, h * .62), lift(p0, h * .62), '#c0395b');
      }
    },
    silo: ARCH.storage,                                     // sql: domed tank
    vault(ctx, cam, b, base, top, h) {                      // secrets/keys: windowless, reinforced band + round door
      if (h <= 0) return;                                   // mid-reveal in time-lapse: body hasn't risen yet
      const s = cam.s;
      ctx.strokeStyle = shade(b.color, .35);                // reinforced band wrapping both visible faces
      ctx.lineWidth = Math.max(1.5, 2.5 * s);
      ctx.beginPath();
      ctx.moveTo(base[3].sx, base[3].sy - h * .62);
      ctx.lineTo(base[2].sx, base[2].sy - h * .62);
      ctx.lineTo(base[1].sx, base[1].sy - h * .62);
      ctx.stroke();
      const c = lerp(base[2], base[1], .5), cy = c.sy - h * .42;   // round vault door on the front face
      const r = Math.min(h * .3, Math.abs(base[1].sx - base[2].sx) * .17);
      ctx.fillStyle = shade(b.color, .4);
      ctx.beginPath(); ctx.ellipse(c.sx, cy, r, r * .88, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = shade(b.color, 1.2); ctx.lineWidth = Math.max(1, 1.2 * s);
      ctx.beginPath(); ctx.ellipse(c.sx, cy, r * .58, r * .5, 0, 0, Math.PI * 2); ctx.stroke();
      for (let i = 0; i < 4; i++) {                         // spoked handle
        const a = i * Math.PI / 2 + .5;
        ctx.beginPath(); ctx.moveTo(c.sx, cy);
        ctx.lineTo(c.sx + Math.cos(a) * r * .55, cy + Math.sin(a) * r * .48); ctx.stroke();
      }
    },
  };

  const LANG = { py: '#3776ab', js: '#e8c41c', jsx: '#e8c41c', ts: '#3178c6', tsx: '#3178c6',
                 md: '#c9b78a', html: '#e34c26', css: '#8e5d9f', json: '#8a8f98', yml: '#cb6c6c',
                 yaml: '#cb6c6c', sh: '#89e051', go: '#00add8', rs: '#dea584', rb: '#cc342d',
                 java: '#b5651d', sql: '#4a6b5c' };

  function langSign(ctx, cam, b, top) {                     // dominant-language rooftop sign
    const col = LANG[b.ext], seed = hash(b.path);
    if (!col || b.form || b.floors < 2 || (seed >> 3) % 2) return;   // forms own their roof
    if (['frontend', 'infra', 'storage'].includes(b.arch)) return;   // roof already busy
    const s = cam.s, x = (top[1].sx + top[3].sx) / 2 - 7 * s, y = (top[0].sy + top[2].sy) / 2;
    ctx.fillStyle = '#1a0a16';
    ctx.fillRect(x - .75 * s, y - 5 * s, 1.5 * s, 5 * s);
    ctx.fillStyle = col;
    ctx.fillRect(x - 3.5 * s, y - 11 * s, 7 * s, 6 * s);
    if (s >= .9) {
      ctx.fillStyle = '#140c18';
      ctx.font = `bold ${Math.round(5 * s)}px Silkscreen, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(b.ext.slice(0, 2).toUpperCase(), x, y - 6.5 * s);
    }
  }

  function drawPenthouse(ctx, cam, b, h) {                  // class-heavy: setback tier
    const f = b.foot * .3, hp = (8 + 3 * Math.min(3, b.classes)) * cam.s;
    const base = spin(cam, [proj(cam, b.x - f, b.y - f), proj(cam, b.x + f, b.y - f),
                            proj(cam, b.x + f, b.y + f), proj(cam, b.x - f, b.y + f)]).map(p => lift(p, h));
    const top = base.map(p => lift(p, hp));
    quad(ctx, base[3], base[2], top[2], top[3], shade(b.color, .62));
    quad(ctx, base[2], base[1], top[1], top[2], shade(b.color, .85));
    quad(ctx, top[0], top[1], top[2], top[3], shade(b.color, 1.15));
  }

  function drawAntennas(ctx, cam, b, top, t) {              // high import fan-out: comms roof
    const s = cam.s, seed = hash(b.path);
    for (const [u, i] of [[.15, 0], [.85, 1]]) {
      const x = top[3].sx + (top[1].sx - top[3].sx) * u;
      const y = top[0].sy + (top[2].sy - top[0].sy) * .5;
      const ah = (9 + (seed >> i) % 5) * s;
      ctx.strokeStyle = '#1a0a16';
      ctx.lineWidth = Math.max(1, s);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - ah); ctx.stroke();
      ctx.fillStyle = `rgba(126,222,255,${.4 + .4 * Math.sin(t / 500 + i * 2 + seed)})`;
      ctx.fillRect(x - s, y - ah - 2 * s, 2 * s, 2 * s);
    }
  }

  function drawCrane(ctx, cam, b, top, t) {                 // TODO debt: rooftop crane
    const s = cam.s, seed = hash(b.path);
    const x = top[3].sx + (top[1].sx - top[3].sx) * .3;
    const y = top[0].sy + (top[2].sy - top[0].sy) * .5;
    const mh = 16 * s, jib = 14 * s, hx = x + jib * .8 + Math.sin(t / 1600 + seed) * 3 * s;
    ctx.strokeStyle = '#c98f4a';
    ctx.lineWidth = Math.max(1, 1.3 * s);
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x, y - mh);
    ctx.moveTo(x - 4 * s, y - mh); ctx.lineTo(x + jib, y - mh);
    ctx.moveTo(hx, y - mh); ctx.lineTo(hx, y - mh + 6 * s);
    ctx.stroke();
    ctx.fillStyle = '#c0395b';
    ctx.fillRect(hx - 1.5 * s, y - mh + 6 * s, 3 * s, 3 * s);
  }

  function roofProps(ctx, cam, b, top, t) {
    const s = cam.s, seed = hash(b.path);
    const cx = (top[1].sx + top[3].sx) / 2, cy = (top[0].sy + top[2].sy) / 2;
    if (b.floors >= 6 && seed % 2) {
      ctx.strokeStyle = '#1a0a16';
      ctx.lineWidth = Math.max(1, 1.2 * s);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 13 * s); ctx.stroke();
      ctx.fillStyle = `rgba(255,90,90,${.45 + .4 * Math.sin(t / 420 + seed)})`;
      ctx.fillRect(cx - 1.5 * s, cy - 16 * s, 3 * s, 3 * s);
    } else if (b.floors >= 3 && seed % 3 === 0) {
      ctx.fillStyle = '#4a3a4e';
      ctx.fillRect(cx - 4 * s, cy - 8 * s, 8 * s, 8 * s);
      ctx.fillStyle = '#5d4a61';
      ctx.beginPath(); ctx.ellipse(cx, cy - 8 * s, 4 * s, 2 * s, 0, 0, Math.PI * 2); ctx.fill();
    } else if (b.floors >= 2 && seed % 5 === 0) {
      ctx.fillStyle = '#8a8f98';
      ctx.fillRect(cx - 3 * s, cy - 4 * s, 6 * s, 4 * s);
    }
  }

  function drawScaffold(ctx, cam, base, h) {
    ctx.strokeStyle = '#c98f4a';
    ctx.lineWidth = Math.max(1, 1.5 * cam.s);
    const up = h + 7 * cam.s;
    ctx.beginPath();
    for (const p of base) { ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx, p.sy - up); }
    const tops = base.map(p => lift(p, up));
    ctx.moveTo(tops[0].sx, tops[0].sy);
    for (const p of [...tops.slice(1), tops[0]]) ctx.lineTo(p.sx, p.sy);
    ctx.stroke();
  }

  function drawFlash(ctx, cam, top, k) {
    const cx = (top[1].sx + top[3].sx) / 2, cy = (top[0].sy + top[2].sy) / 2;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = '#ffd678';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, (12 + 36 * k) * cam.s, (6 + 18 * k) * cam.s, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function drawCityHall(ctx, cam, x, y) {
    const s = cam.s;
    const box = (r, dz) => spin(cam, [proj(cam, x - r, y - r), proj(cam, x + r, y - r),
                                      proj(cam, x + r, y + r), proj(cam, x - r, y + r)])
                           .map(p => lift(p, dz));
    const iso = (pts, tops, color) => {
      quad(ctx, pts[3], pts[2], tops[2], tops[3], shade(color, .55));
      quad(ctx, pts[2], pts[1], tops[1], tops[2], shade(color, .75));
      quad(ctx, tops[0], tops[1], tops[2], tops[3], shade(color, 1.05));
    };
    const ph = 5 * s, h = 30 * s;
    const b0 = box(1.1, ph), b1 = box(1.1, ph + h);
    iso(box(1.35, 0), box(1.35, ph), '#b08c3e');            // plinth
    iso(b0, b1, '#d4a953');                                 // body
    for (const [a, c, col] of [[b0[3], b0[2], '#ddcfb4'], [b0[2], b0[1], '#f9efe3']])
      for (let i = 0; i < 5; i++) {                         // colonnade, both faces
        const u = .1 + i * .2;
        ctx.fillStyle = col;
        ctx.fillRect(a.sx + (c.sx - a.sx) * u - 1.5 * s, a.sy + (c.sy - a.sy) * u - h * .92,
                     3 * s, h * .92);
      }
    const apex = lift(proj(cam, x, y), ph + h + 18 * s);    // hipped roof
    for (const [a, c, f] of [[b1[3], b1[2], .6], [b1[2], b1[1], .85]]) {
      ctx.fillStyle = shade('#b08c3e', f);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(apex.sx, apex.sy);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = '#5a2c4d';
    ctx.fillRect(apex.sx - .75 * s, apex.sy - 13 * s, 1.5 * s, 13 * s);
    ctx.fillStyle = '#c0395b';
    ctx.fillRect(apex.sx + .75 * s, apex.sy - 13 * s, 9 * s, 5 * s);
  }

  function drawCloud(ctx, cam, cloud, t) {
    const bob = Math.sin(t / 2400 + hash(cloud.name)) * 6 * cam.s;
    const x = cloud.sx + bob, sy = cloud.sy, s = cam.s;
    ctx.strokeStyle = 'rgba(249,239,227,.35)';
    ctx.setLineDash([3, 5]);
    ctx.beginPath(); ctx.moveTo(x, sy + 14 * s); ctx.lineTo(cloud.ax, cloud.ay); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f9efe3';
    for (const [dx, dy, w, h] of [[-30, -8, 60, 16], [-18, -18, 36, 14], [-6, 2, 42, 12]])
      ctx.fillRect(x + dx * s, sy + dy * s, w * s, h * s);
    ctx.font = `bold ${Math.max(8, 9 * s)}px Silkscreen, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(cloud.name, x, sy - 24 * s);
  }

  function draw(ctx, cam, state, t, opts = {}) {
    const R = cam.rot || 0;
    if (state.sortedRot !== R) {                            // painter's order follows the camera
      const k = dkey(R);
      state.items.sort((a, b) => k(a) - k(b));
      state.sortedRot = R;
    }
    state.hits = [];                                        // hover targets rebuilt each frame
    const flat = R ? { ...cam, rot: 0 } : cam;              // only the distant horizon stays screen-anchored
    if (!opts.embedded) {                                   // embedded = one city blooming inside the nation map
      CityScape.drawHorizon(ctx, flat, state, t);
      CityScape.drawWater(ctx, cam, state, t);
    }
    CityScape.drawGround(ctx, cam, state, t);
    if (!opts.embedded && state.deps.length) CityScape.drawStation(ctx, cam, state, t);   // freight hugs the grid
    for (const it of state.items) {
      if (it.kind) {                                        // _alpha lets a transition cross-fade dressing
        if (it.hidden) continue;
        if (it._alpha !== undefined) ctx.globalAlpha = it._alpha;
        CityScape.drawProp(ctx, cam, it, t, state);
        ctx.globalAlpha = 1;
      } else drawBuilding(ctx, cam, it, t);
    }
    if (state.cityHall) drawCityHall(ctx, cam, state.cityHall.x, state.cityHall.y);
    if (!opts.embedded && state.docker.length) CityScape.drawPort(ctx, cam, state, t);   // ships ride the rotating harbor
    if (opts.embedded) return;
    ctx.fillStyle = 'rgba(243,207,217,.6)';
    for (const block of state.blocks) {
      const p = proj(cam, block.lx, block.ly + .55);
      ctx.font = `${Math.max(7, 8 * cam.s)}px Silkscreen, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(block.comp.name.toUpperCase(), p.sx, p.sy);
    }
    for (const c of state.clouds) {
      const block = state.blocks.find(bl => bl.comp.id === c.tether);
      if (!block) continue;                                 // tether names an unbuilt district
      const a = proj(cam, block.lx, block.ly);
      c.sx = a.sx; c.ax = a.sx; c.ay = a.sy;
      c.sy = Math.min(c.band * Math.max(.8, cam.s), a.sy - 120 * cam.s);
      drawCloud(ctx, cam, c, t);
    }
  }

  function pick(state, mx, my) {
    state.mouse = { mx, my };
    let hit = null;
    for (const b of state.buildings)
      if (b.screen && mx > b.screen.x0 && mx < b.screen.x1 && my > b.screen.y0 && my < b.screen.y1)
        hit = b;
    for (const h of state.hits || [])
      if (!hit && (h.ax !== undefined ? near(h, mx, my)
                 : mx > h.x0 && mx < h.x1 && my > h.y0 && my < h.y1)) hit = h;
    return hit;
  }

  let rosterT = null, rosterShown = false, rosterWired = false;
  function roster(text, x, y) {                            // pinned, scrollable panel for long hit lists
    const el = document.getElementById('roster');
    if (!el) return;
    if (!rosterWired) {
      el.addEventListener('mouseenter', () => clearTimeout(rosterT));
      el.addEventListener('mouseleave', () => { el.style.display = 'none'; rosterShown = false; });
      rosterWired = true;
    }
    if (text) {
      clearTimeout(rosterT);
      if (el.dataset.t !== text) { el.textContent = text; el.dataset.t = text; }
      if (!rosterShown) {                                  // place once so it stays put while scrolling
        el.style.display = 'block';
        el.style.left = Math.min(x + 14, innerWidth - el.offsetWidth - 12) + 'px';
        el.style.top = Math.max(12, Math.min(y + 14, innerHeight - el.offsetHeight - 12)) + 'px';
        rosterShown = true;
      }
    } else if (rosterShown) {
      rosterT = setTimeout(() => { el.style.display = 'none'; rosterShown = false; }, 250);
    }
  }

  return { layout, fit, draw, applyEvent, pick, roster,
           proj, hash, shade, mix, near, chooseFormation, FORMATIONS, FATES, clearPocket };
})();
