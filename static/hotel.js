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
const agentQueues = new Map();
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
  const main = ensureMain(e.session || '????');
  if (e.event === 'UserPromptSubmit') send(main, 'reception', e.detail);
  else if (e.event === 'PreToolUse' && e.tool === 'Task') {
    const id = `agent:${e.session}:${agentCount++}`;
    send(spawn(id, e.agent_type || 'agent', true), randomStation(), e.agent_name);
    agentQueues.set(e.session, [...(agentQueues.get(e.session) || []), id]);
  } else if (e.event === 'PreToolUse')
    send(main, TOOL_STATION[e.tool] || 'lobby', `${e.tool}${e.detail ? ': ' + e.detail : ''}`);
  else if (e.event === 'SubagentStop') {
    const queue = agentQueues.get(e.session) || [];
    const id = queue.shift();
    if (id && avatars.has(id)) checkout(avatars.get(id));
  } else if (e.event === 'Stop') send(main, 'lobby', 'at your leisure');
  else if (e.event === 'SessionEnd')
    [...avatars.values()].filter(av => av.id.includes(e.session)).forEach(checkout);
  tick(e);
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
    if (av.isAgent && !av.leaving && av.state !== 'walking' && Math.random() < .35)
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
    { event: 'PreToolUse', session: 'demo1234', tool: 'Task', agent_type: 'Explore', agent_name: 'survey the lobby' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Edit', detail: 'hotel.js' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Task', agent_type: 'Plan', agent_name: 'draw blueprints' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Bash', detail: 'just test' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'WebSearch', detail: 'habbo furni' },
    { event: 'SubagentStop', session: 'demo1234' },
    { event: 'PreToolUse', session: 'demo1234', tool: 'Write', detail: 'render.js' },
    { event: 'SubagentStop', session: 'demo1234' },
    { event: 'Stop', session: 'demo1234' },
  ];
  let i = 0;
  setInterval(() => handle(script[i++ % script.length]), 2600);
}
