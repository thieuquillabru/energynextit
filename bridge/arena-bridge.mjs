#!/usr/bin/env node
/**
 * Arena Office — local agent bridge
 * ----------------------------------------------------------------------------
 * READ THIS FIRST
 *
 * Arena.ai does not publish an agent/session API, and its Terms of Use prohibit
 * programmatic access to the Arena service. This bridge therefore contains **no
 * Arena endpoints and no scraping**. It is a plug socket: it exposes an
 * OpenAI-compatible HTTP surface on your own machine, and forwards each call to
 * an upstream you are entitled to use, using credentials that never leave your
 * machine.
 *
 * You have two ways to answer a call:
 *
 *   1. upstream — any HTTP endpoint you can legally call:
 *        { "upstream": "https://my-gateway/v1/chat/completions",
 *          "model": "my-model", "keyEnv": "MY_KEY" }
 *
 *   2. adapter — a small JS module you write for a proprietary agent runtime:
 *        { "adapter": "my-agents.mjs" }
 *      exporting: export async function send({ agentId, model, messages, config })
 *
 * If nothing is configured for an agent, the bridge answers 501 with an explicit
 * message instead of inventing a reply. Nothing is ever silently substituted.
 *
 * Usage:
 *   node bridge/arena-bridge.mjs            # uses bridge/config.json
 *   PORT=8787 node bridge/arena-bridge.mjs
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CONFIG_FILE = process.env.BRIDGE_CONFIG || path.join(ROOT, 'config.json');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

let config = { agents: {} };
if (fs.existsSync(CONFIG_FILE)) {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    console.error(`Could not parse ${CONFIG_FILE}: ${err.message}`);
    process.exit(1);
  }
} else {
  console.warn(`[bridge] no config at ${CONFIG_FILE} — every call will return 501 until you create one.`);
}

const adapters = new Map();
async function loadAdapter(file) {
  if (adapters.has(file)) return adapters.get(file);
  const full = path.join(ROOT, 'adapters', file);
  if (!fs.existsSync(full)) throw new Error(`Adapter not found: ${full}`);
  const mod = await import(pathToFileURL(full).href);
  if (typeof mod.send !== 'function') throw new Error(`Adapter ${file} must export a send() function`);
  adapters.set(file, mod);
  return mod;
}

function agentConfig(id) {
  const agents = config.agents || {};
  return agents[id] || agents['*'] || null;
}

function extractText(payload) {
  if (!payload) return null;
  if (typeof payload === 'string') return payload;
  const candidates = [
    payload.choices?.[0]?.message?.content,
    payload.choices?.[0]?.text,
    payload.output_text,
    payload.text,
    payload.content,
    payload.result,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c;
    if (Array.isArray(c)) {
      const joined = c.map((p) => p?.text || p?.content || '').join('\n').trim();
      if (joined) return joined;
    }
  }
  return null;
}

async function forward(cfg, { agentId, model, messages }) {
  if (cfg.adapter) {
    const mod = await loadAdapter(cfg.adapter);
    const text = await mod.send({ agentId, model, messages, config: cfg });
    if (typeof text !== 'string') throw new Error('Adapter did not return a string');
    return text;
  }
  if (cfg.upstream) {
    const key = cfg.keyEnv ? process.env[cfg.keyEnv] : (cfg.apiKey || null);
    if (cfg.keyEnv && !key) throw new Error(`Environment variable ${cfg.keyEnv} is not set`);
    const headers = { 'Content-Type': 'application/json', ...(cfg.headers || {}) };
    if (key) headers.Authorization = `Bearer ${key}`;
    const body = cfg.bodyTemplate
      ? cfg.bodyTemplate
        .replace('{{model}}', model || cfg.model || '')
        .replace('{{agent}}', agentId)
        .replace('{{messages}}', JSON.stringify(messages))
        .replace('{{prompt}}', [...messages].reverse().find((m) => m.role === 'user')?.content || '')
      : JSON.stringify({ model: model || cfg.model, messages, agent: agentId });
    const res = await fetch(cfg.upstream, { method: 'POST', headers, body });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) throw new Error(`Upstream HTTP ${res.status}: ${text.slice(0, 300)}`);
    const out = cfg.responsePath
      ? cfg.responsePath.split('.').reduce((o, k) => (o == null ? o : o[k]), json)
      : extractText(json);
    if (!out) throw new Error('Upstream answered but no text could be extracted');
    return typeof out === 'string' ? out : JSON.stringify(out);
  }
  const err = new Error(
    `No transport configured for agent "${agentId}". Add an "upstream" or an "adapter" for it in ${CONFIG_FILE}. `
    + 'Arena AI itself publishes no agent API, so there is nothing to call by default.',
  );
  err.statusCode = 501;
  throw err;
}

const server = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    return res.end();
  }

  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return send(200, {
      ok: true,
      service: 'arena-office-bridge',
      note: 'Forwards to user-configured transports. No Arena endpoints are called.',
      configuredAgents: Object.keys(config.agents || {}),
    });
  }

  if (req.method === 'GET' && req.url.startsWith('/v1/models')) {
    const ids = Object.keys(config.agents || {}).filter((k) => k !== '*');
    return send(200, { data: (ids.length ? ids : ['unconfigured']).map((id) => ({ id, object: 'model' })) });
  }

  if (req.method === 'POST' && req.url.startsWith('/v1/chat/completions')) {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', async () => {
      let body = {};
      try { body = JSON.parse(raw || '{}'); } catch {
        return send(400, { error: { message: 'Invalid JSON body' } });
      }
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const agentId = body.agent || body.agent_id || body.model || 'default';
      const cfg = agentConfig(agentId);
      if (!cfg) {
        return send(501, {
          error: {
            message: `No transport configured for "${agentId}". Edit bridge/config.json (see config.example.json). `
              + 'Arena AI does not provide a public agent API, so this bridge will not pretend to reach it.',
          },
        });
      }
      try {
        const text = await forward(cfg, { agentId, model: body.model, messages });
        return send(200, {
          id: `bridge-${Date.now()}`,
          object: 'chat.completion',
          model: body.model || cfg.model || 'unknown',
          choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        });
      } catch (err) {
        return send(err.statusCode || 502, { error: { message: err.message } });
      }
    });
    return undefined;
  }

  return send(404, { error: { message: 'Not found' } });
});

server.listen(PORT, HOST, () => {
  console.log(`Arena Office bridge on http://${HOST}:${PORT}`);
  console.log(`Config: ${CONFIG_FILE}`);
  console.log('This bridge calls only the upstreams you configure. It never contacts arena.ai.');
});
