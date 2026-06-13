// City backdrop on the main page: fixed view, grows from live events via cityHandle().
const cityCanvas = document.getElementById('citybg');
const cityCtx = cityCanvas.getContext('2d');
const cityCam = { ox: 0, oy: 0, s: 1 };
let cityState = null;

fetch('city-data.json').then(r => r.json()).then(data => {
  cityState = City.layout(data);
  const legend = document.getElementById('legend');
  const controls = legend.lastElementChild;
  const add = (cls, html) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    legend.insertBefore(el, controls);
  };
  const section = (title, rows) => {
    add('plaque', title);
    for (const [color, label] of rows)
      add('row', `<span class="chip" style="background:${color}"></span>${label}`);
  };
  section('districts', cityState.blocks.map(b => [b.comp.color, b.comp.name.toLowerCase()]));
  if (cityState.clouds.length)
    section('cloud services', cityState.clouds.map(c => ['#f9efe3', `${c.name.toLowerCase()} · ${c.tether}`]));
  City.fit(cityCam, cityCanvas, cityState, 115, 30, 1.18);
  requestAnimationFrame(function frame(t) {
    cityCtx.clearRect(0, 0, cityCanvas.width, cityCanvas.height);
    City.draw(cityCtx, cityCam, cityState, t);
    requestAnimationFrame(frame);
  });
});

function cityHandle(e) {
  if (cityState) City.applyEvent(cityState, e);
}

function cityZoom(k, mx = cityCanvas.width / 2, my = cityCanvas.height / 2) {
  cityCam.ox = mx + (cityCam.ox - mx) * k;
  cityCam.oy = my + (cityCam.oy - my) * k;
  cityCam.s *= k;
}
function cityRotate(dir) { cityCam.rot = ((cityCam.rot || 0) + (dir > 0 ? 1 : 7)) % 8; }

const CTL = { 'rot-': () => cityRotate(-1), 'rot+': () => cityRotate(1),
              'zoom+': () => cityZoom(1.18), 'zoom-': () => cityZoom(1 / 1.18),
              'reset': () => { cityCam.rot = 0; City.fit(cityCam, cityCanvas, cityState, 115, 30, 1.18); } };
document.getElementById('mapctl').addEventListener('click', e => {
  const act = e.target.dataset.act;
  if (act && cityState) CTL[act]();
});

window.addEventListener('keydown', e => {
  if (e.key === 'q' || e.key === 'e') cityRotate(e.key === 'q' ? 1 : -1);
});

cityCanvas.addEventListener('wheel', m => {
  m.preventDefault();
  const r = cityCanvas.getBoundingClientRect();
  cityZoom(m.deltaY < 0 ? 1.12 : 1 / 1.12,
    (m.clientX - r.left) * (cityCanvas.width / r.width),
    (m.clientY - r.top) * (cityCanvas.height / r.height));
}, { passive: false });

let cityDrag = null;
cityCanvas.addEventListener('mousedown', m => cityDrag = { x: m.clientX, y: m.clientY });
window.addEventListener('mouseup', () => cityDrag = null);

cityCanvas.addEventListener('mousemove', m => {
  const r = cityCanvas.getBoundingClientRect();
  if (cityDrag) {
    const kx = cityCanvas.width / r.width, ky = cityCanvas.height / r.height;
    cityCam.ox += (m.clientX - cityDrag.x) * kx;
    cityCam.oy += (m.clientY - cityDrag.y) * ky;
    cityDrag = { x: m.clientX, y: m.clientY };
    return;
  }
  const hit = cityState && City.pick(cityState,
    (m.clientX - r.left) * (cityCanvas.width / r.width),
    (m.clientY - r.top) * (cityCanvas.height / r.height));
  const tip = document.getElementById('tooltip');
  if (hit) {
    tip.textContent = hit.tip || `${hit.path} · ${hit.floors} fl · ${hit.commits} commits`
      + `${hit.scaffold ? ' · under construction' : ''}`;
    tip.style.left = `${m.clientX + 14}px`;
    tip.style.top = `${m.clientY + 14}px`;
    tip.style.display = 'block';
  } else tip.style.display = 'none';
});
