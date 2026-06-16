// Hotel state machine: SSE events in, avatars move, ticker logs.
// IIFE-scoped so its ctx/canvas/tooltip globals don't collide with nation.js when both load.
(() => {
if (window.MOVIE && !window.DEMO_MOVIE) return;   // movie hides the floor — except the demo movie, which keeps it as the agent-speed meme
const STATIONS = {
  reception: [5, 2], terminal: [9, 2], archive: [2, 4], workshop: [2, 9],
  telephone: [10, 8], lobby: [5, 6], door: [0, 7],
};
const TOOL_STATION = {
  Bash: 'terminal', BashOutput: 'terminal', Read: 'archive', Grep: 'archive', Glob: 'archive',
  Edit: 'workshop', Write: 'workshop', MultiEdit: 'workshop', NotebookEdit: 'workshop',
  WebSearch: 'telephone', WebFetch: 'telephone', Task: 'reception', TodoWrite: 'reception',
};
const HAIR = ['#2d1b12', '#6b3e1e', '#c9a227', '#3a3a3a'];
const SPEED = window.DEMO_MOVIE ? 8 : 3.2;        // the demo movie cranks agent speed for the meme
const BUBBLE_MS = window.DEMO_MOVIE ? 1600 : 4700;   // rapid demo: bubbles flash, not pile up
const SEATS = [[0, 0], [.55, 0], [0, .55], [.55, .55], [-.5, .3], [.3, -.5], [-.5, -.5], [.7, .35]];

const ctx = document.getElementById('hotel').getContext('2d');
const ticker = document.getElementById('ticker');
const avatars = new Map();
const pendingNames = new Map();             // session -> task descriptions awaiting their agent

const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function spawn(id, name, isAgent) {
  const [dx, dy] = STATIONS.door;
  const av = {
    id, name, isAgent, x: dx, y: dy, tx: dx, ty: dy, state: 'idle', pending: 'idle',
    color: '#d4a953', shirt: hash(id),         // shirt = stable slot; the room's palette picks the color
    hair: HAIR[hash(name) % HAIR.length], bubble: null, leaving: false,
  };
  avatars.set(id, av);
  return av;
}

function seat(av, station) {                 // lowest free offset so co-located avatars don't overlap
  const taken = new Set();
  for (const o of avatars.values())
    if (o !== av && o.station === station && o.seat != null) taken.add(o.seat);
  let i = 0;
  while (taken.has(i) && i < SEATS.length - 1) i++;
  return i;
}

function send(av, station, text) {
  const [bx, by] = STATIONS[station];
  av.station = station;
  av.seat = seat(av, station);
  av.tx = Math.max(0, bx + SEATS[av.seat][0]);
  av.ty = Math.max(0, by + SEATS[av.seat][1]);
  av.state = 'walking';
  av.pending = station === 'lobby' ? 'idle' : 'working';
  av.activity = text || null;
  av.since = performance.now();
  if (text) av.bubble = { text, t: performance.now() };
}

function done(av) {                          // a tool finished: stop working, hold position
  av.pending = 'idle';
  if (av.state === 'working') av.state = 'idle';
}

function stationFor(tool) {                  // route unknown/MCP tools instead of dumping them in the lobby
  if (tool && tool.startsWith('mcp__')) return 'telephone';
  return TOOL_STATION[tool] || 'reception';
}

function ensureMain(session) {
  const id = `main:${session}`;
  if (!avatars.has(id)) send(spawn(id, `claude·${session.slice(0, 4)}`, false), 'reception', 'checking in');
  return avatars.get(id);
}

function checkout(av) {
  av.leaving = true;
  send(av, 'door', 'checking out');
}

function handle(e) {
  if (typeof cityHandle === 'function') cityHandle(e);
  if (e.agent_id) handleAgent(e);
  else handleMain(e);
  tick(e);
}

function handleMain(e) {
  const main = ensureMain(e.session || '????');
  main.waiting = false;
  if (e.event === 'UserPromptSubmit') send(main, 'reception', e.detail);
  else if (e.event === 'PreToolUse' && (e.tool === 'Task' || e.tool === 'Agent')) {
    pendingNames.set(e.session, [...(pendingNames.get(e.session) || []), e.agent_name]);
    send(main, 'reception', `dispatch: ${e.agent_name || 'agent'}`);
  } else if (e.event === 'PreToolUse')
    send(main, stationFor(e.tool), `${e.tool}${e.detail ? ': ' + e.detail : ''}`);
  else if (e.event === 'PostToolUse') done(main);
  else if (e.event === 'Notification') {
    main.waiting = true;
    main.bubble = { text: e.detail || 'needs attention', t: performance.now() };
  } else if (e.event === 'Stop') send(main, 'lobby', 'at your leisure');
  else if (e.event === 'SessionEnd')
    [...avatars.values()].filter(av => av.id.includes(e.session)).forEach(checkout);
}

function handleAgent(e) {                   // events fired inside a subagent
  const id = `agent:${e.session}:${e.agent_id}`;
  if (e.event === 'SubagentStop') {
    if (avatars.has(id)) checkout(avatars.get(id));
    return;
  }
  let av = avatars.get(id);
  if (!av) {                                // first sight of this agent: spawn it with its real identity
    av = spawn(id, e.agent_type || 'agent', true);
    av.task = (pendingNames.get(e.session) || []).shift() || null;
  }
  if (e.event === 'PreToolUse')
    send(av, stationFor(e.tool), `${e.tool}${e.detail ? ': ' + e.detail : ''}`);
  else if (e.event === 'PostToolUse') done(av);
}

function randomStation() {
  const names = ['terminal', 'archive', 'workshop', 'telephone'];
  return names[Math.floor(Math.random() * names.length)];
}

function logLine(e) {                       // plain-language action, or null for noise the user can't act on
  if (e.event === 'UserPromptSubmit') return e.detail ? `asked: ${e.detail}` : 'new request';
  if (e.event === 'Notification') return `⚠ ${e.detail || 'needs your attention'}`;
  if (e.event === 'Stop') return 'finished — at your leisure';
  if (e.event === 'PreToolUse') {
    if (e.tool === 'Task' || e.tool === 'Agent') return `dispatched ${e.agent_name || 'an agent'}`;
    const line = e.detail ? `${e.tool}: ${e.detail}` : e.tool;
    return e.agent_type ? `${e.agent_type} · ${line}` : line;   // attribute subagent actions to the worker
  }
  return null;                              // PostToolUse, SessionStart/End, SubagentStop, etc.
}

function tick(e) {
  const text = logLine(e);
  if (!text) return;
  const line = document.createElement('div');
  const time = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="t">${time}</span>${text}`;
  ticker.prepend(line);
  while (ticker.children.length > 40) ticker.lastChild.remove();
}

setInterval(() => {                         // idle agents wander to stations
  for (const av of avatars.values())
    if (av.isAgent && !av.leaving && av.state === 'idle' && Math.random() < .35)
      send(av, randomStation());
}, window.DEMO_MOVIE ? 1600 : 5000);

let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, .1);
  last = t;
  for (const av of [...avatars.values()]) {
    const dx = av.tx - av.x, dy = av.ty - av.y;
    if (Math.abs(dx) > .05) av.x += Math.sign(dx) * Math.min(SPEED * dt, Math.abs(dx));
    else if (Math.abs(dy) > .05) av.y += Math.sign(dy) * Math.min(SPEED * dt, Math.abs(dy));
    else {
      av.x = av.tx; av.y = av.ty;
      if (av.leaving) { avatars.delete(av.id); continue; }
      av.state = av.pending;
    }
    if (av.bubble && t - av.bubble.t > BUBBLE_MS) av.bubble = null;
  }
  render(ctx, [...avatars.values()], t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const canvas = document.getElementById('hotel');
const tooltip = document.getElementById('tooltip');
canvas.addEventListener('wheel', m => {
  m.preventDefault();
  const r = canvas.getBoundingClientRect();
  hallZoom(m.deltaY < 0 ? 1.12 : 1 / 1.12,
    (m.clientX - r.left) * (canvas.width / r.width),
    (m.clientY - r.top) * (canvas.height / r.height));
}, { passive: false });

function tipAt(mx, my, cx, cy) {                  // mx,my canvas-space; transform into hall world space
  const wx = (mx - hallCam.ox) / hallCam.s, wy = (my - hallCam.oy) / hallCam.s;
  let hit = null;
  for (const av of avatars.values()) {
    const { sx, sy } = iso(av.x, av.y);
    if (Math.abs(wx - sx) < 22 && wy > sy - 40 && wy < sy + 42) hit = av;
  }
  if (hit) {
    const secs = Math.round((performance.now() - (hit.since || performance.now())) / 1000);
    tooltip.textContent = `${hit.name}${hit.task ? ' · ' + hit.task : ''}`
      + ` · ${hit.waiting ? 'waiting on you' : hit.state}`
      + `${hit.activity ? ' · ' + hit.activity : ''} · ${secs}s`;
    tooltip.style.left = `${cx + 14}px`;
    tooltip.style.top = `${cy + 14}px`;
    tooltip.style.display = 'block';
  } else tooltip.style.display = 'none';
}
canvas.addEventListener('mousemove', m => {
  const r = canvas.getBoundingClientRect();
  tipAt((m.clientX - r.left) * (canvas.width / r.width),
        (m.clientY - r.top) * (canvas.height / r.height), m.clientX, m.clientY);
});

attachTouch(canvas, {
  pan: (dx, dy) => { hallCam.ox += dx; hallCam.oy += dy; tooltip.style.display = 'none'; },
  pinch: (k, mx, my) => hallZoom(k, mx, my),
  hold: tipAt,
});

const lamp = document.getElementById('lamp');
const source = new EventSource('/events');
source.onopen = () => lamp.classList.add('on');
source.onerror = () => lamp.classList.remove('on');
source.onmessage = m => handle(JSON.parse(m.data));

// Seeded loop: a busy crew works the real city on a timer (no live Claude session needed).
// Generates an interleaved multi-agent stream — 4-5 subagents alive at once, cycling in and
// out the door — so the floor scurries and the ticker streams. Reads the city's hottest buildings.
function buildScript(buildings) {
  const s = 'demo';
  const base = p => (p || '').split('/').pop();
  const top = [...buildings].sort((a, b) => (b.commits || 0) - (a.commits || 0)).slice(0, 12);
  const pool = top.length ? top : [{ path: 'app', component: 'core' }, { path: 'lib', component: 'core' }];
  const pick = n => pool[n % pool.length];
  const TYPES = ['Explore', 'general-purpose', 'Plan', 'code-reviewer', 'Task'];
  const TOOLS = ['Read', 'Grep', 'Edit', 'Bash', 'Write', 'Glob', 'WebFetch'];

  const ev = [{ event: 'SessionStart', session: s },
              { event: 'UserPromptSubmit', session: s, detail: `ship the ${pick(0).component} feature` }];
  const live = [];                                  // agents currently in the room: {id, type, work}
  let nextId = 0, k = 0;                             // k rotates tools + buildings so nothing repeats
  const dispatch = () => {
    const type = TYPES[nextId % TYPES.length];
    ev.push({ event: 'PreToolUse', session: s, tool: 'Agent', agent_type: type, agent_name: `survey ${pick(nextId).component}` });
    live.push({ id: `a${nextId}`, type, work: 5 + (nextId % 4) });   // each runs 5-8 tools, then leaves
    nextId++;
  };
  const act = a => {                                // one tool call → the agent scurries to its station + logs
    const b = pick(k), tool = TOOLS[k++ % TOOLS.length];
    ev.push({ event: 'PreToolUse', session: s, agent_id: a.id, agent_type: a.type, tool, detail: base(b.path), path: b.path });
  };
  for (let round = 0; round < 60; round++) {
    while (live.length < 4) dispatch();             // keep the room full...
    if (live.length < 5 && round % 4 === 0) dispatch();   // ...drifting up to five
    for (const a of live) { act(a); a.work--; }
    const b = pick(k);                              // the main agent works alongside the crew, committing now and then
    ev.push(round % 8 === 7
      ? { event: 'PreToolUse', session: s, tool: 'Bash', detail: 'git commit -m ship', commit: true }
      : { event: 'PreToolUse', session: s, tool: TOOLS[k++ % TOOLS.length], detail: base(b.path), path: b.path });
    for (let i = live.length - 1; i >= 0; i--)      // finished agents walk back out the door
      if (live[i].work <= 0) ev.push({ event: 'SubagentStop', session: s, agent_id: live.splice(i, 1)[0].id });
  }
  while (live.length) ev.push({ event: 'SubagentStop', session: s, agent_id: live.pop().id });   // drain before the loop repeats
  ev.push({ event: 'Stop', session: s });
  return ev;
}

let demoTimer = null;
window.startDemoLoop = startDemoLoop;            // city-live.js / nation.js (separate scopes) trigger it
function startDemoLoop(buildings, opts = {}) {
  const forced = new URLSearchParams(location.search).has('demo');
  if (location.hostname === 'localhost' && !forced) return;   // local real-hook use: stay quiet
  if (demoTimer) clearInterval(demoTimer);       // restart on the newly-focused city's buildings
  const script = buildScript(buildings || []);
  let i = 0;
  demoTimer = setInterval(() => handle(script[i++ % script.length]), opts.interval || 2600);
}

// nation mode drives the loop per drilled-in city (nation.js); only kick a generic loop when not auto-drilling
if (document.body.dataset.mode === 'nation' && !window.DEMO_CITY) startDemoLoop(null);
})();
