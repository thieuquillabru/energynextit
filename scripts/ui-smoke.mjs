/**
 * Mounts the real React app in a JSDOM window with a stubbed 2D canvas and a
 * shimmed fetch, then drives a few interactions. Catches runtime errors that a
 * type-check and a production build cannot (bad hooks, undefined reads, crashes
 * in the scene loop).
 *
 * Not a visual test: it proves the app mounts, polls, renders panels and that
 * clicking a character opens the employee panel.
 */
import { JSDOM, VirtualConsole } from 'jsdom';
import http from 'node:http';
import { build } from 'esbuild';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 4176;
const MOCK_PORT = 4998;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-ui-test-'));
const errors = [];
let passed = 0;
let failed = 0;

const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`); }
};

/* ----------------------------- canvas stub ------------------------------- */

function makeContext() {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: null,
    measureText: () => ({ width: 20, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
    setTransform: () => {},
    save: () => {},
    restore: () => {},
    drawImage: () => {},
  };
  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'string') {
        return () => undefined;
      }
      return undefined;
    },
    set(obj, prop, value) {
      obj[prop] = value;
      return true;
    },
  });
}

const stubCanvas = {
  getContext: () => makeContext(),
  toDataURL: () => 'data:image/png;base64,',
};

/* --------------------------------- main ---------------------------------- */

const mockAgent = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* ignore */ }
    const last = (body.messages || []).filter((m) => m.role === 'user').pop();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      choices: [{ message: { content: `UI-TEST reply from ${body.agent}: ${String(last?.content || '').slice(0, 40)}` } }],
    }));
  });
});

let server;
try {
  await new Promise((r) => mockAgent.listen(MOCK_PORT, '127.0.0.1', r));
  await build({
    entryPoints: ['src/main.tsx'],
    bundle: true,
    format: 'iife',
    outfile: '/tmp/app-ui-test.js',
    define: { 'process.env.NODE_ENV': '"production"' },
    // Fonts are irrelevant to a DOM smoke test; drop the binary asset imports.
    loader: { '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty' },
    logLevel: 'error',
  });
  const bundle = fs.readFileSync('/tmp/app-ui-test.js', 'utf8');

  server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  server.stderr.on('data', (d) => process.stdout.write(`[office:err] ${d}`));

  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${BASE}/api/state`)).ok) break;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }

  // Wire a real agent through the API before the UI boots.
  const epRes = await fetch(`${BASE}/api/endpoints`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'openai', label: 'UI test agent', baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`, model: 'ui-model' }),
  });
  const epBody = await epRes.json();
  await fetch(`${BASE}/api/employees`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Orion', title: 'Backend Engineer', role: 'Developer', departmentId: 'dev', endpointId: epBody.id, agentRef: 'agent_ui_1' }),
  });

  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err) => {
    if (!/Not implemented/.test(err.message)) errors.push(`jsdomError: ${err.message}`);
  });
  virtualConsole.on('error', (...args) => errors.push(`console.error: ${args.join(' ')}`));

  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: `${BASE}/`,
    virtualConsole,
  });
  const { window } = dom;

  window.HTMLCanvasElement.prototype.getContext = stubCanvas.getContext;
  window.HTMLCanvasElement.prototype.toDataURL = stubCanvas.toDataURL;
  Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return 1280; } });
  Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 800; } });
  window.HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
    return { width: 1280, height: 800, top: 0, left: 0, right: 1280, bottom: 800, x: 0, y: 0, toJSON() {} };
  };
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    return fetch(url.startsWith('http') ? url : `${BASE}${url}`, init);
  };
  window.PointerEvent = window.PointerEvent || window.MouseEvent;
  if (!window.HTMLElement.prototype.setPointerCapture) {
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
  }
  let frames = 0;
  window.requestAnimationFrame = (cb) => {
    frames++;
    if (frames > 240) return 0;
    return setTimeout(() => cb(performance.now()), 16);
  };
  window.cancelAnimationFrame = (id) => clearTimeout(id);

  window.eval(bundle);

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(1500);

  const root = window.document.getElementById('root');
  check('app mounts', root && root.children.length > 0, `root children: ${root?.children.length}`);

  const text = () => root.textContent || '';

  check('office canvas exists', Boolean(root.querySelector('canvas')));
  check('onboarding modal is shown on first run', /Welcome to your virtual headquarters/.test(text()));
  check('onboarding states the Arena limitation', /does not expose your agents|no public agent API/i.test(text()));

  // dismiss onboarding
  const explore = [...root.querySelectorAll('button')].find((b) => /Explore first/.test(b.textContent || ''));
  check('onboarding has an explore action', Boolean(explore));
  explore?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(600);
  check('onboarding closes', !/Welcome to your virtual headquarters/.test(text()));

  // open the dashboard
  const dashboardBtn = root.querySelector('button[aria-label="Dashboard"]');
  check('side nav renders', Boolean(dashboardBtn));
  dashboardBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(500);
  check('dashboard panel renders', /Company overview/.test(text()));
  check('dashboard shows connected agents', /Connected agents/.test(text()));

  // open the directory and select an employee
  const dirBtn = root.querySelector('button[aria-label="Employee directory"]');
  dirBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(500);
  check('directory lists employees', /Nova/.test(text()) && /Placeholder|no agent attached/.test(text()));

  const empRow = [...root.querySelectorAll('button')].find((b) => /Nova/.test(b.textContent || '') && b.className.includes('emp-row'));
  check('directory row is clickable', Boolean(empRow));
  empRow?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(600);
  check('employee panel opens', /Agent identity/.test(text()));
  check('employee panel exposes agent reference row', /Agent ref/.test(text()));
  check('employee panel warns it is not connected', /Not connected|No Arena AI agent reference/i.test(text()));

  // switch to chat tab — must refuse to send
  const chatTab = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Chat');
  chatTab?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(400);
  check('chat tab explains the missing agent', /No live agent|not sent anywhere/i.test(text()));
  const textarea = root.querySelector('.chat-input textarea');
  check('chat input is disabled without an agent', Boolean(textarea?.disabled));

  // ---- real chat round-trip through the UI ----
  root.querySelector('button[aria-label="Employee directory"]')
    ?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(500);
  const allRows = [...root.querySelectorAll('button')].filter((b) => b.className.includes('emp-row'));
  const orionRow = allRows.find((b) => /Orion/.test(b.textContent || ''));
  check('connected employee appears in directory', Boolean(orionRow));
  orionRow?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(600);
  const chatTab2 = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Chat');
  chatTab2?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(400);
  const input = root.querySelector('.chat-input textarea');
  check('chat is enabled for a connected employee', Boolean(input) && !input.disabled);
  if (input) {
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setValue.call(input, 'What are you building?');
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    await wait(150);
    const sendBtn = [...root.querySelectorAll('button')].find((b) => /Send/.test(b.textContent || ''));
    sendBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(1500);
    check('UI shows the real agent reply', /UI-TEST reply from agent_ui_1/.test(text()), text().slice(-160));
    check('UI shows the user message', /What are you building\?/.test(text()));
  }

  // tasks panel
  const tasksBtn = root.querySelector('button[aria-label="Tasks"]');
  const zero = root.querySelector('button[aria-label="Dashboard"]');
  zero?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(300);
  tasksBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(500);
  check('task manager renders', /New task/.test(text()) && /No tasks in this view|Assign/.test(text()));

  // ---- create a task through the composer, for the connected employee ----
  const newTaskBtn = [...root.querySelectorAll('button')].find((b) => /New task/.test(b.textContent || ''));
  newTaskBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(400);
  check('task composer opens', /Assign a task/.test(text()));
  const titleInput = [...root.querySelectorAll('.modal input.input')].find((i) => /Q4 launch plan/.test(i.getAttribute('placeholder') || ''));
  check('composer has a title field', Boolean(titleInput));
  const select = root.querySelector('.modal select.select');
  if (select) {
    const setSelect = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    const orionOption = [...select.options].find((o) => /Orion/.test(o.textContent || ''));
    if (orionOption) {
      setSelect.call(select, orionOption.value);
      select.dispatchEvent(new window.Event('change', { bubbles: true }));
    }
  }
  if (titleInput) {
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setValue.call(titleInput, 'UI task smoke');
    titleInput.dispatchEvent(new window.Event('input', { bubbles: true }));
    await wait(150);
    const assign = [...root.querySelectorAll('.modal-foot button')].find((b) => /Assign & run/.test(b.textContent || ''));
    check('composer can submit', Boolean(assign) && !assign.disabled);
    assign?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    await wait(1800);
    check('task appears in the task manager', /UI task smoke/.test(text()));
    const done = /Completed/.test(text());
    check('task reaches a terminal real state', done, text().slice(-120));
  }

  // settings / connections
  const settingsBtn = root.querySelector('button[aria-label="Connections & settings"]');
  settingsBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(500);
  check('connection settings render', /Agent connections/.test(text()));
  check('integration report renders', /Public Arena agent API/.test(text()));
  check('simulation endpoint is listed', /Local simulation/.test(text()));

  const addEndpoint = [...root.querySelectorAll('button')].find((b) => /Add endpoint/.test(b.textContent || ''));
  check('add endpoint action exists', Boolean(addEndpoint));
  addEndpoint?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(300);
  check('endpoint modal opens', /Add an agent endpoint/.test(text()));
  const modalClose = [...root.querySelectorAll('.modal .icon-btn')][0];
  modalClose?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(200);

  // editor mode
  const editBtn = [...root.querySelectorAll('button')].find((b) => /Edit layout/.test(b.textContent || ''));
  editBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(400);
  check('layout editor opens', /Layout editor/.test(text()));
  check('editor exposes a furniture library', /Add furniture/.test(text()));

  check('no runtime errors were logged', errors.length === 0, errors.slice(0, 4).join(' | '));
} catch (err) {
  failed++;
  console.error('\nFATAL', err);
} finally {
  mockAgent.close();
  if (server) server.kill('SIGKILL');
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (errors.length) console.log('errors:\n - ' + errors.slice(0, 10).join('\n - '));
  process.exit(failed === 0 ? 0 : 1);
}
