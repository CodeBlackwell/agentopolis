// Environment for Agentopolis City: ground fabric, waterfront, horizon, street props.
const CityScape = (() => {
  const { proj, hash, near } = City;

  function tile(ctx, cam, x, y, fill) {
    const a = proj(cam, x, y), b = proj(cam, x + 1, y), c = proj(cam, x + 1, y + 1), d = proj(cam, x, y + 1);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
    ctx.closePath();
    ctx.fill();
  }

  // Cross-fade between two grounds during a formation re-form (state._groundFade), else paint plainly.
  function drawGround(ctx, cam, state, t) {
    const f = state._groundFade;
    if (f) {
      ctx.globalAlpha = 1 - f.k; paintGround(ctx, cam, f.from, t, f.dx, f.dy);   // old fabric dissolves out
      ctx.globalAlpha = f.k; paintGround(ctx, cam, state, t, 0, 0);              // new fabric fades in
      ctx.globalAlpha = 1;
    } else paintGround(ctx, cam, state, t, 0, 0);
  }

  function paintGround(ctx, cam, st, t, ox, oy) {           // st.ground at grid offset (ox,oy) for frame alignment
    for (let y = 0; y < st.H; y++) {
      for (let x = 0; x < st.W; x++) {
        const code = st.ground[y][x], alt = (x + y) % 2, gx = x + ox, gy = y + oy;
        if (code <= 1) tile(ctx, cam, gx, gy, alt ? '#241622' : '#211420');
        else if (code === 2) tile(ctx, cam, gx, gy, alt ? '#2c4a34' : '#28432f');
        else if (code === 3) tile(ctx, cam, gx, gy, alt ? '#e3d2b2' : '#d8c5a0');
        else if (code === 4) {
          tile(ctx, cam, gx, gy, alt ? '#1d5a72' : '#1a5168');
          if ((x * 7 + y * 11) % 4 === 0) {                 // canal shimmer
            const p = proj(cam, gx + .5, gy + .5);
            ctx.strokeStyle = `rgba(190,228,238,${Math.max(0, .16 + .13 * Math.sin(t / 650 + x * 1.7 + y))})`;
            ctx.lineWidth = Math.max(1, cam.s);
            ctx.beginPath(); ctx.moveTo(p.sx - 5 * cam.s, p.sy); ctx.lineTo(p.sx + 5 * cam.s, p.sy); ctx.stroke();
          }
        } else if (code === 5) {
          tile(ctx, cam, gx, gy, alt ? '#3b2c39' : '#372a35');
          const a = proj(cam, gx, gy), b = proj(cam, gx, gy + 1), c = proj(cam, gx + 1, gy), d = proj(cam, gx + 1, gy + 1);
          ctx.strokeStyle = 'rgba(212,169,83,.55)';         // chain-bridge rails
          ctx.lineWidth = Math.max(1, 1.2 * cam.s);
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
          ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
          ctx.stroke();
        } else if (code === 6) tile(ctx, cam, gx, gy, alt ? '#27392c' : '#233428');
        else tile(ctx, cam, gx, gy, st.blocks[code - 10].pave[alt]);
        if (code === 1 && x % 2) {                          // avenue lane dash
          const a = proj(cam, gx + .25, gy + .5), b = proj(cam, gx + .75, gy + .5);
          ctx.strokeStyle = 'rgba(212,169,83,.3)';
          ctx.lineWidth = Math.max(1, cam.s);
          ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
        }
      }
    }
  }

  function drawWater(ctx, cam, state, t) {
    const { W, H } = state, M = 30;
    ctx.fillStyle = '#16323c';
    for (const [x0, y0, x1, y1] of [[-M, H, W, H + M], [W, 0, W + M, H + M]]) {
      const a = proj(cam, x0, y0), b = proj(cam, x1, y0), c = proj(cam, x1, y1), d = proj(cam, x0, y1);
      ctx.beginPath();
      ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(212,169,83,.3)';                // quay edge
    ctx.lineWidth = Math.max(1, 2 * cam.s);
    const q0 = proj(cam, 0, H), q1 = proj(cam, W, H), q2 = proj(cam, W, 0);
    ctx.beginPath(); ctx.moveTo(q0.sx, q0.sy); ctx.lineTo(q1.sx, q1.sy); ctx.lineTo(q2.sx, q2.sy); ctx.stroke();
    for (let i = 0; i < 42; i++) {                          // shimmer
      const u = (i * 73 % 97) / 97, row = .8 + (i % 5) * 2.1;
      const p = i % 2 ? proj(cam, u * W, H + row) : proj(cam, W + row, u * H);
      ctx.strokeStyle = `rgba(190,228,238,${Math.max(0, .08 + .09 * Math.sin(t / 650 + i * 1.7))})`;
      ctx.lineWidth = Math.max(1, cam.s);
      ctx.beginPath(); ctx.moveTo(p.sx - 5 * cam.s, p.sy); ctx.lineTo(p.sx + 5 * cam.s, p.sy); ctx.stroke();
    }
  }

  function drawHorizon(ctx, cam, state, t) {
    for (let i = 0; i < state.W + 8; i += 2) {              // distant blocks past both back edges
      for (const [x, y] of [[i - 4, -2.5], [-2.5, i - 4]]) {
        const seed = hash(`hz${x},${y}`);
        const p = proj(cam, x + (seed % 10) / 10, y - (seed % 3));
        const w = (10 + seed % 12) * cam.s, h = (14 + seed % 50) * cam.s;
        ctx.fillStyle = 'rgba(90,44,77,.4)';
        ctx.fillRect(p.sx - w / 2, p.sy - h, w, h);
        if (seed % 4 === 0) {
          ctx.fillStyle = 'rgba(255,214,120,.35)';
          ctx.fillRect(p.sx - 1.5 * cam.s, p.sy - h * .7, 3 * cam.s, 3 * cam.s);
        }
      }
    }
  }

  const CARS = ['#c0395b', '#2980b9', '#27ae60', '#d4a953', '#8e44ad', '#e67e22'];
  const SHIRTS = ['#c0395b', '#2980b9', '#27ae60', '#d4a953', '#8e44ad', '#16a085', '#e8a8bd'];
  const AWNINGS = ['#9c3b32', '#2e8b4f', '#2980b9', '#d4a953'];

  function hit(ctx, state, r, s) {                          // register hover target; outline when under the mouse
    state.hits.push(r);
    const m = state.mouse;
    if (!m || m.mx < r.x0 || m.mx > r.x1 || m.my < r.y0 || m.my > r.y1) return;
    ctx.strokeStyle = '#ffd678';
    ctx.lineWidth = Math.max(2, 2 * s);
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }

  function drawProp(ctx, cam, p, t, state) {
    const { sx, sy } = proj(cam, p.x, p.y), s = cam.s, base = sy + 6 * s;
    if (p.kind === 'tree') {
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(sx - 1.5 * s, base - 7 * s, 3 * s, 7 * s);
      ctx.fillStyle = '#2e8b4f';
      ctx.fillRect(sx - 7 * s, base - 17 * s, 14 * s, 11 * s);
      ctx.fillStyle = '#37a35e';
      ctx.fillRect(sx - 4 * s, base - 20 * s, 8 * s, 6 * s);
    } else if (p.kind === 'car') {
      ctx.fillStyle = CARS[p.seed % CARS.length];
      ctx.fillRect(sx - 8 * s, base - 7 * s, 16 * s, 5 * s);
      ctx.fillRect(sx - 4 * s, base - 10 * s, 8 * s, 3 * s);
      ctx.fillStyle = '#9fd8e8';
      ctx.fillRect(sx - 3 * s, base - 9.5 * s, 3 * s, 2.5 * s);
      ctx.fillStyle = '#1a0a16';
      ctx.fillRect(sx - 6 * s, base - 2.5 * s, 3 * s, 2.5 * s);
      ctx.fillRect(sx + 3 * s, base - 2.5 * s, 3 * s, 2.5 * s);
    } else if (p.kind === 'lamp') {
      ctx.fillStyle = '#2b1622';
      ctx.fillRect(sx - s, base - 16 * s, 2 * s, 16 * s);
      ctx.fillStyle = `rgba(255,214,120,${.65 + .25 * Math.sin(t / 800 + p.seed)})`;
      ctx.fillRect(sx - 2 * s, base - 19 * s, 4 * s, 3.5 * s);
    } else if (p.kind === 'grave') {
      ctx.fillStyle = '#6e7178';
      if (p.seed % 3) {                                     // headstone
        ctx.fillRect(sx - 2.5 * s, base - 7 * s, 5 * s, 7 * s);
        ctx.fillRect(sx - 1.5 * s, base - 8 * s, 3 * s, s);
      } else {                                              // cross
        ctx.fillRect(sx - s, base - 9 * s, 2 * s, 9 * s);
        ctx.fillRect(sx - 3 * s, base - 7 * s, 6 * s, 2 * s);
      }
      if (state)                                            // hovering any stone lists the whole graveyard
        hit(ctx, state, { x0: sx - 4 * s, x1: sx + 4 * s, y0: base - 10 * s, y1: base + 2 * s,
                          tip: state.graveTip, scroll: true }, s);
    } else if (p.kind === 'cow') {                          // grazing cow, black-and-white
      const f = p.seed % 2 ? 1 : -1;
      ctx.fillStyle = '#2b2230';
      for (const dx of [-4, -1.5, 1.5, 4]) ctx.fillRect(sx + dx * s, base - 2.5 * s, 1.2 * s, 2.5 * s);
      ctx.fillStyle = '#efe9e2';
      ctx.fillRect(sx - 5 * s, base - 6 * s, 10 * s, 4 * s);
      ctx.fillStyle = '#2b2230';
      ctx.fillRect(sx - 3 * s, base - 5.5 * s, 2.5 * s, 2 * s);
      ctx.fillRect(sx + 1.5 * s, base - 6 * s, 2 * s, 2.5 * s);
      ctx.fillStyle = '#efe9e2';
      ctx.fillRect(sx + f * 4 * s, base - 8 * s, 3 * s, 3 * s);
      ctx.fillStyle = '#c97f8a';
      ctx.fillRect(sx + f * 5 * s, base - 6 * s, 1.5 * s, 1.5 * s);
    } else if (p.kind === 'ufo') {                          // little saucer buzzing in circles over the herd
      const a = t / 900 + p.seed;
      const o = proj(cam, p.x + Math.cos(a) * 1.6, p.y + Math.sin(a) * 1.6);   // orbit in the ground plane
      const cx = o.sx, cy = o.sy - (34 + Math.sin(t / 500 + p.seed) * 3) * s;  // float high, gentle bob
      ctx.fillStyle = `rgba(126,222,255,${.05 + .04 * Math.sin(t / 400)})`;    // faint tractor beam
      ctx.beginPath();
      ctx.moveTo(cx - 2 * s, cy + 2 * s); ctx.lineTo(cx + 2 * s, cy + 2 * s);
      ctx.lineTo(o.sx + 6 * s, o.sy); ctx.lineTo(o.sx - 6 * s, o.sy);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6e7a82';                            // hull underside
      ctx.beginPath(); ctx.ellipse(cx, cy + 1.5 * s, 9 * s, 2.4 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#aab6bd';                            // hull top
      ctx.beginPath(); ctx.ellipse(cx, cy, 9 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(126,222,255,.85)';              // glass dome
      ctx.beginPath(); ctx.ellipse(cx, cy - .5 * s, 4 * s, 3.6 * s, 0, Math.PI, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 4; i++) {                         // rim lights chase around
        const lx = cx + Math.cos(i * Math.PI / 2 + a * 2) * 7 * s;
        ctx.fillStyle = `rgba(255,${i % 2 ? 90 : 214},${i % 2 ? 90 : 120},${.45 + .45 * Math.sin(t / 200 + i)})`;
        ctx.fillRect(lx - s, cy + 1.5 * s, 2 * s, 2 * s);
      }
    } else if (p.kind === 'hay') {                          // little stack of square bales
      const bale = (bx, by) => {
        ctx.fillStyle = '#c9a23f';
        ctx.fillRect(bx - 2.5 * s, by - 3 * s, 5 * s, 3 * s);
        ctx.fillStyle = '#dcb957';                          // sunlit top
        ctx.fillRect(bx - 2.5 * s, by - 3 * s, 5 * s, s);
        ctx.strokeStyle = '#a8842f';                        // baling twine
        ctx.lineWidth = Math.max(1, .6 * s);
        ctx.beginPath();
        ctx.moveTo(bx - .9 * s, by - 3 * s); ctx.lineTo(bx - .9 * s, by);
        ctx.moveTo(bx + .9 * s, by - 3 * s); ctx.lineTo(bx + .9 * s, by);
        ctx.stroke();
      };
      bale(sx - 2.2 * s, base); bale(sx + 2.2 * s, base); bale(sx, base - 2.6 * s);
    } else if (p.kind === 'fence') {                        // post-and-rail, runs to its neighbour tile
      const b = proj(cam, p.x + p.dx, p.y + p.dy);
      ctx.strokeStyle = '#6e5a45';
      ctx.lineWidth = Math.max(1, 1.3 * s);
      for (const dz of [3.5 * s, 6.5 * s]) {
        ctx.beginPath(); ctx.moveTo(sx, base - dz); ctx.lineTo(b.sx, base - dz); ctx.stroke();
      }
      ctx.fillStyle = '#5a4a3e';
      ctx.fillRect(sx - s, base - 7 * s, 2 * s, 7 * s);
      ctx.fillRect(b.sx - s, base - 7 * s, 2 * s, 7 * s);
    } else if (p.kind === 'windmill') {                     // farm landmark: tapered tower + turning sails
      const hb = 22 * s, capY = base - hb;
      ctx.fillStyle = '#d8c5a0';
      ctx.beginPath();
      ctx.moveTo(sx - 5 * s, base); ctx.lineTo(sx + 5 * s, base);
      ctx.lineTo(sx + 3 * s, capY); ctx.lineTo(sx - 3 * s, capY); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a0a16';
      ctx.fillRect(sx - 1.5 * s, base - 7 * s, 3 * s, 7 * s);   // doorway
      ctx.fillStyle = '#8a3a2e';
      ctx.beginPath(); ctx.moveTo(sx - 4 * s, capY); ctx.lineTo(sx + 4 * s, capY); ctx.lineTo(sx, capY - 6 * s); ctx.closePath(); ctx.fill();
      const hx = sx, hy = capY + 2 * s, rot = t / 1400 + p.seed;
      ctx.strokeStyle = '#5a4a3e';
      ctx.lineWidth = Math.max(1, 1.4 * s);
      for (let i = 0; i < 4; i++) {
        const a = rot + i * Math.PI / 2, ex = hx + Math.cos(a) * 11 * s, ey = hy + Math.sin(a) * 11 * s;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.fillStyle = 'rgba(243,239,227,.8)';
        ctx.beginPath();
        ctx.moveTo(hx + Math.cos(a) * 4 * s, hy + Math.sin(a) * 4 * s);
        ctx.lineTo(ex, ey); ctx.lineTo(ex - Math.sin(a) * 3 * s, ey + Math.cos(a) * 3 * s);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#2b2230';
      ctx.beginPath(); ctx.arc(hx, hy, 1.8 * s, 0, Math.PI * 2); ctx.fill();
    } else if (p.kind === 'watertower') {                   // small-town landmark: tank on splayed legs
      const ty = base - 22 * s;
      ctx.strokeStyle = '#4a3a2e';
      ctx.lineWidth = Math.max(1, 1.2 * s);
      ctx.beginPath();
      for (const dx of [-5, -2, 2, 5]) { ctx.moveTo(sx + dx * s, base); ctx.lineTo(sx + dx * .4 * s, ty + 7 * s); }
      ctx.moveTo(sx - 5 * s, base - 9 * s); ctx.lineTo(sx + 5 * s, base - 13 * s);   // cross-brace
      ctx.stroke();
      ctx.fillStyle = '#9aa6ad';
      ctx.fillRect(sx - 5 * s, ty, 10 * s, 8 * s);
      ctx.fillStyle = '#7d8890';
      ctx.fillRect(sx - 5 * s, ty + 6 * s, 10 * s, 2 * s);
      ctx.fillStyle = '#8a3a2e';
      ctx.beginPath(); ctx.moveTo(sx - 6 * s, ty); ctx.lineTo(sx + 6 * s, ty); ctx.lineTo(sx, ty - 7 * s); ctx.closePath(); ctx.fill();
    } else if (p.kind === 'well') {                         // village well: stone curb + little roof
      ctx.fillStyle = '#4a3a2e';
      ctx.fillRect(sx - 4 * s, base - 13 * s, 1.5 * s, 9 * s);
      ctx.fillRect(sx + 2.5 * s, base - 13 * s, 1.5 * s, 9 * s);
      ctx.fillStyle = '#6e5a4a';
      ctx.fillRect(sx - 4 * s, base - 5 * s, 8 * s, 5 * s);
      ctx.fillStyle = '#1a2a30';
      ctx.fillRect(sx - 3 * s, base - 4.5 * s, 6 * s, 3 * s);
      ctx.fillStyle = '#8a3a2e';
      ctx.fillRect(sx - 6 * s, base - 15 * s, 12 * s, 3 * s);
    } else if (p.kind === 'fountain') {                    // the village well, grown into a civic fountain
      ctx.fillStyle = '#8a93a0';                           // stone basin
      ctx.fillRect(sx - 7 * s, base - 3 * s, 14 * s, 4 * s);
      ctx.fillStyle = '#6e7785';
      ctx.fillRect(sx - 7 * s, base - 1 * s, 14 * s, 2 * s);
      ctx.fillStyle = '#9aa6b3';                           // central pedestal
      ctx.fillRect(sx - 1.5 * s, base - 9 * s, 3 * s, 6 * s);
      const jet = (4 + Math.sin(t / 300 + p.seed) * 1.5) * (p.spray || 1) * s;   // taller spray = more dominant hub
      ctx.fillStyle = 'rgba(126,200,255,.8)';              // jets, gently pulsing
      ctx.fillRect(sx - s, base - 9 * s - jet, 2 * s, jet);
      for (const dx of [-3, 3]) ctx.fillRect(sx + dx * s, base - 6 * s - jet * .6, 1.5 * s, jet * .6);
      ctx.fillStyle = 'rgba(126,200,255,.5)';              // pooled water in the basin
      ctx.fillRect(sx - 6 * s, base - 2.5 * s, 12 * s, 1.5 * s);
    } else if (p.kind === 'cityfarm') {                    // the herd, grown into a city farm: silo + barn
      ctx.fillStyle = '#c9b893';                           // silo
      ctx.fillRect(sx - 11 * s, base - 13 * s, 4 * s, 13 * s);
      ctx.fillStyle = '#8a93a0';
      ctx.beginPath(); ctx.arc(sx - 9 * s, base - 13 * s, 2 * s, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#9c3b32';                           // barn body
      ctx.fillRect(sx - 7 * s, base - 10 * s, 14 * s, 10 * s);
      ctx.fillStyle = '#7d2e27';                           // shaded gable side
      ctx.fillRect(sx + 2 * s, base - 10 * s, 5 * s, 10 * s);
      ctx.fillStyle = '#d8c5a0';                           // gambrel roof
      ctx.beginPath();
      ctx.moveTo(sx - 8 * s, base - 10 * s); ctx.lineTo(sx + 8 * s, base - 10 * s);
      ctx.lineTo(sx + 4 * s, base - 16 * s); ctx.lineTo(sx - 4 * s, base - 16 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8e2d6';                           // white-trimmed door
      ctx.fillRect(sx - 2.5 * s, base - 6 * s, 5 * s, 6 * s);
      ctx.strokeStyle = '#9c3b32'; ctx.lineWidth = Math.max(1, .6 * s);
      ctx.beginPath(); ctx.moveTo(sx, base - 6 * s); ctx.lineTo(sx, base);
      ctx.moveTo(sx - 2.5 * s, base - 3 * s); ctx.lineTo(sx + 2.5 * s, base - 3 * s); ctx.stroke();
    } else if (p.kind === 'crates') {
      ctx.fillStyle = '#9c6b35';
      ctx.fillRect(sx - 6 * s, base - 6 * s, 6 * s, 6 * s);
      ctx.fillStyle = '#b5651d';
      ctx.fillRect(sx + 1 * s, base - 5 * s, 5 * s, 5 * s);
      ctx.fillRect(sx - 4 * s, base - 11 * s, 5 * s, 5 * s);
    } else if (p.kind === 'walker') {                       // a pedestrian wandering a small patch, at its own pace
      const a = t / (1400 + p.seed % 1300) + p.seed, w = proj(cam, p.x + Math.cos(a) * .3, p.y + Math.sin(a * 1.3) * .3);
      const wx = w.sx, wb = w.sy + 6 * s, bob = Math.abs(Math.sin(t / (150 + p.seed % 110) + p.seed)) * 1.2 * s;
      ctx.fillStyle = SHIRTS[p.seed % SHIRTS.length];        // torso
      ctx.fillRect(wx - 1.4 * s, wb - 5 * s - bob, 2.8 * s, 3.2 * s);
      ctx.fillStyle = '#1a0a16';                            // legs
      ctx.fillRect(wx - 1.4 * s, wb - 2 * s - bob, 1.1 * s, 2 * s);
      ctx.fillRect(wx + .3 * s, wb - 2 * s - bob, 1.1 * s, 2 * s);
      ctx.fillStyle = '#e8b88a';                            // head
      ctx.fillRect(wx - s, wb - 7.2 * s - bob, 2 * s, 2.2 * s);
    } else if (p.kind === 'traffic') {                      // a car driving its route (1-3 turns), then fading out
      const path = p.path || [{ x: p.x, y: p.y }];
      const u = (t / (2400 + p.seed % 2800) + p.seed / 7) % 1;
      const f = u * (path.length - 1), i = Math.min(path.length - 2, Math.floor(f)), frac = f - i;
      const a = path[i], b = path[i + 1] || a;
      const gx = a.x + (b.x - a.x) * frac, gy = a.y + (b.y - a.y) * frac;
      const tg = state && state.ground[Math.floor(gy)] && state.ground[Math.floor(gy)][Math.floor(gx)];
      if (tg > 1 || tg === undefined) return;               // road not paved here yet (movie opening) → no car on grass
      const c = proj(cam, gx, gy), csx = c.sx, cb = c.sy + 6 * s, ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * Math.min(1, Math.min(u, 1 - u) * 6);   // fade in at the route start, out at the end
      ctx.fillStyle = CARS[p.seed % CARS.length];
      ctx.fillRect(csx - 8 * s, cb - 7 * s, 16 * s, 5 * s);
      ctx.fillRect(csx - 4 * s, cb - 10 * s, 8 * s, 3 * s);
      ctx.fillStyle = '#9fd8e8';
      ctx.fillRect(csx - 3 * s, cb - 9.5 * s, 3 * s, 2.5 * s);
      ctx.fillStyle = '#1a0a16';
      ctx.fillRect(csx - 6 * s, cb - 2.5 * s, 3 * s, 2.5 * s);
      ctx.fillRect(csx + 3 * s, cb - 2.5 * s, 3 * s, 2.5 * s);
      ctx.globalAlpha = ga;
    } else if (p.kind === 'stall') {                        // market stall: posts, striped awning, goods
      const sway = Math.sin(t / (480 + p.seed % 360) + p.seed) * .6 * s;
      ctx.fillStyle = '#7a4a26';
      ctx.fillRect(sx - 6 * s, base - 8 * s, 1.2 * s, 8 * s);
      ctx.fillRect(sx + 5 * s, base - 8 * s, 1.2 * s, 8 * s);
      ctx.fillStyle = AWNINGS[p.seed % AWNINGS.length];
      ctx.beginPath();
      ctx.moveTo(sx - 7 * s, base - 8 * s); ctx.lineTo(sx + 7 * s, base - 8 * s);
      ctx.lineTo(sx + 6 * s, base - 10 * s + sway); ctx.lineTo(sx - 6 * s, base - 10 * s - sway);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9a23f';                            // goods on the counter
      ctx.fillRect(sx - 5 * s, base - 4 * s, 10 * s, 2 * s);
      ctx.fillStyle = '#3d1832';
      ctx.fillRect(sx - 5 * s, base - 2 * s, 10 * s, 2 * s);
    } else if (p.kind === 'boat') {                         // a canal boat drifting one way, gently bobbing
      const way = p.seed % 2 ? 1 : -1, u = (t / (4500 + p.seed % 4000) + p.seed / 5) % 1, tt = (u - .5) * way;
      const o = proj(cam, p.x + (p.dx || 0) * tt * (p.len || 4), p.y + (p.dy || 0) * tt * (p.len || 4));
      const osx = o.sx, ob = o.sy + 3 * s + Math.sin(t / (600 + p.seed % 400) + p.seed) * 1.2 * s, ga = ctx.globalAlpha;
      ctx.globalAlpha = ga * Math.min(1, Math.min(u, 1 - u) * 6);   // fade in/out at the ends
      ctx.fillStyle = 'rgba(126,200,255,.5)';               // wake
      ctx.fillRect(osx - 8 * s, ob + 1 * s, 16 * s, 1.2 * s);
      ctx.fillStyle = '#5a3a26';                            // hull
      ctx.beginPath();
      ctx.moveTo(osx - 7 * s, ob - 2 * s); ctx.lineTo(osx + 7 * s, ob - 2 * s);
      ctx.lineTo(osx + 4 * s, ob + 1.5 * s); ctx.lineTo(osx - 4 * s, ob + 1.5 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c9b893';                            // cabin
      ctx.fillRect(osx - 3 * s, ob - 5 * s, 6 * s, 3 * s);
      ctx.globalAlpha = ga;
    } else if (p.kind === 'crosswalk') {                    // flat zebra decal across an intersection tile
      ctx.strokeStyle = 'rgba(233,228,214,.45)';
      ctx.lineWidth = Math.max(1.5, 2.4 * s);
      for (let i = 0; i < 4; i++) {
        const f = -.32 + i * .21;
        const a = p.dir ? proj(cam, p.x - .34, p.y + f) : proj(cam, p.x + f, p.y - .34);
        const b = p.dir ? proj(cam, p.x + .34, p.y + f) : proj(cam, p.x + f, p.y + .34);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
    } else if (p.kind === 'steam') {                        // a street vent venting puffs
      ctx.fillStyle = '#2b2230';
      ctx.fillRect(sx - 3 * s, base - 1.5 * s, 6 * s, 2 * s);
      for (let i = 0; i < 3; i++) {
        const k = (t / (1300 + p.seed % 800) + i / 3 + p.seed) % 1, r = (2 + 4 * k) * s;
        ctx.fillStyle = `rgba(220,224,232,${.26 * (1 - k)})`;
        ctx.beginPath(); ctx.arc(sx + Math.sin(k * 6 + p.seed) * 2 * s, base - 2 * s - 13 * k * s, r, 0, Math.PI * 2); ctx.fill();
      }
    } else if (p.kind === 'crow') {                         // a bird wheeling over the graveyard, wings flapping
      const a = t / (820 + p.seed % 620) + p.seed, o = proj(cam, p.x + Math.cos(a) * 2.2, p.y + Math.sin(a) * 1.4);
      const cx = o.sx, cy = o.sy - (16 + Math.sin(t / (500 + p.seed % 280) + p.seed) * 4) * s, flap = Math.sin(t / (70 + p.seed % 50) + p.seed) * 3 * s;
      ctx.strokeStyle = '#1a0a16';
      ctx.lineWidth = Math.max(1, 1.2 * s);
      ctx.beginPath();
      ctx.moveTo(cx - 4 * s, cy + flap); ctx.lineTo(cx, cy); ctx.lineTo(cx + 4 * s, cy + flap); ctx.stroke();
    }
  }

  function drawStation(ctx, cam, state, t) {                // package deps arrive by freight train
    const s = cam.s, x = -1.8;                              // open left edge: nothing occludes it
    const bx0 = x - .35, bx1 = x + .65, by0 = .2, by1 = state.H - .2;   // gravel ballast: rails sit on ground, not sky
    const apron = [proj(cam, bx0, by0), proj(cam, .05, by0), proj(cam, .05, by1), proj(cam, bx0, by1)];
    ctx.fillStyle = '#294630';                             // grass verge: bridge the gap between the rail line and the city
    ctx.beginPath(); ctx.moveTo(apron[0].sx, apron[0].sy);
    for (let k = 1; k < 4; k++) ctx.lineTo(apron[k].sx, apron[k].sy);
    ctx.closePath(); ctx.fill();
    const bed = [proj(cam, bx0, by0), proj(cam, bx1, by0), proj(cam, bx1, by1), proj(cam, bx0, by1)];
    ctx.fillStyle = '#473a2c';                             // brown dirt
    ctx.beginPath(); ctx.moveTo(bed[0].sx, bed[0].sy);
    for (let i = 1; i < 4; i++) ctx.lineTo(bed[i].sx, bed[i].sy);
    ctx.closePath(); ctx.fill();
    for (let gy = by0 + .15; gy < by1; gy += .3) {          // scattered gray gravel rocks (deterministic)
      const r = hash('rock' + Math.round(gy * 9));
      const gx = bx0 + .1 + (r % 9) / 9 * (bx1 - bx0 - .2);
      const p = proj(cam, gx, gy);
      ctx.fillStyle = (r & 1) ? '#857f78' : '#615c55';
      ctx.fillRect(p.sx - 1.2 * s, p.sy - 1 * s, 2.4 * s, 1.8 * s);
    }
    ctx.strokeStyle = '#564a58';
    ctx.lineWidth = Math.max(1, 1.2 * s);
    for (const dx of [0, .3]) {                             // rails
      const a = proj(cam, x + dx, .5), b = proj(cam, x + dx, state.H - .5);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    const cars = state.deps.slice(0, Math.floor((state.H - 5) / 1.2));
    const span = state.H + (cars.length + 4) * 1.2;         // track + off-screen lead for the loop
    const head = (t / 700) % span;                          // engine crawls toward the depot
    const at = k => head - 2.5 - k * 1.2;                   // coupled cars trail the engine
    cars.forEach((dep, i) => {
      const y = at(i + 1);
      if (y < .5 || y > state.H - 1) return;
      const p = proj(cam, x + .15, y), seed = hash(dep);
      ctx.fillStyle = CARS[seed % CARS.length];
      ctx.fillRect(p.sx - 8 * s, p.sy - 9 * s, 16 * s, 7 * s);
      ctx.fillStyle = '#1a0a16';
      ctx.fillRect(p.sx - 6 * s, p.sy - 2.5 * s, 3 * s, 2.5 * s);
      ctx.fillRect(p.sx + 3 * s, p.sy - 2.5 * s, 3 * s, 2.5 * s);
      hit(ctx, state, { x0: p.sx - 8 * s, x1: p.sx + 8 * s, y0: p.sy - 9 * s, y1: p.sy,
                        tip: `${dep} · freight car (package dep)` }, s);
    });
    const ey = at(0);
    if (ey >= .5 && ey <= state.H - 1) {                    // locomotive
      const p = proj(cam, x + .15, ey);
      ctx.fillStyle = '#2b2230';
      ctx.fillRect(p.sx - 9 * s, p.sy - 10 * s, 18 * s, 8 * s);
      ctx.fillStyle = '#5a2c4d';
      ctx.fillRect(p.sx - 8 * s, p.sy - 14 * s, 7 * s, 4 * s);
      ctx.fillStyle = `rgba(255,214,120,${.6 + .3 * Math.sin(t / 300)})`;
      ctx.fillRect(p.sx + 7 * s, p.sy - 8 * s, 2.5 * s, 2.5 * s);
      ctx.fillStyle = '#1a0a16';
      ctx.fillRect(p.sx - 6 * s, p.sy - 2.5 * s, 3 * s, 2.5 * s);
      ctx.fillRect(p.sx + 3 * s, p.sy - 2.5 * s, 3 * s, 2.5 * s);
      for (let i = 0; i < 3; i++) {                         // smoke puffs
        const k = (t / 800 + i / 3) % 1, r = (2 + 3 * k) * s;
        ctx.fillStyle = `rgba(200,200,212,${.3 * (1 - k)})`;
        ctx.fillRect(p.sx - 5 * s - r / 2, p.sy - 14 * s - 9 * k * s - r, r, r);
      }
      hit(ctx, state, { x0: p.sx - 9 * s, x1: p.sx + 9 * s, y0: p.sy - 14 * s, y1: p.sy,
                        tip: `freight line · ${state.deps.length} package deps` }, s);
    }
    const r0 = proj(cam, x + .15, .5), r1 = proj(cam, x + .15, state.H - .5);
    const track = { ax: r0.sx, ay: r0.sy, bx: r1.sx, by: r1.sy, w: 9 * s,
                    tip: `${state.deps.length} packages: ${state.deps.join(' · ')}` };
    state.hits.push(track);                                 // after cars: a car under the mouse wins
    if (state.mouse && near(track, state.mouse.mx, state.mouse.my)) {
      ctx.strokeStyle = 'rgba(255,214,120,.8)';
      ctx.lineWidth = Math.max(2, 2 * s);
      for (const dx of [0, .3]) {
        const a = proj(cam, x + dx, .5), b = proj(cam, x + dx, state.H - .5);
        ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
      }
    }
    const d = proj(cam, x, state.H - 1.5);                  // depot at the open foreground end
    ctx.fillStyle = '#5a2c4d';
    ctx.fillRect(d.sx - 8 * s, d.sy - 14 * s, 16 * s, 14 * s);
    ctx.fillStyle = '#ffd678';
    ctx.fillRect(d.sx - 3 * s, d.sy - 10 * s, 6 * s, 5 * s);
    if (s >= .7) {
      ctx.fillStyle = 'rgba(243,207,217,.7)';
      ctx.font = `${Math.max(7, 8 * s)}px Silkscreen, monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(`${state.deps.length} PKGS`, d.sx, d.sy - 18 * s);
    }
  }

  const SVC_COL = [['postgres', '#336791'], ['psql', '#336791'], ['db', '#336791'], ['sql', '#336791'],
                   ['redis', '#c0395b'], ['cache', '#c0395b'], ['nginx', '#2e8b4f'], ['caddy', '#2e8b4f'],
                   ['mongo', '#4a6b5c'], ['rabbit', '#e67e22'], ['queue', '#e67e22'], ['kafka', '#8e44ad'],
                   ['worker', '#8e5d9f'], ['node', '#3c873a'], ['python', '#4b8bbe'], ['api', '#d4a953'],
                   ['web', '#d4a953'], ['app', '#d4a953'], ['front', '#52e3d4']];
  const svcColor = (name, seed) => {                        // recognized services get a signature colour
    const n = (name || '').toLowerCase();
    for (const [k, c] of SVC_COL) if (n.includes(k)) return c;
    return CARS[seed % CARS.length];
  };

  function drawPort(ctx, cam, state, t) {                   // harbor: one ship per docker/compose file,
    const s = cam.s, fleet = state.docker;                 // its cargo = the services / base images it runs
    const N = Math.min(5, fleet.length);
    let tx = state.W * .2;
    for (let i = 0; i < N; i++) {
      const art = fleet[i], cargo = art.items.length || 1, cols = Math.min(cargo, 5);
      const hullW = 16 + cols * 7;
      const p = proj(cam, tx, state.H + 2.4);
      tx += 5 + cols;                                       // bigger stacks get a wider berth
      const sy = p.sy + Math.sin(t / 1200 + i * 2.1) * 1.5 * s;
      ctx.fillStyle = '#2b2230';                            // hull
      ctx.fillRect(p.sx - hullW * s, sy, hullW * 2 * s, 9 * s);
      ctx.fillStyle = '#d8c5a0';                            // bridge
      ctx.fillRect(p.sx + (hullW - 8) * s, sy - 8 * s, 7 * s, 8 * s);
      const shown = Math.min(cargo, 10);                    // containers = services, two rows deep
      for (let k = 0; k < shown; k++) {
        const cx = -hullW + 3 + (k % 5) * 7, cy = -6 - Math.floor(k / 5) * 6;
        ctx.fillStyle = svcColor(art.items[k], hash(art.items[k] || `${art.path}${k}`));
        ctx.fillRect(p.sx + cx * s, sy + cy * s, 6 * s, 5 * s);
      }
      if (cargo > shown) {                                  // overflow: more services than fit on deck
        ctx.fillStyle = 'rgba(243,207,217,.85)';
        ctx.font = `${Math.max(6, 6 * s)}px Silkscreen, monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(`+${cargo - shown}`, p.sx + (hullW - 9) * s, sy - 13 * s);
      }
      ctx.fillStyle = `rgba(255,90,90,${.45 + .4 * Math.sin(t / 700 + i)})`;   // mast light
      ctx.fillRect(p.sx + (hullW - 6.5) * s, sy - 11 * s, 2 * s, 2 * s);
      const file = art.path.split('/').pop();
      if (s >= .8) {                                        // dock label once zoomed in
        ctx.fillStyle = 'rgba(243,207,217,.85)';
        ctx.font = `${Math.max(7, 7 * s)}px Silkscreen, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(file, p.sx, sy + 18 * s);
      }
      const what = art.kind === 'compose' ? `${art.items.length} service${art.items.length === 1 ? '' : 's'}`
                                          : `image${art.items.length === 1 ? '' : 's'}`;
      const list = art.items.length ? art.items.join(' · ') : '(none parsed)';
      hit(ctx, state, { x0: p.sx - hullW * s, x1: p.sx + (hullW + 2) * s, y0: sy - 13 * s, y1: sy + 9 * s,
                        tip: `${file} · ${what}: ${list}` }, s);
    }
    if (fleet.length > N) {                                 // note the ships left at sea
      const p = proj(cam, state.W * .2, state.H + 4.6);
      ctx.fillStyle = 'rgba(243,207,217,.7)';
      ctx.font = `${Math.max(7, 8 * s)}px Silkscreen, monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(`+${fleet.length - N} more docker files`, p.sx, p.sy);
    }
  }

  return { drawGround, drawWater, drawHorizon, drawProp, drawStation, drawPort };
})();
