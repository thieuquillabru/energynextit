/**
 * Persistence layer — single-document JSON store with atomic, debounced writes.
 *
 * The document holds agent *references* (agentId / endpointId / model) next to
 * employee metadata, so reopening the app restores the company and still points
 * at the same agents. Secrets (API keys) live in a separate 0600 file that is
 * never sent to the browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createInitialState } from './seed.mjs';

const ROOT = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.resolve(process.cwd(), 'data');
const STATE_FILE = path.join(ROOT, 'arena-office.json');
const SECRETS_FILE = path.join(ROOT, 'secrets.json');

fs.mkdirSync(ROOT, { recursive: true });

let state = null;
let secrets = null;
let writeTimer = null;
let writing = Promise.resolve();

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

export function load() {
  state = readJson(STATE_FILE, null);
  if (!state || !state.office || !Array.isArray(state.employees)) {
    state = createInitialState();
    persistNow();
  }
  secrets = readJson(SECRETS_FILE, {});
  // Never leak secrets into the public state document.
  return state;
}

export function getState() {
  if (!state) load();
  return state;
}

function persistNow() {
  try {
    atomicWrite(STATE_FILE, state);
    if (secrets) {
      atomicWrite(SECRETS_FILE, secrets);
      try { fs.chmodSync(SECRETS_FILE, 0o600); } catch { /* best effort */ }
    }
  } catch (err) {
    console.error('[storage] write failed:', err.message);
  }
}

/** Debounced save; returns a promise resolving once the write lands. */
export function save() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    writing = writing.then(() => persistNow());
  }, 60);
  return writing;
}

export function flush() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = null;
  persistNow();
}

export const uid = (prefix) => `${prefix}-${crypto.randomBytes(5).toString('hex')}`;
export const nowIso = () => new Date().toISOString();

export function logActivity(kind, text, meta = {}) {
  const s = getState();
  s.activity.unshift({ id: uid('act'), at: nowIso(), kind, text, ...meta });
  if (s.activity.length > 250) s.activity.length = 250;
  save();
}

/* ------------------------------- secrets -------------------------------- */

export function setSecret(endpointId, key) {
  if (!secrets) secrets = {};
  if (key) secrets[endpointId] = key;
  else delete secrets[endpointId];
  save();
}

export function getSecret(endpointId) {
  if (!secrets) secrets = {};
  return secrets[endpointId] || null;
}

export function hasSecret(endpointId) {
  return Boolean(getSecret(endpointId));
}

/** Public shape: keys are never serialised to the client. */
export function publicEndpoint(ep) {
  return {
    id: ep.id,
    label: ep.label,
    kind: ep.kind,
    baseUrl: ep.baseUrl || '',
    model: ep.model || '',
    path: ep.path || '',
    method: ep.method || '',
    headers: ep.headers || '',
    bodyTemplate: ep.bodyTemplate || '',
    responsePath: ep.responsePath || '',
    hasKey: hasSecret(ep.id),
    status: ep.status || 'unverified',
    note: ep.note || '',
    lastError: ep.lastError || null,
    verifiedAt: ep.verifiedAt || null,
    models: ep.models || [],
    createdAt: ep.createdAt,
  };
}
