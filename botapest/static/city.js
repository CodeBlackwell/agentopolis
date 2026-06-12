// Standalone city explorer: full-frame view with pan/zoom + tooltip.
const canvas = document.getElementById('city');
const ctx = canvas.getContext('2d');
const tooltip = document.getElementById('tooltip');
const cam = { ox: 0, oy: 0, s: 1 };
let state = null;

async function init() {
  state = City.layout(await (await fetch('city-data.json')).json());
  City.fit(cam, canvas, state);
  requestAnimationFrame(function frame(t) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    City.draw(ctx, cam, state, t);
    requestAnimationFrame(frame);
  });
}

window.addEventListener('keydown', e => {
  if (e.key === 'q' || e.key === 'e')
    cam.rot = ((cam.rot || 0) + (e.key === 'q' ? 1 : 3)) % 4;
});

let drag = null;
canvas.addEventListener('mousedown', m => drag = { x: m.clientX, y: m.clientY });
window.addEventListener('mouseup', () => drag = null);
canvas.addEventListener('wheel', m => {
  m.preventDefault();
  const r = canvas.getBoundingClientRect();
  const mx = (m.clientX - r.left) * (canvas.width / r.width);
  const my = (m.clientY - r.top) * (canvas.height / r.height);
  const k = m.deltaY < 0 ? 1.12 : 1 / 1.12;
  cam.ox = mx + (cam.ox - mx) * k;
  cam.oy = my + (cam.oy - my) * k;
  cam.s *= k;
}, { passive: false });

canvas.addEventListener('mousemove', m => {
  const r = canvas.getBoundingClientRect();
  const kx = canvas.width / r.width, ky = canvas.height / r.height;
  if (drag) {
    cam.ox += (m.clientX - drag.x) * kx;
    cam.oy += (m.clientY - drag.y) * ky;
    drag = { x: m.clientX, y: m.clientY };
    return;
  }
  const hit = state && City.pick(state, (m.clientX - r.left) * kx, (m.clientY - r.top) * ky);
  if (hit) {
    const files = hit.files > 1 ? ` · ${hit.files} files` : '';
    tooltip.textContent = `${hit.path}${files} · ${hit.floors} fl · ${hit.loc} loc · `
      + `${hit.commits} commits · touched ${hit.age_days}d ago`
      + (hit.todos ? ` · ${hit.todos} TODOs` : '');
    tooltip.style.left = `${m.clientX + 14}px`;
    tooltip.style.top = `${m.clientY + 14}px`;
    tooltip.style.display = 'block';
  } else tooltip.style.display = 'none';
});

init();
