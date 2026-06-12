// City backdrop on the main page: fixed view, grows from live events via cityHandle().
const cityCanvas = document.getElementById('citybg');
const cityCtx = cityCanvas.getContext('2d');
const cityCam = { ox: 0, oy: 0, s: 1 };
let cityState = null;

fetch('city-data.json').then(r => r.json()).then(data => {
  cityState = City.layout(data);
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

window.addEventListener('keydown', e => {
  if (e.key === 'q' || e.key === 'e')
    cityCam.rot = ((cityCam.rot || 0) + (e.key === 'q' ? 1 : 3)) % 4;
});

cityCanvas.addEventListener('mousemove', m => {
  const r = cityCanvas.getBoundingClientRect();
  const hit = cityState && City.pick(cityState,
    (m.clientX - r.left) * (cityCanvas.width / r.width),
    (m.clientY - r.top) * (cityCanvas.height / r.height));
  const tip = document.getElementById('tooltip');
  if (hit) {
    tip.textContent = `${hit.path} · ${hit.floors} fl · ${hit.commits} commits`
      + `${hit.scaffold ? ' · under construction' : ''}`;
    tip.style.left = `${m.clientX + 14}px`;
    tip.style.top = `${m.clientY + 14}px`;
    tip.style.display = 'block';
  } else tip.style.display = 'none';
});
