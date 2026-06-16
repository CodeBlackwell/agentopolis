// Share a city to social media. The browser already rendered the skyline, so on Share we capture the
// #map canvas into a 1200x630 OG image, upload it (keyed by repo so the link unfurls with that skyline),
// then hand off to the native share sheet or copy the canonical link.
(() => {
const params = new URLSearchParams(location.search);
const forge = params.get('forge');
// must match server root()'s og_key: the forge url, else the demo city (SPICE)
const shareKey = () => forge || window.DEMO_CITY || document.body.dataset.hallName || 'city';
const shareUrl = () => forge ? location.origin + '/?forge=' + encodeURIComponent(forge) : location.origin + '/';

function captureOG() {                                    // #map → branded 1200x630 PNG
  const map = document.getElementById('map');
  if (!map || !map.width) return Promise.resolve(null);
  const W = 1200, H = 630, off = document.createElement('canvas');
  off.width = W; off.height = H;
  const g = off.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, H);        // plum backdrop so cropped margins stay branded
  grad.addColorStop(0, '#241020'); grad.addColorStop(.55, '#3d1832'); grad.addColorStop(1, '#2a1024');
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  g.drawImage(map, 0, 0, W, map.height * (W / map.width));  // fit width, top-align (bottom is ground/water)
  g.fillStyle = 'rgba(42,16,36,.82)'; g.fillRect(0, H - 54, W, 54);   // title strip
  g.textBaseline = 'middle';
  g.fillStyle = '#f9efe3'; g.font = "26px 'Silkscreen', monospace"; g.textAlign = 'left';
  g.fillText((document.body.dataset.hallName || 'a codebase') + ' — built by Claude Code', 24, H - 27);
  g.fillStyle = '#d4a953'; g.font = "15px 'Silkscreen', monospace"; g.textAlign = 'right';
  g.fillText('agentopolis.codeblackwell.ai', W - 24, H - 27);
  return new Promise(res => off.toBlob(res, 'image/png'));
}

function toast(msg) {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, { position: 'fixed', bottom: '22px', left: '50%', transform: 'translateX(-50%)',
    zIndex: 20, padding: '9px 14px', background: 'rgba(42,16,36,.95)', border: '2px solid #d4a953',
    color: '#f9efe3', font: "11px 'Silkscreen', monospace", boxShadow: '3px 3px 0 #5a2c4d' });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

async function onShare(btn) {
  btn.disabled = true;
  try {
    const blob = await captureOG();
    if (blob) await fetch('/og?key=' + encodeURIComponent(shareKey()),
      { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob });
    const url = shareUrl(), data = { title: 'Agentopolis', text: 'my codebase as a living isometric city', url };
    let file = blob && new File([blob], 'city.png', { type: 'image/png' });
    if (window.MOVIE && window.recordTimelapseClip) {        // in a movie, share the build itself — a short clip
      const label = btn.innerHTML; btn.innerHTML = '&#9679; rec';
      const clip = await window.recordTimelapseClip();        // ~12s pass; the still above still warms the unfurl card
      btn.innerHTML = label;
      if (clip) file = new File([clip], 'city.' + (clip.type.includes('mp4') ? 'mp4' : 'webm'), { type: clip.type });
    }
    if (navigator.share && file && navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] });
    else if (navigator.share) await navigator.share(data);
    else { await navigator.clipboard.writeText(url); toast('link copied — paste anywhere to share your city'); }
  } catch (e) { if (e?.name !== 'AbortError') console.warn('share failed', e); }   // AbortError = user closed the sheet
  finally { btn.disabled = false; }
}

// one Share button in #mapctl — present over the map in both the live city and the movie
function mount() {
  if (document.body.dataset.mode !== 'city') return;     // cities only; the nation map has no single repo to share
  const ctl = document.getElementById('mapctl');
  if (!ctl || document.getElementById('share')) return;
  const btn = document.createElement('button');
  btn.id = 'share'; btn.className = 'wide'; btn.title = 'share this city';
  btn.innerHTML = '&#8682; share';
  btn.onclick = () => onShare(btn);
  ctl.appendChild(btn);
}
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', mount); else mount();
})();
