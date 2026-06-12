// Isometric room + Habbo-style pixel avatars, plain canvas.
const GRID = 12, HW = 32, HH = 16, OX = 482, OY = 96, WALL = 58, DOOR_Y = 7;
const SKIN = '#f0c8a0', FLOOR_A = '#c9a878', FLOOR_B = '#bb9a6a', LINE = '#a3855a';

const iso = (x, y) => ({ sx: OX + (x - y) * HW, sy: OY + (x + y) * HH });

function diamond(ctx, sx, sy) {
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx + HW, sy + HH);
  ctx.lineTo(sx, sy + 2 * HH);
  ctx.lineTo(sx - HW, sy + HH);
  ctx.closePath();
}

function drawRoom(ctx) {
  for (let x = 0; x < GRID; x++) {
    for (let y = 0; y < GRID; y++) {
      const { sx, sy } = iso(x, y);
      diamond(ctx, sx, sy);
      ctx.fillStyle = (x + y) % 2 ? FLOOR_A : FLOOR_B;
      if (x >= 4 && x <= 7 && y >= 5 && y <= 8) ctx.fillStyle = (x + y) % 2 ? '#b54d5e' : '#a84352';
      ctx.fill();
      ctx.strokeStyle = LINE;
      ctx.stroke();
    }
  }
  const edge = (x, y) => iso(x, y);          // walls follow the iso floor edges
  wallQuad(ctx, edge(0, 0), edge(0, DOOR_Y), '#5a2c4d');
  wallQuad(ctx, edge(0, DOOR_Y), edge(0, DOOR_Y + 1), '#1a0a16');
  wallQuad(ctx, edge(0, DOOR_Y + 1), edge(0, GRID), '#5a2c4d');
  wallQuad(ctx, edge(0, 0), edge(GRID, 0), '#6b3a5c');
}

function wallQuad(ctx, a, b, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy);
  ctx.lineTo(b.sx, b.sy);
  ctx.lineTo(b.sx, b.sy - WALL);
  ctx.lineTo(a.sx, a.sy - WALL);
  ctx.closePath();
  ctx.fill();
}

function px(ctx, cx, base, dx, dy, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(cx + dx), Math.round(base + dy), w, h);
}

const FURNITURE = [
  { x: 5, y: 1, draw: deskReception }, { x: 9, y: 1, draw: deskTerminal },
  { x: 1, y: 4, draw: bookshelf }, { x: 1, y: 9, draw: workbench },
  { x: 10, y: 9, draw: phoneBooth }, { x: 11, y: 1, draw: plant }, { x: 0, y: 11, draw: plant },
];

function anchor(item) { const { sx, sy } = iso(item.x, item.y); return { cx: sx, base: sy + 26 }; }

function deskReception(ctx, cx, base) {
  px(ctx, cx, base, -30, -26, 60, 26, '#3d1832');
  px(ctx, cx, base, -30, -30, 60, 6, '#d4a953');
  px(ctx, cx, base, -4, -38, 8, 8, '#d4a953');
  px(ctx, cx, base, -2, -42, 4, 4, '#f9efe3');
}
function deskTerminal(ctx, cx, base) {
  px(ctx, cx, base, -26, -20, 52, 20, '#4a4a52');
  px(ctx, cx, base, -18, -50, 36, 28, '#2b2b30');
  px(ctx, cx, base, -14, -46, 28, 20, '#1fd06b');
  px(ctx, cx, base, -12, -42, 18, 2, '#0a5a2c');
  px(ctx, cx, base, -12, -36, 12, 2, '#0a5a2c');
}
function bookshelf(ctx, cx, base) {
  px(ctx, cx, base, -22, -62, 44, 62, '#7a4a26');
  const spines = ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad'];
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 5; i++)
      px(ctx, cx, base, -18 + i * 8, -56 + row * 19, 6, 14, spines[(i + row) % 5]);
}
function workbench(ctx, cx, base) {
  px(ctx, cx, base, -28, -22, 56, 8, '#9c6b35');
  px(ctx, cx, base, -24, -14, 6, 14, '#7a4a26');
  px(ctx, cx, base, 18, -14, 6, 14, '#7a4a26');
  px(ctx, cx, base, -16, -28, 10, 6, '#95a5a6');
  px(ctx, cx, base, 4, -30, 4, 10, '#7f8c8d');
}
function phoneBooth(ctx, cx, base) {
  px(ctx, cx, base, -18, -68, 36, 68, '#c0395b');
  px(ctx, cx, base, -13, -60, 26, 30, '#2a1024');
  px(ctx, cx, base, -13, -74, 26, 6, '#d4a953');
}
function plant(ctx, cx, base) {
  px(ctx, cx, base, -8, -10, 16, 10, '#b35630');
  px(ctx, cx, base, -12, -30, 24, 20, '#2e8b4f');
  px(ctx, cx, base, -6, -38, 12, 10, '#37a35e');
}

function drawAvatar(ctx, av, t) {
  const { sx, sy } = iso(av.x, av.y);
  const cx = sx, feet = sy + 28;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(cx, feet, 14, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = av.state === 'walking' ? Math.abs(Math.sin(t / 90)) * 4
            : av.state === 'working' ? Math.abs(Math.sin(t / 160)) * 2 : 0;
  const base = feet - bob;
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
  ctx.font = '8px Silkscreen, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a0a16';
  ctx.fillRect(cx - ctx.measureText(av.name).width / 2 - 3, base - 58, ctx.measureText(av.name).width + 6, 11);
  ctx.fillStyle = av.isAgent ? '#f3cfd9' : '#d4a953';
  ctx.fillText(av.name, cx, base - 49);
  return { cx, top: base - 60 };
}

function drawBubble(ctx, cx, top, text, age) {
  const alpha = age < 3500 ? 1 : Math.max(0, 1 - (age - 3500) / 1200);
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.font = '9px Silkscreen, monospace';
  const w = Math.min(ctx.measureText(text).width + 14, 230);
  const x = Math.max(8, Math.min(cx - w / 2, 964 - w - 8)), y = top - 24;
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
  ctx.clearRect(0, 0, 964, 560);
  drawRoom(ctx);
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
