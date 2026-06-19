// Shared touch gestures for the canvases: 1-finger pan, 2-finger pinch-zoom,
// quick tap (drill), long-press (tooltip). Touches are translated to canvas space
// with the same ratio the mouse handlers use, so each engine reuses its own camera
// and hit-test math. Additive — the desktop mouse/wheel handlers stay untouched.
// onePan=false leaves single-finger drags to the browser (so the page can scroll over the canvas) while
// still handling two-finger pinch/twist and long-press — used by the dispatch floor on phones.
function attachTouch(canvas, { pan, pinch, twist, tap, hold, onePan = true }) {
  const TAP_MS = 300, HOLD_MS = 500, MOVE = 6, TWIST_STEP = Math.PI / 8;   // a 22.5° wrist-turn spins one 45° city step — small turns, responsive
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const angle = (a, b) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
  let last = null, holdTimer = null, moved = false, startT = 0, pinchDist = 0, lastAngle = 0, twistAcc = 0;
  const clearHold = () => { clearTimeout(holdTimer); holdTimer = null; };

  canvas.addEventListener('touchstart', e => {
    if (e.touches.length === 2 || onePan) e.preventDefault();   // 1-finger left to the browser when !onePan
    moved = false; startT = e.timeStamp; clearHold();
    if (e.touches.length === 2) { pinchDist = dist(e.touches[0], e.touches[1]);
      lastAngle = angle(e.touches[0], e.touches[1]); twistAcc = 0; last = null; return; }
    const t = e.touches[0], r = canvas.getBoundingClientRect();
    last = { x: t.clientX, y: t.clientY };
    const mx = (t.clientX - r.left) * (canvas.width / r.width), my = (t.clientY - r.top) * (canvas.height / r.height);
    holdTimer = setTimeout(() => { holdTimer = null; if (!moved) hold && hold(mx, my, t.clientX, t.clientY); }, HOLD_MS);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    if (e.touches.length === 2 || onePan) e.preventDefault();   // a 1-finger drag scrolls the page when !onePan
    const r = canvas.getBoundingClientRect(), kx = canvas.width / r.width, ky = canvas.height / r.height;
    if (e.touches.length === 2) {
      const d = dist(e.touches[0], e.touches[1]);
      if (pinchDist && pinch) pinch(d / pinchDist,
        ((e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left) * kx,
        ((e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top) * ky);
      pinchDist = d;
      if (twist) {                                  // accumulate finger rotation; snap to discrete city steps
        const a = angle(e.touches[0], e.touches[1]);
        let da = a - lastAngle; lastAngle = a;
        if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
        twistAcc += da;
        while (Math.abs(twistAcc) >= TWIST_STEP) { const dir = twistAcc > 0 ? 1 : -1; twist(dir); twistAcc -= dir * TWIST_STEP; }
      }
      moved = true; return;
    }
    const t = e.touches[0];
    if (!last) return;
    if (Math.hypot(t.clientX - last.x, t.clientY - last.y) > MOVE) { moved = true; clearHold(); }
    if (onePan && moved && pan) pan((t.clientX - last.x) * kx, (t.clientY - last.y) * ky);
    last = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    clearHold();
    if (e.touches.length === 1) {                  // one of two fingers lifted: keep panning with the other
      last = { x: e.touches[0].clientX, y: e.touches[0].clientY }; pinchDist = 0; moved = true; return;
    }
    if (!moved && e.timeStamp - startT < TAP_MS && last && tap) {
      const r = canvas.getBoundingClientRect();
      tap((last.x - r.left) * (canvas.width / r.width), (last.y - r.top) * (canvas.height / r.height), last.x, last.y);
    }
    last = null; pinchDist = 0;
  });
  canvas.addEventListener('touchcancel', () => { clearHold(); last = null; pinchDist = 0; });
}

// Show a tooltip near (cx, cy) but keep it on-screen: flip left/up when it would cross the
// viewport edge, clamp to an 8px margin. Shared by every engine's tipAt so the edge logic lives once.
function placeTooltip(el, cx, cy) {
  el.style.display = 'block';
  const w = el.offsetWidth, h = el.offsetHeight, p = 8;
  let x = cx + 14, y = cy + 14;
  if (x + w > innerWidth - p) x = cx - 14 - w;
  if (y + h > innerHeight - p) y = cy - 14 - h;
  el.style.left = Math.max(p, x) + 'px';
  el.style.top = Math.max(p, y) + 'px';
}

// Size a canvas's backing store to its CSS box × devicePixelRatio so the view fills the frame
// (no letterbox) and renders crisp on retina/phone screens. Every engine works in backing-store
// pixels and already maps input by the box ratio, so resizing these dims is all that's needed for
// fit()/draw/picking to adapt — onResize just re-fits the camera to the new shape. DPR is capped
// at 2 so dense phone screens don't multiply fill-rate and drop frames. Returns a manual apply().
function autosizeCanvas(canvas, onResize) {
  const apply = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h || (canvas.width === w && canvas.height === h)) return;
    canvas.width = w; canvas.height = h;
    if (onResize) onResize();
  };
  new ResizeObserver(apply).observe(canvas);
  return apply;
}

// Frame pacing for the always-on backdrop loops (city-live.js, nation.js). Redrawing the whole
// city at the display's native refresh (often 120/144Hz) is what runs a laptop hot on the demo,
// so cap it: ~30fps while the view is being used, ~12fps once it's gone idle. The ambient twinkle/
// clouds and the slow dispatch beat read fine at both. `draw(t)` paints one frame; it must NOT
// re-arm rAF itself.
function pacedLoop(draw) {
  const ACTIVE = 1000 / 30, IDLE = 1000 / 12, IDLE_AFTER = 4000;
  let last = 0, active = 0;
  const bump = () => active = performance.now();
  ['pointerdown', 'pointermove', 'wheel', 'keydown'].forEach(ev => addEventListener(ev, bump, { passive: true }));
  bump();
  requestAnimationFrame(function frame(t) {
    if (t - last >= (t - active > IDLE_AFTER ? IDLE : ACTIVE)) { last = t; draw(t); }
    requestAnimationFrame(frame);
  });
}
