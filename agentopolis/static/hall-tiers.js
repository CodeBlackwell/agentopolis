// Grander dispatch floors for the upper map tiers — they reuse hall.js primitives
// (floorAndWalls, civicFurniture, deskUnit/shelfUnit/consoleUnit) with their own palette,
// centerpiece, and back-wall feature. Registered into HALLS so render.js can dispatch by level.
const STATE_PAL = { a: '#cdd6cf', b: '#bcc7be', line: '#9fae9f', wall: '#6f7d73', wallLit: '#7e8c80',
                    wainscot: '#3f5247', capA: '#4f5e52', capB: '#5d6c5f', door: '#c9a24a', doorDark: '#10180f' };
const NATION_PAL = { a: '#2b3340', b: '#242b36', line: '#3a4452', wall: '#222a36', wallLit: '#2b3543',
                     wainscot: '#161c26', capA: '#19202b', capB: '#202833', door: '#3a4a5e', doorDark: '#0a0e14' };

function star(ctx, cx, cy, rO, rI, col, sq = .5) {  // five-point star; sq squashes it onto an iso floor
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? rI : rO;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * sq;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

function starSeal(ctx) {                            // state seal inlaid at the rotunda center
  const { sx, sy } = iso(6, 6);
  const ring = (rx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(sx, sy, rx, rx / 2, 0, 0, 7); ctx.fill(); };
  ring(120, '#b9a36a'); ring(110, '#c2cabf'); ring(70, '#3a5e7e'); ring(58, '#cdd6cf');
  star(ctx, sx, sy, 46, 19, '#c9a24a');
}

function stateWindows(ctx) {                        // two arched windows flanking a hung state banner
  for (const x of [1.4, 8.8]) {
    wallPanel(ctx, iso(x, 0), iso(x + 1.6, 0), 30, 84, '#b9a36a');
    wallPanel(ctx, iso(x + .12, 0), iso(x + 1.48, 0), 33, 80, '#dfeaf2');
    wallPanel(ctx, iso(x + .74, 0), iso(x + .86, 0), 33, 80, '#b9a36a');
  }
  wallPanel(ctx, iso(4.6, 0), iso(6.4, 0), 22, 88, '#34547a');
  wallPanel(ctx, iso(4.8, 0), iso(6.2, 0), 26, 84, '#2a4666');
  const { sx, sy } = iso(5.5, 0);
  star(ctx, sx, sy - 52, 13, 6, '#c9a24a', 1);
}

function situationTable(ctx) {                      // glowing tactical table at the floor center
  const { sx, sy } = iso(6, 6);
  const ring = (rx, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(sx, sy, rx, rx / 2, 0, 0, 7); ctx.fill(); };
  ring(120, '#1a2029'); ring(110, '#0e141c'); ring(98, '#10303a');
  ctx.strokeStyle = 'rgba(82,227,212,.5)'; ctx.lineWidth = 1;
  for (const r of [30, 58, 86]) { ctx.beginPath(); ctx.ellipse(sx, sy, r, r / 2, 0, 0, 7); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(sx - 86, sy); ctx.lineTo(sx + 86, sy);
  ctx.moveTo(sx, sy - 43); ctx.lineTo(sx, sy + 43); ctx.stroke();
  ctx.fillStyle = '#ff5b6e';
  for (const [dx, dy] of [[-34, 6], [44, -8], [14, 15]]) { ctx.beginPath(); ctx.arc(sx + dx, sy + dy, 2.5, 0, 7); ctx.fill(); }
}

function wallScreens(ctx) {                         // three glowing situation displays on the back wall
  let i = 0;
  for (const x of [1.3, 5.0, 8.7]) {
    const glow = ['#52e3d4', '#7edeff', '#1fd06b'][i++];
    wallPanel(ctx, iso(x, 0), iso(x + 2.1, 0), 28, 86, '#0c1118');
    wallPanel(ctx, iso(x + .12, 0), iso(x + 1.98, 0), 31, 82, '#0a1a22');
    for (let r = 0; r < 4; r++) {
      const len = .5 + .9 * (((r * 7) % 5) / 5);
      wallPanel(ctx, iso(x + .3, 0), iso(x + .3 + len * 1.5, 0), 40 + r * 10, 44 + r * 10, glow);
    }
  }
}

const stGovernor = (ctx, cx, base) => deskUnit(ctx, cx, base, '#5a4a6a', '#473a55');
const stTreasury = (ctx, cx, base) => deskUnit(ctx, cx, base, '#7a6326', '#5f4d1d');
const stArchive = (ctx, cx, base) => shelfUnit(ctx, cx, base, '#6e7a8e');
const stWorks = (ctx, cx, base) => deskUnit(ctx, cx, base, '#4a6b5c', '#3a5546');
const stComms = (ctx, cx, base) => consoleUnit(ctx, cx, base, '#52e3d4');

const naCommand = (ctx, cx, base) => consoleUnit(ctx, cx, base, '#7edeff');
const naOps = (ctx, cx, base) => consoleUnit(ctx, cx, base, '#1fd06b');
const naIntel = (ctx, cx, base) => shelfUnit(ctx, cx, base, '#3c4656');
const naDefense = (ctx, cx, base) => deskUnit(ctx, cx, base, '#3a4452', '#2b333f');
const naSignals = (ctx, cx, base) => consoleUnit(ctx, cx, base, '#c0395b');

function drawStateHall(ctx) { floorAndWalls(ctx, STATE_PAL); starSeal(ctx); stateWindows(ctx); }
function drawNationHall(ctx) { floorAndWalls(ctx, NATION_PAL); situationTable(ctx); wallScreens(ctx); }

HALLS.state = { draw: drawStateHall, furniture: civicFurniture(stGovernor, stTreasury, stArchive, stWorks, stComms),
                offices: offices(['GOVERNOR', 'TREASURY', 'STATE ARCHIVE', 'PUBLIC WORKS', 'COMMS']) };
HALLS.nation = { draw: drawNationHall, furniture: civicFurniture(naCommand, naOps, naIntel, naDefense, naSignals),
                 offices: offices(['COMMAND', 'OPERATIONS', 'INTELLIGENCE', 'DEFENSE', 'SIGNALS']) };
