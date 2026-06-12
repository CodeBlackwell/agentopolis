// Botapest City lib — strip-packed layout from zoning + git seed, iso drawing, live growth.
// Pages talk to the `City` object; CityScape (loaded after) draws ground/water/props.
const City = (() => {
  const HW = 26, HH = 13, FLOOR = 14;
  const proj = (cam, x, y) => ({ sx: cam.ox + (x - y) * HW * cam.s, sy: cam.oy + (x + y) * HH * cam.s });
  const lift = (p, h) => ({ sx: p.sx, sy: p.sy - h });
  const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const depth = (a, b) => (a.x + a.y) - (b.x + b.y);

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

  // ---- layout: pack districts into full-width layer strips, lots back-to-front ----
  function layout(data) {
    const state = { zone: data.zone, blocks: [], buildings: [], props: [],
                    byPath: new Map(), items: [], clouds: [], cityHall: null };
    const byComp = {};
    for (const b of data.buildings) (byComp[b.component] ??= []).push(b);

    let W = Math.min(80, Math.max(24, Math.round(1.9 * Math.sqrt(data.buildings.length + 30))));
    const strips = [];
    for (const layer of data.zone.layers) {
      const comps = data.zone.components.filter(c => c.layer === layer);
      if (!comps.length) continue;
      const lists = comps.map(c => byComp[c.id] || []);
      const need = comps.map((c, i) => c.kind === 'civic' ? 12 : Math.max(1, lists[i].length));
      const total = need.reduce((a, b) => a + b, 0);
      const streets = comps.length - 1;
      const rows = Math.max(2, Math.ceil(total / (W - streets - 2)));
      const widths = need.map(n => Math.max(Math.ceil(n / rows),
        Math.min(Math.ceil(n / rows) + 1, Math.round((W - streets) * n / total))));
      strips.push({ comps, lists, rows, widths, used: widths.reduce((a, b) => a + b, 0) + streets });
    }
    W = Math.max(W, ...strips.map(s => s.used));

    let y = 0;
    for (const strip of strips) {
      let x = Math.floor((W - strip.used) / 2);
      strip.comps.forEach((comp, i) => {
        const block = { comp, list: strip.lists[i], x0: x, y0: y,
                        cols: strip.widths[i], rows: strip.rows, lots: [], next: 0,
                        pave: [mix('#57455a', comp.color, .22), mix('#4d3d50', comp.color, .22)] };
        for (let r = 0; r < block.rows; r++)
          for (let c = 0; c < block.cols; c++)
            block.lots.push({ x: x + c + .5, y: y + r + .5 });
        state.blocks.push(block);
        x += strip.widths[i] + 1;
      });
      y += strip.rows + 1;                          // avenue after each strip
    }
    state.W = W;
    state.H = y;
    buildGround(state);
    for (const block of state.blocks) fillBlock(state, block);
    state.items = [...state.buildings, ...state.props].sort(depth);
    state.clouds = data.zone.clouds.map((c, i) => ({ name: c.name, tether: c.tether, band: 60 + (i % 2) * 52 }));
    return state;
  }

  // codes: 0 street, 1 avenue, 2 green, 3 plaza, 10+i district pavement
  function buildGround(state) {
    const g = Array.from({ length: state.H }, () => new Array(state.W).fill(2));
    state.blocks.forEach((block, i) => {
      for (let r = 0; r < block.rows; r++) {
        for (let c = 0; c < block.cols; c++)
          g[block.y0 + r][block.x0 + c] = block.comp.kind === 'civic' ? 3 : 10 + i;
        if (block.x0 + block.cols < state.W) g[block.y0 + r][block.x0 + block.cols] = 0;
      }
    });
    for (const block of state.blocks)                       // avenue row under each strip
      for (let x = 0; x < state.W; x++) g[block.y0 + block.rows][x] = 1;
    g.forEach((row, y) => row.forEach((code, x) => {
      const h = hash(`g${x},${y}`);
      if (code === 2 && h % 3 === 0) state.props.push({ kind: 'tree', x: x + .5, y: y + .5, seed: h });
      if (code === 1 && x % 6 === 3 && h % 2) state.props.push({ kind: 'lamp', x: x + .5, y: y + .6, seed: h });
    }));
    state.ground = g;
  }

  function fillBlock(state, block) {
    const under = block.comp.layer === 'under';
    for (const b of block.list)
      b.floors = under ? 1 : 1 + b.centrality + (b.commits >= 12 ? 1 : 0);
    block.list.sort((a, b) => b.floors - a.floors);         // towers at the strip's back
    block.list.forEach((b, i) => place(state, block, b, i));
    block.next = block.list.length;
    if (block.comp.kind === 'civic')
      state.cityHall = { x: block.x0 + block.cols / 2, y: block.y0 + block.rows / 2 };
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
    b.x = lot.x;
    b.y = lot.y;
    b.color = block.comp.color;
    b.arch = block.comp.kind;                               // NOT b.kind — that flags props
    b.heightScale = under ? .35 : 1;
    b.foot = b.floors === 1 && !under ? .96                 // minnows join into terraces
           : .55 + .38 * Math.min(1, Math.log10(b.loc + 1) / 4);
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
                files: 1, floors: 1, lit: 1, born: performance.now(),
                ext: path.includes('.') ? path.split('.').pop().toLowerCase() : '' };
    const i = block.next++;
    const prop = state.props.find(p => p.block === block && p.lot === i);
    if (prop) prop.hidden = true;
    place(state, block, b, i);
    state.items.push(b);
    state.items.sort(depth);
    return b;
  }

  function applyEvent(state, e) {
    if (e.commit) {
      for (const b of state.buildings)
        if (b.scaffold) { b.scaffold = false; b.floors = Math.min(b.floors + 1, 14); b.flash = performance.now(); }
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
    cam.s = overscan * Math.min((canvas.width - 40) / ((state.W + state.H) * HW),
                                (canvas.height - reserve) / ((state.W + state.H) * HH));
    cam.ox = 0; cam.oy = 0;
    const center = proj(cam, state.W / 2, state.H / 2);
    cam.ox = canvas.width / 2 - center.sx;
    cam.oy = canvas.height / 2 + bias - center.sy;
  }

  // ---- buildings ----
  function drawBuilding(ctx, cam, b, t) {
    const pop = b.born ? Math.min(1, (t - b.born) / 600) : 1;
    const f = b.foot * pop / 2;
    const base = [proj(cam, b.x - f, b.y - f), proj(cam, b.x + f, b.y - f),
                  proj(cam, b.x + f, b.y + f), proj(cam, b.x - f, b.y + f)];
    const h = b.floors * FLOOR * b.heightScale * pop * cam.s;
    const top = base.map(p => lift(p, h));
    quad(ctx, base[3], base[2], top[2], top[3], shade(b.color, .55));
    quad(ctx, base[2], base[1], top[1], top[2], shade(b.color, .75));
    quad(ctx, top[0], top[1], top[2], top[3], shade(b.color, 1.05));
    if (h > 14 * cam.s && b.arch !== 'storage' && b.arch !== 'docs')
      drawWindows(ctx, cam, base, h, b, t);
    if (ARCH[b.arch]) ARCH[b.arch](ctx, cam, b, base, top, h, t);
    else if (pop === 1) roofProps(ctx, cam, b, top, t);
    if (pop === 1) langSign(ctx, cam, b, top);
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
      if (b.floors < 2 && seed % 3) return;                 // thin out flat-roof rows
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

  const LANG = { py: '#3776ab', js: '#e8c41c', jsx: '#e8c41c', ts: '#3178c6', tsx: '#3178c6',
                 md: '#c9b78a', html: '#e34c26', css: '#8e5d9f', json: '#8a8f98', yml: '#cb6c6c',
                 yaml: '#cb6c6c', sh: '#89e051', go: '#00add8', rs: '#dea584', rb: '#cc342d',
                 java: '#b5651d', sql: '#4a6b5c' };

  function langSign(ctx, cam, b, top) {                     // dominant-language rooftop sign
    const col = LANG[b.ext], seed = hash(b.path);
    if (!col || b.floors < 2 || (seed >> 3) % 2) return;
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
    const box = (r, dz) => [proj(cam, x - r, y - r), proj(cam, x + r, y - r),
                            proj(cam, x + r, y + r), proj(cam, x - r, y + r)]
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

  function draw(ctx, cam, state, t) {
    CityScape.drawHorizon(ctx, cam, state, t);
    CityScape.drawWater(ctx, cam, state, t);
    CityScape.drawGround(ctx, cam, state, t);
    for (const it of state.items) {
      if (it.kind) { if (!it.hidden) CityScape.drawProp(ctx, cam, it, t); }
      else drawBuilding(ctx, cam, it, t);
    }
    if (state.cityHall) drawCityHall(ctx, cam, state.cityHall.x, state.cityHall.y);
    ctx.fillStyle = 'rgba(243,207,217,.6)';
    for (const block of state.blocks) {
      const p = proj(cam, block.x0 + block.cols / 2, block.y0 + block.rows + .55);
      ctx.font = `${Math.max(7, 8 * cam.s)}px Silkscreen, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(block.comp.name.toUpperCase(), p.sx, p.sy);
    }
    for (const c of state.clouds) {
      const block = state.blocks.find(bl => bl.comp.id === c.tether);
      const a = proj(cam, block.x0 + block.cols / 2, block.y0 + block.rows / 2);
      c.sx = a.sx; c.ax = a.sx; c.ay = a.sy;
      c.sy = Math.min(c.band * Math.max(.8, cam.s), a.sy - 120 * cam.s);
      drawCloud(ctx, cam, c, t);
    }
  }

  function pick(state, mx, my) {
    let hit = null;
    for (const b of state.buildings)
      if (b.screen && mx > b.screen.x0 && mx < b.screen.x1 && my > b.screen.y0 && my < b.screen.y1)
        hit = b;
    return hit;
  }

  return { layout, fit, draw, applyEvent, pick, proj, hash, shade, mix };
})();
