// Isometric dispatch floor: shared iso math + Habbo-style pixel avatars.
const GRID = 12, HW = 44, HH = 22, OX = 640, OY = 100, WALL = 92, DOOR_Y = 7;
const SKIN = '#f0c8a0', AV_SCALE = 1.35;

const iso = (x, y) => ({ sx: OX + (x - y) * HW, sy: OY + (x + y) * HH });

const hallCam = { s: 1, ox: 0, oy: 0 };                     // dispatch-floor zoom, applied as a canvas transform
const HALL_ZOOM_MIN = .7, HALL_ZOOM_MAX = 2.4;

function hallZoom(k, mx = 640, my = 320) {                  // zoom toward the cursor, clamped to range
  const s = Math.max(HALL_ZOOM_MIN, Math.min(HALL_ZOOM_MAX, hallCam.s * k));
  k = s / hallCam.s;                                        // re-derive k so a clamped edge doesn't drift the focus
  hallCam.ox = mx + (hallCam.ox - mx) * k;
  hallCam.oy = my + (hallCam.oy - my) * k;
  hallCam.s = s;
}

// ---- hall tier: the dispatch floor reskins to match the map's drill level ----
const HALL_TITLE = { nation: 'national security · situation room',
                     state: 'state house · dispatch floor',
                     city: 'city hall · dispatch floor' };
let hallLevel = 'city', hallName = '';
function setHallContext(level, name) {              // called by the map engine as you drill in/out
  if (HALLS[level]) hallLevel = level;
  if (name) hallName = name;
  const el = document.getElementById('hallTitle');
  if (el) el.textContent = `${hallName} · ${HALL_TITLE[hallLevel]}`;
}
const drawHall = (ctx, level) => (HALLS[level] || HALLS.city).draw(ctx);
const furnitureFor = level => (HALLS[level] || HALLS.city).furniture;

// agents dress to match the room: civic browns, sage greens, tactical slate
const OUTFITS = {
  city:   ['#7a4a26', '#54320f', '#8a6d3b', '#a6884f', '#5e4630', '#9c6b3f', '#6e5e48', '#b08d57'],
  state:  ['#4f6e52', '#6b8e5a', '#3f5247', '#8a9a5b', '#5d7c5f', '#7e8c50', '#9fae6f', '#4a5e3a'],
  nation: ['#2b5543', '#3a4452', '#19384a', '#445e44', '#3a2b40', '#1f4a5e', '#4a6e5e', '#5e3a3a'],
};
const outfitFor = av => av.isAgent ? OUTFITS[hallLevel][av.shirt % OUTFITS[hallLevel].length] : av.color;
window.addEventListener('DOMContentLoaded', () =>   // seed from the server-stamped body dataset
  setHallContext(document.body.dataset.hallLevel || 'city', document.body.dataset.hallName || ''));

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
  const outfit = outfitFor(av);
  const suited = av.isAgent && hallLevel === 'nation';      // national security: suits + glasses
  px(ctx, cx, base, -10, -26, 20, 13, outfit);              // torso
  px(ctx, cx, base, -14, -25, 4, 10, outfit);               // arms
  px(ctx, cx, base, 10, -25, 4, 10, outfit);
  if (suited) {
    px(ctx, cx, base, -2, -26, 4, 13, '#ececf0');           // dress shirt
    px(ctx, cx, base, -1, -26, 2, 10, '#8a2a33');           // tie
  }
  px(ctx, cx, base, -14, -15, 4, 3, SKIN);                  // hands
  px(ctx, cx, base, 10, -15, 4, 3, SKIN);
  px(ctx, cx, base, -10, -40, 20, 14, SKIN);                // head
  px(ctx, cx, base, -10, -44, 20, 6, av.hair);              // hair
  px(ctx, cx, base, -10, -38, 3, 6, av.hair);
  px(ctx, cx, base, 7, -38, 3, 6, av.hair);
  px(ctx, cx, base, -5, -35, 2, 3, '#241510');              // eyes
  px(ctx, cx, base, 3, -35, 2, 3, '#241510');
  if (suited) {                                             // wire-frame glasses
    const G = '#1a1a22';
    px(ctx, cx, base, -7, -36, 6, 1, G); px(ctx, cx, base, -7, -31, 6, 1, G);  // left lens
    px(ctx, cx, base, -7, -36, 1, 6, G); px(ctx, cx, base, -2, -36, 1, 6, G);
    px(ctx, cx, base, 1, -36, 6, 1, G);  px(ctx, cx, base, 1, -31, 6, 1, G);   // right lens
    px(ctx, cx, base, 1, -36, 1, 6, G);  px(ctx, cx, base, 6, -36, 1, 6, G);
    px(ctx, cx, base, -1, -35, 2, 1, G);                                       // bridge
  }
  px(ctx, cx, base, -2, -30, 4, 2, '#b3795a');              // mouth
  ctx.restore();
  return { cx, nameY: feet - bob - 68, top: feet - bob - 80 };   // name + bubble drawn later in screen space
}

function drawBubble(ctx, cx, top, text, age, view) {     // cx/top are screen-space; view = internal px per CSS px
  const alpha = age < 3500 ? 1 : Math.max(0, 1 - (age - 3500) / 1200);
  if (alpha <= 0) return;
  ctx.globalAlpha = alpha;
  const f = 11 * view, pad = 6 * view, h = f + pad * 1.4;
  ctx.font = `${f}px Silkscreen, monospace`;
  ctx.textAlign = 'left';
  const w = Math.min(ctx.measureText(text).width + pad * 2, 320 * view);
  const x = Math.max(2, Math.min(cx - w / 2, ctx.canvas.width - w - 2)), y = top - h;
  ctx.fillStyle = '#fffdf7';
  ctx.strokeStyle = '#3d1832';
  ctx.lineWidth = 2 * view;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
  ctx.beginPath();
  ctx.moveTo(cx - 4 * view, y + h); ctx.lineTo(cx + 4 * view, y + h); ctx.lineTo(cx, y + h + 6 * view);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3d1832';
  ctx.fillText(text, x + pad, y + h - pad, w - pad * 2);
  ctx.globalAlpha = 1;
}

// Names + dialogue in screen space: the dock downscales the canvas, so size them to a constant
// on-screen px (matching the office placards) instead of the tiny world-space text.
function drawSpeech(ctx, labels, t) {
  const view = ctx.canvas.width / (ctx.canvas.clientWidth || ctx.canvas.width);
  const toX = wx => wx * hallCam.s + hallCam.ox, toY = wy => wy * hallCam.s + hallCam.oy;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${11 * view}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  for (const L of labels) {                                // name placard above each head
    const x = toX(L.cx), y = toY(L.nameY), w = ctx.measureText(L.av.name).width + 6 * view;
    ctx.fillStyle = '#1a0a16';
    ctx.fillRect(x - w / 2, y - 11 * view, w, 15 * view);
    ctx.fillStyle = L.av.isAgent ? '#f3cfd9' : '#d4a953';
    ctx.fillText(L.av.name, x, y);
  }
  for (const L of labels)                                  // bubbles last so they sit above the names
    if (L.av.bubble) drawBubble(ctx, toX(L.cx), toY(L.top), L.av.bubble.text, t - L.av.bubble.t, view);
}

function render(ctx, avatars, t) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 1280, 640);
  ctx.setTransform(hallCam.s, 0, 0, hallCam.s, hallCam.ox, hallCam.oy);
  drawHall(ctx, hallLevel);
  const items = [
    ...furnitureFor(hallLevel).map(f => ({ depth: f.x + f.y, draw: () => { const a = anchor(f); f.draw(ctx, a.cx, a.base); } })),
    ...avatars.map(av => ({ depth: av.x + av.y + .5, av })),
  ].sort((a, b) => a.depth - b.depth);
  const labels = [];
  for (const item of items) {
    if (item.av) labels.push({ av: item.av, ...drawAvatar(ctx, item.av, t) });
    else item.draw();
  }
  drawOfficeLabels(ctx);                                     // static district placards first...
  drawSpeech(ctx, labels, t);                                // ...so ephemeral agent dialogue sits on top of them
}

// Office placards drawn in screen space: the canvas is downscaled to fit the dock, so labels are
// sized in internal px to hit ~11px on screen and stay constant — legible without zooming.
function drawOfficeLabels(ctx) {
  const view = ctx.canvas.width / (ctx.canvas.clientWidth || ctx.canvas.width);   // internal px per CSS px
  const fontPx = 11 * view, pad = 5 * view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = `${fontPx}px Silkscreen, monospace`;
  ctx.textAlign = 'center';
  for (const o of (HALLS[hallLevel] || HALLS.city).offices) {
    const { sx, sy } = iso(o.x, o.y);
    const x = sx * hallCam.s + hallCam.ox, y = (sy - 78) * hallCam.s + hallCam.oy;
    const w = ctx.measureText(o.text).width + pad * 2;
    ctx.fillStyle = '#3d1832';
    ctx.fillRect(x - w / 2, y - fontPx, w, fontPx + pad);
    ctx.fillStyle = '#d4a953';
    ctx.fillText(o.text, x, y - pad * .4);
  }
}

// A forge dead-end (bad/private/missing repo, or a clone that failed) lands here instead of a frozen
// loading screen: a card that names the repo and points back to the forge. Shared by both map engines.
function showForgeError() {
  document.getElementById('tl-loading')?.remove();
  const h = document.querySelector('header h1 .m-city');
  const name = (h && h.textContent) || 'that repo';
  const el = document.createElement('div');
  el.innerHTML = `<div style="font-size:15px;margin-bottom:9px">couldn't build ${name}</div>` +
    `<div style="opacity:.78;font-size:11px;margin-bottom:18px">make sure it's a public github.com/owner/repo</div>` +
    `<a href="/" style="color:#3d1832;background:#f9efe3;padding:9px 16px;border-radius:6px;` +
    `text-decoration:none;pointer-events:auto">try another repo &rarr;</a>`;
  Object.assign(el.style, { position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', zIndex: 9, color: '#f9efe3', textAlign: 'center',
    font: "13px 'Silkscreen', monospace", letterSpacing: '.08em', textShadow: '0 2px 6px rgba(0,0,0,.85)' });
  (document.querySelector('.mapwrap') || document.body).appendChild(el);
}
