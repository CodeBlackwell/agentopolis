// Shared touch gestures for the canvases: 1-finger pan, 2-finger pinch-zoom,
// quick tap (drill), long-press (tooltip). Touches are translated to canvas space
// with the same ratio the mouse handlers use, so each engine reuses its own camera
// and hit-test math. Additive — the desktop mouse/wheel handlers stay untouched.
function attachTouch(canvas, { pan, pinch, twist, tap, hold }) {
  const TAP_MS = 300, HOLD_MS = 500, MOVE = 6, TWIST_STEP = Math.PI / 4;   // 45° = one of the 8 city rotations
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const angle = (a, b) => Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX);
  let last = null, holdTimer = null, moved = false, startT = 0, pinchDist = 0, lastAngle = 0, twistAcc = 0;
  const clearHold = () => { clearTimeout(holdTimer); holdTimer = null; };

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    moved = false; startT = e.timeStamp; clearHold();
    if (e.touches.length === 2) { pinchDist = dist(e.touches[0], e.touches[1]);
      lastAngle = angle(e.touches[0], e.touches[1]); twistAcc = 0; last = null; return; }
    const t = e.touches[0], r = canvas.getBoundingClientRect();
    last = { x: t.clientX, y: t.clientY };
    const mx = (t.clientX - r.left) * (canvas.width / r.width), my = (t.clientY - r.top) * (canvas.height / r.height);
    holdTimer = setTimeout(() => { holdTimer = null; if (!moved) hold && hold(mx, my, t.clientX, t.clientY); }, HOLD_MS);
  }, { passive: false });

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
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
    if (moved && pan) pan((t.clientX - last.x) * kx, (t.clientY - last.y) * ky);
    last = { x: t.clientX, y: t.clientY };
  }, { passive: false });

  canvas.addEventListener('touchend', e => {
    clearHold();
    if (e.touches.length === 1) {                  // one of two fingers lifted: keep panning with the other
      last = { x: e.touches[0].clientX, y: e.touches[0].clientY }; pinchDist = 0; moved = true; return;
    }
    if (!moved && e.timeStamp - startT < TAP_MS && last && tap) {
      const r = canvas.getBoundingClientRect();
      tap((last.x - r.left) * (canvas.width / r.width), (last.y - r.top) * (canvas.height / r.height));
    }
    last = null; pinchDist = 0;
  });
  canvas.addEventListener('touchcancel', () => { clearHold(); last = null; pinchDist = 0; });
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
