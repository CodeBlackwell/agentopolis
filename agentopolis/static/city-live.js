// City backdrop on the main page: fixed view, grows from live events via cityHandle().
const cityCanvas = document.getElementById('map');
const cityCtx = cityCanvas.getContext('2d');
const cityCam = { ox: 0, oy: 0, s: 1 };
window.apxCam = cityCam;                                   // the tour watches this to gate the zoom/pan/reset step
let cityState = null;
const FIT = [115, 30, 1.18];                               // City.fit (pad, margin, zoom) for the live view

// match the backing store to the box × DPR now and on every resize/orientation change, re-fitting
// the city to the new shape (skipped until the layout has loaded; the fetch below does the first fit)
autosizeCanvas(cityCanvas, () => { if (cityState) City.fit(cityCam, cityCanvas, cityState, ...FIT); })();

// carry the camera across the live↔movie reload so flipping modes doesn't jump the view. Keyed by city
// (the forge url, else the data source) so a different city never inherits the wrong frame. The movie
// reframes itself each formation, so only the live view — which fits once then holds — restores.
const camKey = (window.CITY_SRC || 'city-data.json').replace(/.*url=([^&]+).*/, 'forge:$1');
addEventListener('pagehide', () => { try {
  sessionStorage.setItem('apx-cam', JSON.stringify({ k: camKey, src: 'live', ox: cityCam.ox, oy: cityCam.oy, s: cityCam.s, rot: cityCam.rot || 0 }));
} catch (e) {} });

fetch(window.CITY_SRC || 'city-data.json').then(r => { if (!r.ok) throw r.status; return r.json(); }).then(data => {
  cityState = City.layout(data);
  const dr = data.sample || {};                            // headline stats for the share caption (#6/#7)
  window.CITY_STATS = { files: data.buildings.reduce((n, b) => n + (b.files || 0), 0) + (dr.files?.dropped || 0),
                        districts: data.buildings.length + (dr.buildings?.dropped || 0) };
  if (typeof startDemoLoop === 'function') startDemoLoop(data.buildings);
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
    add('row', `<span class="chip" style="background:${b.comp.color}"></span>${b.comp.name.toLowerCase()}`);
  if (cityState.clouds.length) {
    add('plaque', 'cloud services');
    for (const c of cityState.clouds)
      add('row', `<span class="chip" style="background:#f9efe3"></span>${c.name.toLowerCase()} · ${c.tether}`);
  }
  add('plaque', 'building shapes');                         // same paradigm engine as the movie, on the live city
  const shapeRow = document.createElement('div');
  shapeRow.className = 'row';
  shapeRow.innerHTML = `<select id="city-shape" title="how building shapes are chosen">` +
    City.SHAPE_MODES.map(m => `<option value="${m}"${m === City.shapeMode ? ' selected' : ''}>${m}</option>`).join('') +
    `</select>`;
  legend.insertBefore(shapeRow, controls);
  shapeRow.querySelector('#city-shape').onchange = e => {   // re-shape; the frame loop repaints
    City.setShapeMode(e.target.value);
    City.applyShapes(cityState);
  };
  citySampleNote(data);
  City.fit(cityCam, cityCanvas, cityState, ...FIT);
  try { const c = JSON.parse(sessionStorage.getItem('apx-cam') || 'null');   // keep the frame carried from the movie
    if (c && c.k === camKey) { cityCam.ox = c.ox; cityCam.oy = c.oy; cityCam.s = c.s; cityCam.rot = c.rot; } } catch (e) {}
  requestAnimationFrame(function frame(t) {
    cityCtx.clearRect(0, 0, cityCanvas.width, cityCanvas.height);
    City.draw(cityCtx, cityCam, cityState, t);
    requestAnimationFrame(frame);
  });
}).catch(e => {                                            // a bad/missing repo on the static forge path → card, not a blank map
  if (window.CITY_SRC && window.CITY_SRC.includes('/forge?')) return showForgeError();
  console.error('city load failed', e);
});

function cityHandle(e) {
  if (!cityState) return;
  City.applyEvent(cityState, e);
}

function cityZoom(k, mx = cityCanvas.width / 2, my = cityCanvas.height / 2) {
  const c = cityCam;
  c.ox = mx + (c.ox - mx) * k;
  c.oy = my + (c.oy - my) * k;
  c.s *= k;
}
function cityRotate(dir) { cityCam.rot = ((cityCam.rot || 0) + (dir > 0 ? 1 : 7)) % 8; }

const CTL = { 'rot-': () => cityRotate(-1), 'rot+': () => cityRotate(1),
              'zoom+': () => cityZoom(1.18), 'zoom-': () => cityZoom(1 / 1.18),
              'reset': () => { cityCam.rot = 0; City.fit(cityCam, cityCanvas, cityState, ...FIT); } };
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
cityCanvas.addEventListener('mousedown', m =>
  cityDrag = { x: m.clientX, y: m.clientY, ix: m.clientX, iy: m.clientY, moved: false });
window.addEventListener('mouseup', m => {
  if (cityDrag && !cityDrag.moved) {                        // a click, not a drag: select what's under it
    const r = cityCanvas.getBoundingClientRect();
    selectAt((m.clientX - r.left) * (cityCanvas.width / r.width),
             (m.clientY - r.top) * (cityCanvas.height / r.height), m.clientX, m.clientY);
  }
  cityDrag = null;
});

function selectAt(mx, my, cx, cy) {                         // pin the highlight + show that item's tooltip
  if (!cityState) return;
  City.select(cityState, mx, my);
  tipAt(mx, my, cx, cy);
}

function tipAt(mx, my, cx, cy) {                           // shared by hover + touch long-press
  const hit = cityState && City.pick(cityState, mx, my);
  const tip = document.getElementById('tooltip');
  if (hit && hit.scroll) {
    City.roster(hit.tip, cx, cy);
    tip.style.display = 'none';
  } else if (hit) {
    City.roster('');
    tip.textContent = hit.tip || `${hit.path} · ${hit.floors} fl · ${hit.commits} commits`
      + `${hit.scaffold ? ' · under construction' : ''}`;
    tip.style.left = `${cx + 14}px`;
    tip.style.top = `${cy + 14}px`;
    tip.style.display = 'block';
  } else { City.roster(''); tip.style.display = 'none'; }
}
cityCanvas.addEventListener('mousemove', m => {
  const r = cityCanvas.getBoundingClientRect();
  if (cityDrag) {
    const c = cityCam, kx = cityCanvas.width / r.width, ky = cityCanvas.height / r.height;
    if (Math.hypot(m.clientX - cityDrag.ix, m.clientY - cityDrag.iy) > 4) cityDrag.moved = true;
    c.ox += (m.clientX - cityDrag.x) * kx;
    c.oy += (m.clientY - cityDrag.y) * ky;
    cityDrag.x = m.clientX; cityDrag.y = m.clientY;
    return;
  }
  tipAt((m.clientX - r.left) * (cityCanvas.width / r.width),
        (m.clientY - r.top) * (cityCanvas.height / r.height), m.clientX, m.clientY);
});

attachTouch(cityCanvas, {
  pan: (dx, dy) => { cityCam.ox += dx; cityCam.oy += dy;
                     document.getElementById('tooltip').style.display = 'none'; City.roster(''); },
  pinch: (k, mx, my) => cityZoom(k, mx, my),
  twist: cityRotate,
  tap: selectAt,
  hold: tipAt,
});
