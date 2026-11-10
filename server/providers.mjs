/**
 * Arena AI integration layer.
 *
 * WHY THIS IS AN ADAPTER, NOT A CLIENT FOR A FAKE ARENA API
 * ---------------------------------------------------------
 * Arena AI (arena.ai) does not publish a public API, SDK, webhook or session
 * protocol for Agent Mode as of 2026-11-10, and its Terms of Use (5(vi))
 * prohibit programmatic/automated access to the service. We therefore do not
 * invent endpoints, scrape the site, or drive a browser. Instead every employee
 * is bound to a *user-authorised endpoint* that resolves to one concrete agent:
 *
 *   kind "openai"   -> any OpenAI-compatible /chat/completions endpoint
 *                      (the usual shape for self-hosted bridges and gateways)
 *   kind "custom"   -> fully templated HTTP request, for a private agent runtime
 *                      that exposes anything else
 *   kind "simulation"-> local placeholder text, ALWAYS labelled as simulation
 *
 * The office sends messages only through those endpoints; it never substitutes
 * a different model on its own. If nothing is configured, agents are marked
 * `offline` instead of receiving an imitation reply.
 */

const DEFAULT_TIMEOUT = Number(process.env.AGENT_TIMEOUT_MS || 180_000);

export class AgentError extends Error {
  constructor(message, code = 'agent_error', detail = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

/* ----------------------------- helpers -------------------------------- */

function joinUrl(base, suffix) {
  if (!base) return suffix;
  const b = base.replace(/\/+$/, '');
  if (!suffix) return b;
  if (/^https?:\/\//i.test(suffix)) return suffix;
  return `${b}${suffix.startsWith('/') ? '' : '/'}${suffix}`;
}

function parseHeaders(raw, key) {
  const headers = { 'Content-Type': 'application/json' };
  if (raw && raw.trim()) {
    const text = raw.trim();
    if (text.startsWith('{')) {
      try {
        Object.assign(headers, JSON.parse(text));
      } catch {
        throw new AgentError('Custom headers must be valid JSON when using { } notation.', 'bad_config');
      }
    } else {
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const idx = line.indexOf(':');
        if (idx === -1) continue;
        headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
      }
    }
  }
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export function pickPath(obj, selector) {
  if (!obj || !selector) return undefined;
  const parts = String(selector).replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function normaliseContent(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const parts = value
      .map((v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object') return v.text || v.content || '';
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
    return null;
  }
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text;
    if (typeof value.content === 'string') return value.content;
    if (Array.isArray(value.content)) return normaliseContent(value.content);
  }
  return null;
}

/** Try the common response shapes, then fall back to a shallow scan. */
export function extractText(payload, selector) {
  if (selector) {
    const picked = pickPath(payload, selector);
    const t = normaliseContent(picked);
    if (t != null) return t;
  }
  const candidates = [
    ['choices', '0', 'message', 'content'],
    ['choices', '0', 'text'],
    ['output_text'],
    ['message', 'content'],
    ['response'],
    ['result'],
    ['content'],
    ['text'],
    ['data', 'content'],
    ['data', 'text'],
    ['data', 'result'],
    ['answer'],
  ];
  for (const c of candidates) {
    const t = normaliseContent(pickPath(payload, c.join('.')));
    if (t != null && t !== '') return t;
  }
  return null;
}

/**
 * Replace {{placeholders}} in a template.
 *
 * If the template is JSON and a placeholder sits inside a quoted string, the
 * value is JSON-escaped — otherwise a multi-line prompt injects real newlines
 * and the request body becomes invalid JSON (which broke agent calls with
 * multi-paragraph task prompts).
 */
function fillTemplate(template, vars) {
  const tpl = String(template);
  const jsonLike = /^\s*[\[{]/.test(tpl);
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, name, offset) => {
    if (!(name in vars)) return match;
    const value = vars[name];
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    if (!jsonLike || text === undefined) return text;
    const quotesBefore = (tpl.slice(0, offset).match(/(?<!\\)"/g) || []).length;
    if (quotesBefore % 2 === 0) return text; // not inside a quoted string
    return text
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  });
}

/* --------------------------- simulator -------------------------------- */

function simulate(endpoint, agent, messages, meta) {
  const last = [...messages].reverse().find((m) => m.role === 'user');
  const prompt = (last?.content || meta?.title || '').trim();
  const topic = prompt.length > 160 ? `${prompt.slice(0, 157)}…` : prompt;
  const name = agent?.name || 'Employee';

  const body = [
    `**[LOCAL SIMULATION — not Arena AI output]**`,
    '',
    `${name} is a demo placeholder. No Arena AI agent was contacted and no model was called. This reply was generated by the office's built-in simulator so the interface can be explored before you connect real agents.`,
    '',
    prompt
      ? `You asked: “${topic}”\n\nA connected agent would answer here, in its own voice, with its own model, tools and context.`
      : 'Connect a real endpoint in Connection Settings to replace this placeholder with your actual agent.',
  ].join('\n');

  return { ok: true, text: body, simulated: true, endpointId: endpoint?.id || 'sim', model: 'simulation' };
}

/* ----------------------------- request -------------------------------- */

async function httpJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not json */ }
    if (!res.ok) {
      const snippet = text.slice(0, 600).replace(/\s+/g, ' ').trim();
      throw new AgentError(
        `Endpoint returned HTTP ${res.status}${snippet ? `: ${snippet}` : ''}`,
        `http_${res.status}`,
        { status: res.status, body: snippet },
      );
    }
    if (json == null) {
      throw new AgentError('Endpoint did not return JSON.', 'bad_response', { body: text.slice(0, 600) });
    }
    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AgentError(`The agent did not answer within ${Math.round(timeoutMs / 1000)}s.`, 'timeout');
    }
    if (err instanceof AgentError) throw err;
    throw new AgentError(`Could not reach the endpoint: ${err.message}`, 'network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a conversation to the concrete agent behind an endpoint.
 * @returns {Promise<{ok:boolean,text?:string,error?:string,code?:string,simulated?:boolean,model?:string,endpointId?:string}>}
 */
export async function runAgent({ endpoint, agent, messages, apiKey, meta = {} }) {
  if (!endpoint) {
    return { ok: false, code: 'no_endpoint', error: 'This employee has no endpoint configured, so the agent cannot be reached.' };
  }
  if (endpoint.kind === 'simulation') {
    return simulate(endpoint, agent, messages, meta);
  }

  const model = agent?.model || endpoint.model || '';
  const vars = {
    model,
    agent: agent?.ref || '',
    agent_id: agent?.ref || '',
    agent_name: agent?.name || '',
    messages,
    system: agent?.instructions || '',
    prompt: [...messages].reverse().find((m) => m.role === 'user')?.content || meta?.title || '',
    task: meta?.task || null,
  };

  try {
    if (endpoint.kind === 'openai') {
      if (!endpoint.baseUrl) throw new AgentError('This endpoint has no base URL.', 'bad_config');
      if (!model) throw new AgentError('No model name is set for this employee.', 'bad_config');
      const url = joinUrl(endpoint.baseUrl, endpoint.path || '/chat/completions');
      const body = { model, messages };
      if (agent?.agentRef) body.agent = agent.agentRef;
      const json = await httpJson(url, {
        method: 'POST',
        headers: parseHeaders(endpoint.headers, apiKey),
        body: JSON.stringify(body),
        signal: null,
      }, endpoint.timeoutMs || DEFAULT_TIMEOUT);
      const text = extractText(json, endpoint.responsePath);
      if (!text) throw new AgentError('The endpoint answered, but no text could be extracted from the response.', 'empty_response', json);
      return { ok: true, text, simulated: false, model, endpointId: endpoint.id };
    }

    if (endpoint.kind === 'custom') {
      if (!endpoint.baseUrl) throw new AgentError('This endpoint has no URL.', 'bad_config');
      const url = fillTemplate(endpoint.baseUrl, vars);
      const method = (endpoint.method || 'POST').toUpperCase();
      const headers = parseHeaders(endpoint.headers, apiKey);
      let body;
      if (method !== 'GET' && method !== 'HEAD') {
        if (endpoint.bodyTemplate && endpoint.bodyTemplate.trim()) {
          body = fillTemplate(endpoint.bodyTemplate, vars);
          if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
        } else {
          body = JSON.stringify({ agent: vars.agent, model, messages, prompt: vars.prompt });
        }
      }
      const json = await httpJson(url, { method, headers, body, signal: null }, endpoint.timeoutMs || DEFAULT_TIMEOUT);
      const text = extractText(json, endpoint.responsePath);
      if (!text) throw new AgentError('The endpoint answered, but no text could be extracted from the response.', 'empty_response', json);
      return { ok: true, text, simulated: false, model, endpointId: endpoint.id };
    }

    throw new AgentError(`Unknown endpoint kind "${endpoint.kind}".`, 'bad_config');
  } catch (err) {
    const e = err instanceof AgentError ? err : new AgentError(err.message || 'Unknown failure', 'unknown');
    return { ok: false, code: e.code, error: e.message, detail: e.detail, endpointId: endpoint.id };
  }
}

/* ---------------------------- discovery ------------------------------- */

export async function testEndpoint(endpoint, apiKey) {
  if (endpoint.kind === 'simulation') {
    return { ok: true, status: 'ready', message: 'Local simulator ready — no agent will be contacted.', models: ['simulation'] };
  }
  try {
    if (endpoint.kind === 'openai') {
      if (!endpoint.baseUrl) throw new AgentError('A base URL is required.', 'bad_config');
      const url = joinUrl(endpoint.baseUrl, endpoint.modelsPath || '/models');
      try {
        const json = await httpJson(url, { method: 'GET', headers: parseHeaders(endpoint.headers, apiKey) }, 20_000);
        const list = (json?.data || json?.models || []).map((m) => (typeof m === 'string' ? m : m.id || m.name)).filter(Boolean);
        return {
          ok: true,
          status: 'verified',
          message: list.length ? `Reached the endpoint. ${list.length} model(s) listed.` : 'Reached the endpoint.',
          models: list,
        };
      } catch (err) {
        // A /models 404 does not prove the chat route is broken; report honestly.
        return {
          ok: false,
          status: 'unverified',
          message: `The endpoint is reachable but ${err.message.startsWith('Endpoint returned HTTP 404') ? 'it does not expose a model list' : `verification failed (${err.message})`}. You can still save it and test with a real message.`,
          models: [],
          soft: true,
        };
      }
    }
    // custom: verification is a real message, because the shape is arbitrary.
    return { ok: false, status: 'unverified', soft: true, message: 'Custom endpoints are verified by sending a message.', models: [] };
  } catch (err) {
    return { ok: false, status: 'error', message: err.message, models: [] };
  }
}
