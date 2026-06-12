// Environment for Botapest City: ground fabric, waterfront, horizon, street props.
const CityScape = (() => {
  const { proj, hash } = City;

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
    } else if (p.kind === 'crates') {
      ctx.fillStyle = '#9c6b35';
      ctx.fillRect(sx - 6 * s, base - 6 * s, 6 * s, 6 * s);
      ctx.fillStyle = '#b5651d';
      ctx.fillRect(sx + 1 * s, base - 5 * s, 5 * s, 5 * s);
      ctx.fillRect(sx - 4 * s, base - 11 * s, 5 * s, 5 * s);
    }
  }

  return { drawGround, drawWater, drawHorizon, drawProp };
})();
