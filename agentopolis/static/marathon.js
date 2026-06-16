// Marathon mode: a selection bar listing every pre-built movie, and auto-advance to the next when one
// ends. Each pick reloads the shell at ?marathon&m=<id>; the bundle is served from memory, so switching
// is instant and fully offline. No-op unless the server injected window.MARATHON.
(() => {
  const M = window.MARATHON;
  if (!M || !M.movies || !M.movies.length) return;
  const idx = Math.max(0, M.movies.findIndex(m => m.id === M.current));
  const go = id => { location.search = '?marathon&m=' + encodeURIComponent(id); };

  const css = `#marathon{position:absolute;left:14px;top:88px;z-index:9;width:218px;
      max-height:calc(100% - 168px);overflow-y:auto;background:rgba(42,16,36,.93);border:2px solid var(--gold);
      box-shadow:3px 3px 0 var(--plum);font-family:'Silkscreen',monospace;color:var(--cream)}
    #marathon .mh{position:sticky;top:0;background:var(--plum);padding:7px 9px;border-bottom:2px solid var(--gold);
      font-size:10px;letter-spacing:.06em}
    #marathon button{display:block;width:100%;text-align:left;cursor:pointer;border:0;
      border-bottom:1px solid rgba(212,169,83,.22);background:transparent;color:var(--cream);font:inherit;
      font-size:9px;padding:6px 9px;line-height:1.4}
    #marathon button:hover{background:var(--plum-soft)}
    #marathon button.on{background:var(--gold);color:var(--plum)}
    #marathon .lad{display:block;margin-top:2px;font-size:8px;opacity:.72;white-space:nowrap;overflow:hidden;
      text-overflow:ellipsis}
    #marathon button.on .lad{opacity:.85}`;
  document.head.appendChild(document.createElement('style')).textContent = css;

  const bar = document.createElement('div');
  bar.id = 'marathon';
  bar.innerHTML = `<div class="mh">🎬 Marathon · ${idx + 1}/${M.movies.length}</div>` +
    M.movies.map((m, i) =>
      `<button data-id="${m.id}" class="${m.id === M.current ? 'on' : ''}" title="${m.repo} — ${m.ladder}">` +
      `${i + 1}. ${m.repo}<span class="lad">${m.transitions}↻ · ${m.ladder}</span></button>`).join('');
  (document.querySelector('.mapwrap') || document.body).appendChild(bar);
  bar.querySelectorAll('button').forEach(b => { b.onclick = () => go(b.dataset.id); });
  bar.querySelector('.on')?.scrollIntoView({ block: 'center' });

  // auto-advance: when this movie reaches its last commit, roll on to the next (wraps at the end)
  const next = M.movies[(idx + 1) % M.movies.length];
  let rolled = false;
  setInterval(() => {
    if (rolled || typeof commits === 'undefined' || typeof ptr === 'undefined') return;
    if (commits.length && ptr >= commits.length - 1) {
      rolled = true;
      setTimeout(() => go(next.id), 1800);             // hold on the finished city briefly, then advance
    }
  }, 300);
})();
