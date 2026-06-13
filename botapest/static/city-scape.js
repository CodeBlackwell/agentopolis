// Environment for Botapest City: ground fabric, waterfront, horizon, street props.
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

  function drawGround(ctx, cam, state, t) {
    for (let y = 0; y < state.H; y++) {
      for (let x = 0; x < state.W; x++) {
        const code = state.ground[y][x], alt = (x + y) % 2;
        if (code <= 1) tile(ctx, cam, x, y, alt ? '#241622' : '#211420');
        else if (code === 2) tile(ctx, cam, x, y, alt ? '#2c4a34' : '#28432f');
        else if (code === 3) tile(ctx, cam, x, y, alt ? '#e3d2b2' : '#d8c5a0');
        else if (code === 4) {
          tile(ctx, cam, x, y, alt ? '#1d5a72' : '#1a5168');
          if ((x * 7 + y * 11) % 4 === 0) {                 // canal shimmer
            const p = proj(cam, x + .5, y + .5);
            ctx.strokeStyle = `rgba(190,228,238,${Math.max(0, .16 + .13 * Math.sin(t / 650 + x * 1.7 + y))})`;
            ctx.lineWidth = Math.max(1, cam.s);
            ctx.beginPath(); ctx.moveTo(p.sx - 5 * cam.s, p.sy); ctx.lineTo(p.sx + 5 * cam.s, p.sy); ctx.stroke();
          }
        } else if (code === 5) {
          tile(ctx, cam, x, y, alt ? '#3b2c39' : '#372a35');
          const a = proj(cam, x, y), b = proj(cam, x, y + 1), c = proj(cam, x + 1, y), d = proj(cam, x + 1, y + 1);
          ctx.strokeStyle = 'rgba(212,169,83,.55)';         // chain-bridge rails
          ctx.lineWidth = Math.max(1, 1.2 * cam.s);
          ctx.beginPath();
          ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy);
          ctx.moveTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy);
          ctx.stroke();
        } else if (code === 6) tile(ctx, cam, x, y, alt ? '#27392c' : '#233428');
        else tile(ctx, cam, x, y, state.blocks[code - 10].pave[alt]);
        if (code === 1 && x % 2) {                          // avenue lane dash
          const a = proj(cam, x + .25, y + .5), b = proj(cam, x + .75, y + .5);
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

  function hit(ctx, state, r, s) {                          // register hover target; outline when under the mouse
    state.hits.push(r);
    const m = state.mouse;
    if (!m || m.mx < r.x0 || m.mx > r.x1 || m.my < r.y0 || m.my > r.y1) return;
    ctx.strokeStyle = '#ffd678';
    ctx.lineWidth = Math.max(2, 2 * s);
    ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
  }

  function drawProp(ctx, cam, p, t) {
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
    } else if (p.kind === 'crates') {
      ctx.fillStyle = '#9c6b35';
      ctx.fillRect(sx - 6 * s, base - 6 * s, 6 * s, 6 * s);
      ctx.fillStyle = '#b5651d';
      ctx.fillRect(sx + 1 * s, base - 5 * s, 5 * s, 5 * s);
      ctx.fillRect(sx - 4 * s, base - 11 * s, 5 * s, 5 * s);
    }
  }

  function drawStation(ctx, cam, state, t) {                // package deps arrive by freight train
    const s = cam.s, x = -1.8;                              // open left edge: nothing occludes it
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

  function drawPort(ctx, cam, state, t) {                   // container ships per docker file
    const s = cam.s;
    for (let i = 0; i < Math.min(3, state.docker); i++) {
      const p = proj(cam, state.W * .25 + i * 7, state.H + 2.2);
      const sy = p.sy + Math.sin(t / 1200 + i * 2.1) * 1.5 * s;
      ctx.fillStyle = '#2b2230';
      ctx.fillRect(p.sx - 23 * s, sy, 46 * s, 9 * s);
      ctx.fillStyle = '#d8c5a0';
      ctx.fillRect(p.sx + 13 * s, sy - 8 * s, 7 * s, 8 * s);
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = CARS[(i * 4 + k) % CARS.length];
        ctx.fillRect(p.sx + (-20 + k * 8) * s, sy - 6 * s, 7 * s, 6 * s);
      }
      ctx.fillStyle = `rgba(255,90,90,${.45 + .4 * Math.sin(t / 700 + i)})`;
      ctx.fillRect(p.sx + 15.5 * s, sy - 11 * s, 2 * s, 2 * s);
      hit(ctx, state, { x0: p.sx - 23 * s, x1: p.sx + 20 * s, y0: sy - 11 * s, y1: sy + 9 * s,
                        tip: `container ship · ${state.docker} docker/compose file${state.docker > 1 ? 's' : ''}` }, s);
    }
  }

  return { drawGround, drawWater, drawHorizon, drawProp, drawStation, drawPort };
})();
