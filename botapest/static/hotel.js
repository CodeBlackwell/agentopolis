// Hotel state machine: SSE events in, avatars move, ticker logs.
const STATIONS = {
  reception: [5, 2], terminal: [9, 2], archive: [2, 4], workshop: [2, 9],
  telephone: [10, 8], lobby: [5, 6], door: [0, 7],
};
const TOOL_STATION = {
  Bash: 'terminal', BashOutput: 'terminal', Read: 'archive', Grep: 'archive', Glob: 'archive',
  Edit: 'workshop', Write: 'workshop', MultiEdit: 'workshop', NotebookEdit: 'workshop',
  WebSearch: 'telephone', WebFetch: 'telephone', Task: 'reception', TodoWrite: 'reception',
};
const SHIRTS = ['#c0392b', '#2980b9', '#27ae60', '#e67e22', '#8e44ad', '#16a085', '#d35400', '#e84393'];
const HAIR = ['#2d1b12', '#6b3e1e', '#c9a227', '#3a3a3a'];
const SPEED = 3.2;

const ctx = document.getElementById('hotel').getContext('2d');
const ticker = document.getElementById('ticker');
const avatars = new Map();
const agentQueues = new Map();              // session -> spawned-but-unclaimed avatar ids
const agentAvatars = new Map();             // `${session}:${agent_id}` -> avatar id
let agentCount = 0;

const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function spawn(id, name, isAgent) {
  const [dx, dy] = STATIONS.door;
  const av = {
    id, name, isAgent, x: dx, y: dy, tx: dx, ty: dy, state: 'idle', pending: 'idle',
    color: isAgent ? SHIRTS[hash(id) % SHIRTS.length] : '#d4a953',
    hair: HAIR[hash(name) % HAIR.length], bubble: null, leaving: false,
  };
  avatars.set(id, av);
  return av;
}

function send(av, station, text) {
  [av.tx, av.ty] = STATIONS[station];
  av.state = 'walking';
  av.pending = station === 'lobby' ? 'idle' : 'working';
  av.activity = text || null;
  av.since = performance.now();
  if (text) av.bubble = { text, t: performance.now() };
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
  cityHandle(e);                            // the skyline grows from the same events
  if (e.agent_id) handleAgent(e);
  else handleMain(e);
  tick(e);
}

function handleMain(e) {
  const main = ensureMain(e.session || '????');
  main.waiting = false;
  if (e.event === 'UserPromptSubmit') send(main, 'reception', e.detail);
  else if (e.event === 'PreToolUse' && (e.tool === 'Task' || e.tool === 'Agent')) {
    const id = `agent:${e.session}:${agentCount++}`;
    send(spawn(id, e.agent_type || 'agent', true), randomStation(), e.agent_name);
    agentQueues.set(e.session, [...(agentQueues.get(e.session) || []), id]);
  } else if (e.event === 'PreToolUse')
    send(main, TOOL_STATION[e.tool] || 'lobby', `${e.tool}${e.detail ? ': ' + e.detail : ''}`);
  else if (e.event === 'Notification') {
    main.waiting = true;
    main.bubble = { text: e.detail || 'needs attention', t: performance.now() };
  } else if (e.event === 'Stop') send(main, 'lobby', 'at your leisure');
  else if (e.event === 'SessionEnd')
    [...avatars.values()].filter(av => av.id.includes(e.session)).forEach(checkout);
}

function handleAgent(e) {                   // events fired inside a subagent
  const key = `${e.session}:${e.agent_id}`;
  if (e.event === 'SubagentStop') {
    const id = agentAvatars.get(key) || (agentQueues.get(e.session) || []).shift();
    agentAvatars.delete(key);
    if (id && avatars.has(id)) checkout(avatars.get(id));
    return;
  }
  let id = agentAvatars.get(key);
  if (!id || !avatars.has(id)) {            // claim oldest unclaimed spawn, else walk in
    id = (agentQueues.get(e.session) || []).shift()
      || spawn(`agent:${key}`, e.agent_type || 'agent', true).id;
    agentAvatars.set(key, id);
  }
  if (e.event === 'PreToolUse')
    send(avatars.get(id), TOOL_STATION[e.tool] || 'lobby', `${e.tool}${e.detail ? ': ' + e.detail : ''}`);
}

function randomStation() {
  const names = ['terminal', 'archive', 'workshop', 'telephone'];
  return names[Math.floor(Math.random() * names.length)];
}

function tick(e) {
  const line = document.createElement('div');
  const time = new Date().toLocaleTimeString();
  line.innerHTML = `<span class="t">${time}</span>${e.event}${e.tool ? ' · ' + e.tool : ''}${e.detail ? ' · ' + e.detail : ''}`;
  ticker.prepend(line);
  while (ticker.children.length > 40) ticker.lastChild.remove();
}

setInterval(() => {                         // idle agents wander to stations
  for (const av of avatars.values())
    if (av.isAgent && !av.leaving && av.state === 'idle' && Math.random() < .35)
      send(av, randomStation());
}, 5000);

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
    if (av.bubble && t - av.bubble.t > 4700) av.bubble = null;
  }
  render(ctx, [...avatars.values()], t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const canvas = document.getElementById('hotel');
const tooltip = document.getElementById('tooltip');
canvas.addEventListener('mousemove', m => {
  const r = canvas.getBoundingClientRect();
  const mx = (m.clientX - r.left) * (canvas.width / r.width);
  const my = (m.clientY - r.top) * (canvas.height / r.height);
  let hit = null;
  for (const av of avatars.values()) {
    const { sx, sy } = iso(av.x, av.y);
    if (Math.abs(mx - sx) < 22 && my > sy - 40 && my < sy + 42) hit = av;
  }
  if (hit) {
    const secs = Math.round((performance.now() - (hit.since || performance.now())) / 1000);
    tooltip.textContent = `${hit.name} · ${hit.waiting ? 'waiting on you' : hit.state}`
      + `${hit.activity ? ' · ' + hit.activity : ''} · ${secs}s`;
    tooltip.style.left = `${m.clientX + 14}px`;
    tooltip.style.top = `${m.clientY + 14}px`;
    tooltip.style.display = 'block';
  } else tooltip.style.display = 'none';
});

const lamp = document.getElementById('lamp');
const source = new EventSource('/events');
source.onopen = () => lamp.classList.add('on');
source.onerror = () => lamp.classList.remove('on');
source.onmessage = m => handle(JSON.parse(m.data));

if (new URLSearchParams(location.search).has('demo')) {
  const script = [
    { event: 'SessionStart', session: 'demo1234' },
    { event: 'UserPromptSubmit', session: 'demo1234', detail: 'build me a hotel' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Read', detail: 'server.py' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Agent', agent_type: 'Explore', agent_name: 'survey the lobby' },
    { event: 'PreToolUse', session: 'demo1234', agent_id: 'scout01', agent_type: 'Explore', tool: 'Grep', detail: 'lobby' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Edit', detail: 'app.py', path: 'backend/api/app.py' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Agent', agent_type: 'Plan', agent_name: 'draw blueprints' },
    { event: 'PreToolUse', session: 'demo1234', agent_id: 'plan01', agent_type: 'Plan', tool: 'Read', detail: 'render.js' },
    { event: 'Notification', session: 'demo1234', detail: 'permission needed: Bash' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Bash', detail: 'just test' },
    { event: 'PreToolUse', session: 'demo1234', agent_id: 'scout01', agent_type: 'Explore', tool: 'WebSearch', detail: 'habbo furni' },
    { event: 'SubagentStop', session: 'demo1234', agent_id: 'scout01' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Write', detail: 'skyline.tsx', path: 'frontend/src/reading/skyline.tsx' },
    { event: 'SubagentStop', session: 'demo1234', agent_id: 'plan01' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Bash', detail: 'git commit -m ship', commit: true },
    { event: 'Stop', session: 'demo1234' },
  ];
  let i = 0;
  setInterval(() => handle(script[i++ % script.length]), 2600);
}
