/**
 * Headless pixel probe for the BUILT bundle.
 *
 * The UI smoke test stubs the 2D context, so it proves the DOM works but not
 * that anything is painted. This runs the real dist bundle against a real
 * server, backs every <canvas> with a native rasteriser, then reads back the
 * office canvas and asserts that the scene is actually drawn.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { JSDOM, VirtualConsole } from 'jsdom';
import { createCanvas } from '@napi-rs/canvas';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PROBE_PORT || 4581);
const VIEW = { width: 1360, height: 820 };

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------- real server, throwaway data ---------------------- */

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'office-render-'));
const api = spawn(process.execPath, ['server/index.mjs'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: dataDir },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let apiLog = '';
api.stdout.on('data', (d) => { apiLog += d; });
api.stderr.on('data', (d) => { apiLog += d; });

const base = `http://127.0.0.1:${PORT}`;
let ready = false;
for (let i = 0; i < 120; i++) {
  try { if ((await fetch(`${base}/api/state`)).ok) { ready = true; break; } } catch {}
  await wait(100);
}
if (!ready) {
  console.error('server did not start:\n' + apiLog);
  api.kill('SIGTERM');
  process.exit(1);
}

/* --------------------------------- DOM ----------------------------------- */

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const scriptSrc = html.match(/src="([^"]+\.js)"/)?.[1];
if (!scriptSrc) { console.error('dist/index.html has no bundle'); process.exit(1); }
const bundle = fs.readFileSync(path.join(DIST, scriptSrc.replace(/^\//, '')), 'utf8');

const errors = [];
const vc = new VirtualConsole();
vc.on('error', (e) => errors.push(String(e?.message || e)));
vc.on('jsdomError', (e) => errors.push(String(e?.message || e)));

const dom = new JSDOM(html, {
  url: `${base}/`,
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
window.Element.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, top: 0, left: 0, width: VIEW.width, height: VIEW.height, right: VIEW.width, bottom: VIEW.height };
};

/**
 * Native backing store per canvas element, re-created whenever the element's
 * width/height attributes change (exactly what a browser does). All access goes
 * through a proxy so drawing state survives the swap.
 */
const backing = new Map(); // element -> { w, h, canvas, ctx }

function syncBacking(el) {
  const w = Math.max(1, Math.round(el.width || 1));
  const h = Math.max(1, Math.round(el.height || 1));
  const current = backing.get(el);
  if (current && current.w === w && current.h === h) return current;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const native = (img) => (img && typeof img === 'object' && backing.has(img) ? backing.get(img).canvas : img);
  const pattern = ctx.createPattern.bind(ctx);
  ctx.createPattern = (img, rep) => pattern(native(img), rep);
  const drawImage = ctx.drawImage.bind(ctx);
  ctx.drawImage = (img, ...rest) => drawImage(native(img), ...rest);
  const entry = { w, h, canvas, ctx };
  backing.set(el, entry);
  return entry;
}

const contextProxies = new WeakMap();
window.HTMLCanvasElement.prototype.getContext = function (type) {
  if (type !== '2d') return null;
  let proxy = contextProxies.get(this);
  if (proxy) return proxy;
  const el = this;
  proxy = new Proxy({}, {
    get(_t, prop) {
      const { ctx } = syncBacking(el);
      const value = ctx[prop];
      return typeof value === 'function' ? value.bind(ctx) : value;
    },
    set(_t, prop, value) {
      const { ctx } = syncBacking(el);
      ctx[prop] = value;
      return true;
    },
  });
  contextProxies.set(this, proxy);
  return proxy;
};
Object.defineProperty(window.HTMLCanvasElement.prototype, 'toDataURL', {
  value() {
    const e = syncBacking(this);
    return `data:image/png;base64,${e.canvas.toBuffer('image/png').toString('base64')}`;
  },
  configurable: true,
});

window.ResizeObserver = class {
  constructor(cb) { this.cb = cb; }
  observe(el) { this.cb([{ target: el, contentRect: { width: VIEW.width, height: VIEW.height } }], this); }
  unobserve() {}
  disconnect() {}
};

let rafQueue = [];
window.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
window.cancelAnimationFrame = () => {};

const nativeFetch = globalThis.fetch;
window.fetch = (input, init) => {
  const href = typeof input === 'string' ? input : input?.url;
  return nativeFetch(new URL(href, `${base}/`).toString(), init);
};

/* ------------------------------- run app --------------------------------- */

window.eval(bundle);
await wait(700);

for (let i = 0; i < 40; i++) {
  const queue = rafQueue;
  rafQueue = [];
  for (const cb of queue) {
    try { cb(i * 16); } catch (e) { errors.push(`rAF: ${e.message}`); }
  }
  await wait(16);
}

const doc = window.document;
const text = () => doc.body.textContent || '';

check('app mounted', Boolean(doc.querySelector('.app')), text().slice(0, 100));
check('no boot error screen', !/could not reach|failed to load/i.test(text()));
check('navigation rendered', /Dashboard|Directory|Tasks/i.test(text()));

const canvas = doc.querySelector('.stage canvas');
check('office canvas exists', Boolean(canvas));

if (canvas) {
  const { canvas: raster } = syncBacking(canvas);
  console.log(`    office canvas ${raster.width}x${raster.height} (css ${canvas.style.width || '?'} x ${canvas.style.height || '?'})`);
  check('canvas covers the viewport', raster.width >= VIEW.width && raster.height >= VIEW.height,
    `${raster.width}x${raster.height}`);

  const { data } = raster.getContext('2d').getImageData(0, 0, raster.width, raster.height);
  let painted = 0;
  let colourful = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (r + g + b > 30) painted++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 16) colourful++;
  }
  const total = data.length / 4;
  const paintedPct = (painted / total) * 100;
  const colourfulPct = (colourful / total) * 100;
  console.log(`    painted ${paintedPct.toFixed(1)}% | colourful ${colourfulPct.toFixed(1)}%`);
  check('office is not a black screen', paintedPct > 40, `only ${paintedPct.toFixed(1)}% drawn`);
  check('office has floor/wall/furniture detail', colourfulPct > 2, `only ${colourfulPct.toFixed(1)}% non-grey`);

  const out = path.join(ROOT, 'preview-browser.png');
  fs.writeFileSync(out, raster.toBuffer('image/png'));
  console.log(`    wrote ${path.relative(ROOT, out)}`);
}

check('no runtime errors', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail && apiLog) console.log(`server log:\n${apiLog.slice(-500)}`);
api.kill('SIGTERM');
await wait(150);
try { fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 3 }); } catch {}
process.exit(fail ? 1 : 0);
