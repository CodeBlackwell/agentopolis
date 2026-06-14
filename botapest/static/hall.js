// Dispatch-floor interiors, one per map tier. HALLS[level] = { draw, furniture };
// city hall lives here; the grander state house + national situation room are in hall-tiers.js.
const MARBLE_A = '#ded2bc', MARBLE_B = '#cfc2a7', MARBLE_LINE = '#b5a585';
const OAK = '#7a4a26', OAK_DARK = '#54320f', BRASS = '#d4a953';
const STONE = '#8a7a64', STONE_LIT = '#9c8c74', WAINSCOT = '#5e4630';
const HALLS = {};
const CITY_PAL = { a: MARBLE_A, b: MARBLE_B, line: MARBLE_LINE, wall: STONE, wallLit: STONE_LIT,
                   wainscot: WAINSCOT, capA: '#6e5e48', capB: '#7e6e58', door: BRASS, doorDark: '#1a0a16' };

function wallPanel(ctx, a, b, h0, h1, color) {  // quad on a wall between floor points a,b lifted h0..h1
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a.sx, a.sy - h0);
  ctx.lineTo(b.sx, b.sy - h0);
  ctx.lineTo(b.sx, b.sy - h1);
  ctx.lineTo(a.sx, a.sy - h1);
  ctx.closePath();
  ctx.fill();
}

function floorAndWalls(ctx, pal) {                // tiled floor + three walls + wainscot + door, palette-driven
  for (let x = 0; x < GRID; x++)
    for (let y = 0; y < GRID; y++) {
      const { sx, sy } = iso(x, y);
      diamond(ctx, sx, sy);
      ctx.fillStyle = (x + y) % 2 ? pal.a : pal.b;
      ctx.fill();
      ctx.strokeStyle = pal.line;
      ctx.stroke();
    }
  wallPanel(ctx, iso(0, 0), iso(0, DOOR_Y), 0, WALL, pal.wall);
  wallPanel(ctx, iso(0, DOOR_Y + 1), iso(0, GRID), 0, WALL, pal.wall);
  wallPanel(ctx, iso(0, 0), iso(GRID, 0), 0, WALL, pal.wallLit);
  wallPanel(ctx, iso(0, 0), iso(0, DOOR_Y), 0, 20, pal.wainscot);
  wallPanel(ctx, iso(0, DOOR_Y + 1), iso(0, GRID), 0, 20, pal.wainscot);
  wallPanel(ctx, iso(0, 0), iso(GRID, 0), 0, 20, pal.wainscot);
  wallPanel(ctx, iso(0, 0), iso(0, GRID), WALL - 6, WALL, pal.capA);
  wallPanel(ctx, iso(0, 0), iso(GRID, 0), WALL - 6, WALL, pal.capB);
  wallPanel(ctx, iso(0, DOOR_Y - .15), iso(0, DOOR_Y + 1.15), 0, WALL - 12, pal.door);
  wallPanel(ctx, iso(0, DOOR_Y), iso(0, DOOR_Y + 1), 0, WALL - 16, pal.doorDark);
}

function drawCityHall(ctx) {
  floorAndWalls(ctx, CITY_PAL);
  medallion(ctx);
  for (const x of [2.2, 5.2, 8.2]) {              // tall windows on the back wall
    wallPanel(ctx, iso(x, 0), iso(x + 1.6, 0), 30, 80, BRASS);
    wallPanel(ctx, iso(x + .12, 0), iso(x + 1.48, 0), 33, 77, '#f4e4b4');
    wallPanel(ctx, iso(x + .74, 0), iso(x + .86, 0), 33, 77, BRASS);
    wallPanel(ctx, iso(x + .12, 0), iso(x + 1.48, 0), 54, 57, BRASS);
  }
  clock(ctx);
}

function medallion(ctx) {                         // rotunda inlay at the floor's center
  const { sx, sy } = iso(6, 6);
  const ring = (rx, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, rx / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  ring(120, BRASS); ring(110, MARBLE_B); ring(66, '#a84352'); ring(54, MARBLE_A);
  ctx.fillStyle = BRASS;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 22); ctx.lineTo(sx + 44, sy); ctx.lineTo(sx, sy + 22); ctx.lineTo(sx - 44, sy);
  ctx.closePath();
  ctx.fill();
}

function clock(ctx) {
  const { sx, sy } = iso(4.5, 0);
  const cy = sy - 58;
  ctx.fillStyle = BRASS;
  ctx.beginPath(); ctx.arc(sx, cy, 11, 0, 7); ctx.fill();
  ctx.fillStyle = '#f9efe3';
  ctx.beginPath(); ctx.arc(sx, cy, 8, 0, 7); ctx.fill();
  ctx.strokeStyle = '#3d1832';
  ctx.beginPath();
  ctx.moveTo(sx, cy); ctx.lineTo(sx, cy - 6);
  ctx.moveTo(sx, cy); ctx.lineTo(sx + 4, cy + 2);
  ctx.stroke();
}

// Office placards render in a screen-space overlay (render.js drawOfficeLabels) so they stay
// legible at the dock's heavy downscale — furniture only carries its desk hardware, not the text.
// The five offices share the avatar-station anchors; each tier supplies its own five names.
const OFFICE_POS = [[5, 1], [9, 1], [1, 4], [1, 9], [10, 9]];
const offices = labels => OFFICE_POS.map(([x, y], i) => ({ x, y, text: labels[i] }));

// the five departments sit at the same anchors as the avatar stations (render.js STATIONS),
// so an agent always appears to be using the furniture; columns/benches/plants are shared ambiance.
function civicFurniture(reception, ops, archive, workshop, comms) {
  return [
    { x: .45, y: 3, draw: column }, { x: .45, y: 10, draw: column },
    { x: 3, y: .45, draw: column }, { x: 6, y: .45, draw: column }, { x: 9, y: .45, draw: column },
    { x: 5, y: 1, draw: reception }, { x: 9, y: 1, draw: ops },
    { x: 1, y: 4, draw: archive }, { x: 1, y: 9, draw: workshop }, { x: 10, y: 9, draw: comms },
    { x: 3, y: 7, draw: bench }, { x: 8, y: 5, draw: bench },
    { x: 11, y: 1, draw: plant }, { x: 0, y: 11, draw: plant }, { x: 11, y: 11, draw: plant },
  ];
}

// generic department pieces other tiers reskin by colour + placard
function deskUnit(ctx, cx, base, body, top) {
  px(ctx, cx, base, -42, -32, 84, 32, top);
  for (let i = 0; i < 3; i++) px(ctx, cx, base, -36 + i * 26, -26, 20, 20, body);
  px(ctx, cx, base, -44, -38, 88, 7, BRASS);
}
function shelfUnit(ctx, cx, base, col) {
  for (let i = 0; i < 3; i++) {
    const dx = -40 + i * 28;
    px(ctx, cx, base, dx, -70, 24, 70, col);
    for (let d = 0; d < 4; d++) {
      px(ctx, cx, base, dx + 2, -66 + d * 16, 20, 12, City.shade(col, 1.14));
      px(ctx, cx, base, dx + 8, -61 + d * 16, 8, 2, BRASS);
    }
  }
}
function consoleUnit(ctx, cx, base, glow) {
  px(ctx, cx, base, -36, -28, 72, 28, '#2b2b30');
  px(ctx, cx, base, -36, -32, 72, 5, '#1c1c22');
  px(ctx, cx, base, -24, -64, 48, 34, '#15151a');
  px(ctx, cx, base, -19, -59, 38, 25, '#0a0a10');
  px(ctx, cx, base, -15, -54, 26, 2, glow);
  px(ctx, cx, base, -15, -49, 18, 2, glow);
  px(ctx, cx, base, -15, -44, 22, 2, City.shade(glow, .7));
}

const CITY_FURNITURE = civicFurniture(infoCounter, opsDesk, recordsWall, draftingTable, switchboard);
HALLS.city = { draw: drawCityHall, furniture: CITY_FURNITURE,
               offices: offices(['INFORMATION', 'OPERATIONS', 'RECORDS', 'PERMITS & WORKS', 'SWITCHBOARD']) };

function anchor(item) { const { sx, sy } = iso(item.x, item.y); return { cx: sx, base: sy + 30 }; }

function column(ctx, cx, base) {
  px(ctx, cx, base, -12, -10, 24, 10, '#b0a080');
  px(ctx, cx, base, -8, -88, 16, 78, '#c8b894');
  px(ctx, cx, base, -5, -88, 4, 78, '#dccfae');
  px(ctx, cx, base, -13, -98, 26, 10, '#b0a080');
}

function infoCounter(ctx, cx, base) {
  px(ctx, cx, base, -42, -32, 84, 32, OAK_DARK);
  for (let i = 0; i < 3; i++) px(ctx, cx, base, -36 + i * 26, -26, 20, 20, OAK);
  px(ctx, cx, base, -44, -38, 88, 7, BRASS);
  px(ctx, cx, base, -6, -46, 12, 8, BRASS);
  px(ctx, cx, base, -2, -50, 4, 4, '#f9efe3');
}

function opsDesk(ctx, cx, base) {
  px(ctx, cx, base, -36, -28, 72, 28, OAK);
  px(ctx, cx, base, -36, -32, 72, 5, OAK_DARK);
  px(ctx, cx, base, -24, -64, 48, 34, '#2b2b30');
  px(ctx, cx, base, -19, -59, 38, 25, '#0f3320');
  px(ctx, cx, base, -15, -54, 26, 2, '#1fd06b');
  px(ctx, cx, base, -15, -49, 18, 2, '#1fd06b');
  px(ctx, cx, base, -15, -44, 22, 2, '#15a050');
}

function recordsWall(ctx, cx, base) {
  for (let i = 0; i < 3; i++) {
    const dx = -40 + i * 28;
    px(ctx, cx, base, dx, -70, 24, 70, '#6e7a6e');
    for (let d = 0; d < 4; d++) {
      px(ctx, cx, base, dx + 2, -66 + d * 16, 20, 12, '#7e8a7e');
      px(ctx, cx, base, dx + 8, -61 + d * 16, 8, 2, BRASS);
    }
  }
}

function draftingTable(ctx, cx, base) {
  px(ctx, cx, base, -30, -16, 7, 16, OAK_DARK);
  px(ctx, cx, base, 23, -16, 7, 16, OAK_DARK);
  px(ctx, cx, base, -36, -48, 72, 32, '#9c6b35');
  px(ctx, cx, base, -31, -44, 62, 24, '#2e5f8a');
  px(ctx, cx, base, -26, -39, 22, 2, '#cfe2f3');
  px(ctx, cx, base, -26, -34, 16, 2, '#cfe2f3');
  px(ctx, cx, base, -26, -29, 19, 2, '#cfe2f3');
  px(ctx, cx, base, 6, -40, 20, 2, '#cfe2f3');
  px(ctx, cx, base, 6, -40, 2, 14, '#cfe2f3');
  px(ctx, cx, base, 24, -40, 2, 14, '#cfe2f3');
  px(ctx, cx, base, 6, -28, 20, 2, '#cfe2f3');
}

function switchboard(ctx, cx, base) {
  px(ctx, cx, base, -28, -78, 56, 56, '#3d2a1a');
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 6; c++)
      px(ctx, cx, base, -22 + c * 8, -72 + r * 9, 4, 4, ['#d4a953', '#c0395b', '#52e3d4'][(r + c) % 3]);
  px(ctx, cx, base, -28, -22, 56, 22, OAK);
  px(ctx, cx, base, -14, -34, 2, 12, '#1a0a16');
  px(ctx, cx, base, 0, -36, 2, 14, '#1a0a16');
  px(ctx, cx, base, 12, -32, 2, 10, '#1a0a16');
}

function bench(ctx, cx, base) {
  px(ctx, cx, base, -26, -18, 52, 6, OAK);
  px(ctx, cx, base, -26, -34, 52, 5, OAK);
  px(ctx, cx, base, -24, -29, 4, 11, OAK_DARK);
  px(ctx, cx, base, 20, -29, 4, 11, OAK_DARK);
  px(ctx, cx, base, -24, -12, 5, 12, OAK_DARK);
  px(ctx, cx, base, 19, -12, 5, 12, OAK_DARK);
}

function plant(ctx, cx, base) {
  px(ctx, cx, base, -10, -12, 20, 12, '#b35630');
  px(ctx, cx, base, -15, -36, 30, 24, '#2e8b4f');
  px(ctx, cx, base, -8, -46, 16, 12, '#37a35e');
}
