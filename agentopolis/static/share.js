// Share a city. Clicking Share opens a small destination menu (the industry-standard share dropdown):
// the native OS sheet where supported, X / LinkedIn / Reddit / Hacker News web-intents, copy link, and
// download the image — or, in a movie, the build clip (recorded only when that item is chosen, never on open).
// Opening the menu warms the per-repo OG card so the shared link unfurls with this city's skyline.
(() => {
const params = new URLSearchParams(location.search);
const forge = params.get('forge');
// must match server root()'s og_key: the forge url, else the demo city repo id (window.DEMO_CITY)
const shareKey = () => forge || window.DEMO_CITY || document.body.dataset.hallName || 'city';
// /c/owner/repo canonical when this is a github forge, else the plain origin
const shareUrl = () => {
  const m = forge && /github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(forge);
  return m ? location.origin + '/c/' + m[1] + '/' + m[2] : (forge ? location.origin + '/?forge=' + encodeURIComponent(forge) : location.origin + '/');
};

// a curiosity-gap caption naming the repo + its headline stat — the text the human AND the ranker read
function shareText() {
  const name = document.body.dataset.hallName || 'a codebase', s = window.CITY_STATS || {};
  if (s.commits) return `${name} — ${s.commits.toLocaleString()} commits as a living isometric city 🏙️`;
  if (s.districts) return `${name} — ${s.districts.toLocaleString()} districts as a living isometric city 🏙️`;
  return `${name} as a living isometric city 🏙️`;
}

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
    zIndex: 26, padding: '9px 14px', background: 'rgba(42,16,36,.95)', border: '2px solid #d4a953',
    color: '#f9efe3', font: "11px 'Silkscreen', monospace", boxShadow: '3px 3px 0 #5a2c4d' });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

const beacon = (edge) => { try { navigator.sendBeacon('/e/' + edge); } catch {} };

function downloadBlob(file) {                            // hand the asset to a poster to attach
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

let still = null, menuEl = null;

async function warm() {                                  // capture the still (for image-download / native attach) + upload so the link unfurls
  if (window.MOVIE && window.movieToComplete) await window.movieToComplete();   // a movie cards the FINISHED city, not a mid-reel frame
  const blob = await captureOG();
  if (!blob) return;
  still = new File([blob], 'city.png', { type: 'image/png' });
  try { await fetch('/og?key=' + encodeURIComponent(shareKey()),
    { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob }); } catch {}
}

async function recordClip(btn) {                         // movie only — render the build to a short video on demand
  if (!(window.MOVIE && window.recordTimelapseClip)) return null;
  const label = btn.innerHTML; btn.innerHTML = '&#9679; rendering&hellip;'; toast('rendering your clip… (~12s)');
  const clip = await window.recordTimelapseClip();
  btn.innerHTML = label;
  if (clip) fetch('/og-video?key=' + encodeURIComponent(shareKey()),   // warm the og:video so the link unfurls with inline playback
    { method: 'POST', headers: { 'Content-Type': clip.type || 'video/webm' }, body: clip }).catch(() => {});
  return clip && new File([clip], 'city.' + (clip.type.includes('mp4') ? 'mp4' : 'webm'), { type: clip.type });
}

function closeMenu() {
  if (menuEl) { menuEl.remove(); menuEl = null; }
  removeEventListener('keydown', onKey);
  removeEventListener('pointerdown', onOutside, true);
}
function onKey(e) { if (e.key === 'Escape') closeMenu(); }
function onOutside(e) { if (menuEl && !menuEl.contains(e.target) && e.target.id !== 'share') closeMenu(); }

async function nativeShare(btn, url, text) {             // the OS share sheet — the only path that attaches the real media
  try {
    let file = still;
    if (window.MOVIE) file = await recordClip(btn) || still;
    const data = { title: 'Agentopolis', text, url };
    if (file && navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] });
    else await navigator.share(data);
    beacon('share_completed');
  } catch (e) { if (e?.name !== 'AbortError') console.warn('share failed', e); }
}

function openMenu(btn) {
  if (menuEl) return closeMenu();
  beacon('share_tapped');
  warm();                                                // background: warm the unfurl card + ready the image
  const url = shareUrl(), text = shareText();
  const done = () => { beacon('share_completed'); closeMenu(); };
  const intent = (href) => () => { window.open(href, '_blank', 'noopener'); done(); };
  const rows = [];
  if (navigator.share)                                   // mobile: OS sheet, attaches the actual image/clip
    rows.push(['share sheet…', () => { closeMenu(); nativeShare(btn, url, text); }]);
  rows.push(['post to X', intent(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`)]);
  rows.push(['share on linkedin', intent(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`)]);
  rows.push(['post to reddit', intent(`https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`)]);
  rows.push(['post to hacker news', intent(`https://news.ycombinator.com/submitlink?u=${encodeURIComponent(url)}&t=${encodeURIComponent(text)}`)]);
  rows.push(['copy link', async () => { try { await navigator.clipboard.writeText(text + ' ' + url); toast('link copied'); } catch {} done(); }]);
  rows.push(['download image', async () => { if (!still) await warm(); if (still) downloadBlob(still); done(); }]);
  if (window.MOVIE) rows.push(['download movie', async () => { const f = await recordClip(btn); if (f) downloadBlob(f); done(); }]);

  const m = menuEl = document.createElement('div');
  m.id = 'share-menu';
  m.style.cssText = 'position:fixed;z-index:25;background:rgba(42,16,36,.97);border:2px solid #d4a953;'
    + 'box-shadow:4px 4px 0 #5a2c4d;display:flex;flex-direction:column;min-width:172px';
  rows.forEach(([label, fn], i) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.act = label;
    b.style.cssText = "cursor:pointer;text-align:left;padding:9px 13px;background:none;border:0;color:#f9efe3;"
      + "font:11px 'Silkscreen',monospace;white-space:nowrap" + (i < rows.length - 1 ? ';border-bottom:1px solid #5a2c4d' : '');
    b.onmouseenter = () => { b.style.background = '#d4a953'; b.style.color = '#2a1024'; };
    b.onmouseleave = () => { b.style.background = 'none'; b.style.color = '#f9efe3'; };
    b.onclick = fn;
    m.appendChild(b);
  });
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();                 // open to the LEFT of the button (it sits near the right edge)
  m.style.right = (window.innerWidth - r.left + 8) + 'px';
  m.style.top = Math.max(8, Math.min(r.top, window.innerHeight - m.offsetHeight - 8)) + 'px';
  setTimeout(() => { addEventListener('keydown', onKey); addEventListener('pointerdown', onOutside, true); }, 0);
}

// Pre-warm a forge/demo link's og:video so it unfurls with inline playback. We RIDE the build the
// viewer is already watching (no replay, no end-card) and cache it once — gated so it fires at most
// once, only for a shareable city (forge/demo), and never when the server says it's already warmed.
// The demo is warmed server-side post-deploy (`just prewarm`), so this mostly covers forge links.
function warmVideoOnce() {
  if (!(window.MOVIE && !window.OG_VIDEO_WARM && (forge || window.DEMO_CITY) && window.recordTimelapseClip)) return;
  window.OG_VIDEO_WARM = true;                            // capture at most once per page
  let tries = 0;
  const wait = setInterval(() => {                        // ride the build once it's actually playing; skip if it never does
    if (window.movieState && window.movieState() === 'play') {
      clearInterval(wait);
      window.recordTimelapseClip({ replay: false }).then(clip => {
        if (clip) fetch('/og-video?key=' + encodeURIComponent(shareKey()),
          { method: 'POST', headers: { 'Content-Type': clip.type || 'video/webm' }, body: clip }).catch(() => {});
      });
    } else if (++tries > 100) clearInterval(wait);        // ~20s and still not playing → leave it cold
  }, 200);
}

// one Share button in #mapctl — present over the map in both the live city and the movie
function mount() {
  if (document.body.dataset.mode !== 'city') return;     // cities only; the nation map has no single repo to share
  const ctl = document.getElementById('mapctl');
  if (!ctl || document.getElementById('share')) return;
  const btn = document.createElement('button');
  btn.id = 'share'; btn.className = 'wide'; btn.title = 'share this city';
  btn.innerHTML = '<span class="ico">&#8682;</span>share';
  btn.onclick = () => openMenu(btn);
  ctl.appendChild(btn);
}
function boot() { mount(); warmVideoOnce(); }
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot); else boot();
window.__share = { text: shareText, url: shareUrl, open: openMenu };   // exposed for share self-tests (cf. window.__tl)
})();
