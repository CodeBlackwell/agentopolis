// Isometric dispatch floor: shared iso math + Habbo-style pixel avatars.
const GRID = 12, HW = 44, HH = 22, OX = 640, OY = 100, WALL = 92, DOOR_Y = 7;
const SKIN = '#f0c8a0', AV_SCALE = 1.35;

const iso = (x, y) => ({ sx: OX + (x - y) * HW, sy: OY + (x + y) * HH });

function diamond(ctx, sx, sy) {
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + HW, sy + HH);
  ctx.lineTo(sx, sy + 2 * HH);
  ctx.lineTo(sx - HW, sy + HH);
  ctx.closePath();
}

function px(ctx, cx, base, dx, dy, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(cx + dx), Math.round(base + dy), w, h);
}

function drawAvatar(ctx, av, t) {
  const { sx, sy } = iso(av.x, av.y);
  const cx = sx, feet = sy + 30;
  ctx.save();
  ctx.translate(cx, feet);
  ctx.scale(AV_SCALE, AV_SCALE);
  ctx.translate(-cx, -feet);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(cx, feet, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = av.state === 'walking' ? Math.abs(Math.sin(t / 90)) * 4
            : av.state === 'working' ? Math.abs(Math.sin(t / 160)) * 2 : 0;
  const base = feet - bob;
  if (av.waiting) {                                          // needs the user's attention
    ctx.fillStyle = `rgba(212,169,83,${.3 + Math.sin(t / 180) * .2})`;
    ctx.beginPath();
    ctx.ellipse(cx, base - 20, 22, 30, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  px(ctx, cx, base, -9, -4, 8, 4, '#2b1622');               // shoes
  px(ctx, cx, base, 1, -4, 8, 4, '#2b1622');
  px(ctx, cx, base, -8, -13, 7, 9, '#3a3a4a');              // legs
  px(ctx, cx, base, 1, -13, 7, 9, '#3a3a4a');
  px(ctx, cx, base, -10, -26, 20, 13, av.color);            // torso
  px(ctx, cx, base, -14, -25, 4, 10, av.color);             // arms
  px(ctx, cx, base, 10, -25, 4, 10, av.color);
  px(ctx, cx, base, -14, -15, 4, 3, SKIN);                  // hands
  px(ctx, cx, base, 10, -15, 4, 3, SKIN);
  px(ctx, cx, base, -10, -40, 20, 14, SKIN);                // head
  px(ctx, cx, base, -10, -44, 20, 6, av.hair);              // hair
  px(ctx, cx, base, -10, -38, 3, 6, av.hair);
  px(ctx, cx, base, 7, -38, 3, 6, av.hair);
  px(ctx, cx, base, -5, -35, 2, 3, '#241510');              // eyes
  px(ctx, cx, base, 3, -35, 2, 3, '#241510');
  px(ctx, cx, base, -2, -30, 4, 2, '#b3795a');              // mouth
  ctx.restore();
  ctx.font = '8px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a0a16';
  ctx.fillRect(cx - ctx.measureText(av.name).width / 2 - 3, feet - bob - 76, ctx.measureText(av.name).width + 6, 11);
  ctx.fillStyle = av.isAgent ? '#f3cfd9' : '#d4a953';
  ctx.fillText(av.name, cx, feet - bob - 67);
  return { cx, top: feet - bob - 78 };
}

function drawBubble(ctx, cx, top, text, age) {
  const alpha = age < 3500 ? 1 : Math.max(0, 1 - (age - 3500) / 1200);
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.font = '9px Silkscreen, monospace';
  const w = Math.min(ctx.measureText(text).width + 14, 230);
  const x = Math.max(8, Math.min(cx - w / 2, 1280 - w - 8)), y = top - 24;
  ctx.fillStyle = '#fffdf7';
  ctx.strokeStyle = '#3d1832';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, w, 18);
  ctx.strokeRect(x, y, w, 18);
  ctx.beginPath();
  ctx.moveTo(cx - 4, y + 18); ctx.lineTo(cx + 4, y + 18); ctx.lineTo(cx, y + 24);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3d1832';
  ctx.textAlign = 'left';
  ctx.fillText(text, x + 7, y + 13, w - 14);
  ctx.globalAlpha = 1;
}

function render(ctx, avatars, t) {
  ctx.clearRect(0, 0, 1280, 640);
  drawHall(ctx);
  const items = [
    ...FURNITURE.map(f => ({ depth: f.x + f.y, draw: () => { const a = anchor(f); f.draw(ctx, a.cx, a.base); } })),
    ...avatars.map(av => ({ depth: av.x + av.y + .5, av })),
  ].sort((a, b) => a.depth - b.depth);
  const bubbles = [];
  for (const item of items) {
    if (item.av) {
      const pos = drawAvatar(ctx, item.av, t);
      if (item.av.bubble) bubbles.push({ ...pos, ...item.av.bubble });
    } else item.draw();
  }
  for (const b of bubbles) drawBubble(ctx, b.cx, b.top, b.text, t - b.t);
}
