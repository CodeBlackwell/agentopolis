// City backdrop on the main page: fixed view, grows from live events via cityHandle().
// Click a building (or a legend district) to drill into its District interior; ◀ CITY returns.
const cityCanvas = document.getElementById('map');
const cityCtx = cityCanvas.getContext('2d');
const cityCam = { ox: 0, oy: 0, s: 1 };
const districtCam = { ox: 0, oy: 0, s: 1 };
let cityState = null;
let districtState = null;
const curState = () => districtState || cityState;
const curCam = () => districtState ? districtCam : cityCam;

fetch('city-data.json').then(r => r.json()).then(data => {
  cityState = City.layout(data);
  const legend = document.getElementById('legend');
  const controls = legend.lastElementChild;
  const add = (cls, html, comp) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    if (comp) el.dataset.comp = comp;
    legend.insertBefore(el, controls);
  };
  add('plaque', 'districts');
  for (const b of cityState.blocks)
    add('row dclick', `<span class="chip" style="background:${b.comp.color}"></span>${b.comp.name.toLowerCase()}`,
        b.comp.id);
  if (cityState.clouds.length) {
    add('plaque', 'cloud services');
    for (const c of cityState.clouds)
      add('row', `<span class="chip" style="background:#f9efe3"></span>${c.name.toLowerCase()} · ${c.tether}`);
  }
  legend.addEventListener('click', e => {
    const row = e.target.closest('.dclick');
    if (row) enterDistrict(row.dataset.comp);
  });
  City.fit(cityCam, cityCanvas, cityState, 115, 30, 1.18);
  requestAnimationFrame(function frame(t) {
    cityCtx.clearRect(0, 0, cityCanvas.width, cityCanvas.height);
    if (districtState) City.drawDistrict(cityCtx, districtCam, districtState, t);
    else City.draw(cityCtx, cityCam, cityState, t);
    requestAnimationFrame(frame);
  });
});

function enterDistrict(compId) {
  if (!cityState) return;
  districtState = City.districtLayout(cityState, compId);
  districtCam.rot = 0;
  City.fit(districtCam, cityCanvas, districtState, 115, 30, 1.18);
  const crumb = document.getElementById('crumb');
  crumb.style.display = 'block';
  document.getElementById('crumbName').textContent = districtState.comp.name;
  document.getElementById('crumbInfo').textContent = districtState.charter;
}
function exitDistrict() {
  districtState = null;
  document.getElementById('crumb').style.display = 'none';
}
document.getElementById('crumb').addEventListener('click', e => {
  if (e.target.dataset.nav === 'city') exitDistrict();
});

function cityHandle(e) {
  if (!cityState) return;
  City.applyEvent(cityState, e);
  if (districtState) {                                      // a new file in this district needs a lot
    const id = districtState.comp.id;
    if (cityState.buildings.filter(b => b.component === id).length !== districtState.buildings.length) {
      districtState = City.districtLayout(cityState, id);
      document.getElementById('crumbInfo').textContent = districtState.charter;
    }
  }
}

function cityZoom(k, mx = cityCanvas.width / 2, my = cityCanvas.height / 2) {
  const c = curCam();
  c.ox = mx + (c.ox - mx) * k;
  c.oy = my + (c.oy - my) * k;
  c.s *= k;
}
function cityRotate(dir) { const c = curCam(); c.rot = ((c.rot || 0) + (dir > 0 ? 1 : 7)) % 8; }

const CTL = { 'rot-': () => cityRotate(-1), 'rot+': () => cityRotate(1),
              'zoom+': () => cityZoom(1.18), 'zoom-': () => cityZoom(1 / 1.18),
              'reset': () => { curCam().rot = 0; City.fit(curCam(), cityCanvas, curState(), 115, 30, 1.18); } };
document.getElementById('mapctl').addEventListener('click', e => {
  const act = e.target.dataset.act;
  if (act && cityState) CTL[act]();
});

window.addEventListener('keydown', e => {
  if (e.key === 'q' || e.key === 'e') cityRotate(e.key === 'q' ? 1 : -1);
  if (e.key === 'Escape' && districtState) exitDistrict();
});

cityCanvas.addEventListener('wheel', m => {
  m.preventDefault();
  const r = cityCanvas.getBoundingClientRect();
  cityZoom(m.deltaY < 0 ? 1.12 : 1 / 1.12,
    (m.clientX - r.left) * (cityCanvas.width / r.width),
    (m.clientY - r.top) * (cityCanvas.height / r.height));
}, { passive: false });

let cityDrag = null;
cityCanvas.addEventListener('mousedown', m =>
  cityDrag = { x: m.clientX, y: m.clientY, ix: m.clientX, iy: m.clientY, moved: false });
window.addEventListener('mouseup', m => {
  if (cityDrag && !cityDrag.moved && !districtState && cityState && m.target === cityCanvas) {
    const r = cityCanvas.getBoundingClientRect();
    const hit = City.pick(cityState, (m.clientX - r.left) * (cityCanvas.width / r.width),
                                     (m.clientY - r.top) * (cityCanvas.height / r.height));
    if (hit && hit.component) enterDistrict(hit.component);
  }
  cityDrag = null;
});

cityCanvas.addEventListener('mousemove', m => {
  const r = cityCanvas.getBoundingClientRect();
  if (cityDrag) {
    const c = curCam(), kx = cityCanvas.width / r.width, ky = cityCanvas.height / r.height;
    if (Math.hypot(m.clientX - cityDrag.ix, m.clientY - cityDrag.iy) > 4) cityDrag.moved = true;
    c.ox += (m.clientX - cityDrag.x) * kx;
    c.oy += (m.clientY - cityDrag.y) * ky;
    cityDrag.x = m.clientX; cityDrag.y = m.clientY;
    return;
  }
  const hit = curState() && City.pick(curState(),
    (m.clientX - r.left) * (cityCanvas.width / r.width),
    (m.clientY - r.top) * (cityCanvas.height / r.height));
  const tip = document.getElementById('tooltip');
  if (hit && hit.scroll) {
    City.roster(hit.tip, m.clientX, m.clientY);
    tip.style.display = 'none';
  } else if (hit) {
    City.roster('');
    tip.textContent = hit.tip || `${hit.path} · ${hit.floors} fl · ${hit.commits} commits`
      + `${hit.scaffold ? ' · under construction' : ''}`;
    tip.style.left = `${m.clientX + 14}px`;
    tip.style.top = `${m.clientY + 14}px`;
    tip.style.display = 'block';
  } else { City.roster(''); tip.style.display = 'none'; }
});
