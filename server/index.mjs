import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  load, getState, save, flush, uid, nowIso, logActivity,
  setSecret, getSecret, hasSecret, publicEndpoint,
} from './db.mjs';
import { runAgent, testEndpoint } from './providers.mjs';
import { createInitialState, migrateLayout } from './seed.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

load();

// A task can only be "running" while a request is in flight. After a restart
// nothing is in flight, so be honest about it instead of leaving it spinning.
let interrupted = 0;
for (const task of getState().tasks) {
  if (task.status === 'running') {
    task.status = 'failed';
    task.error = 'Interrupted: the office server restarted while this task was running. Run it again to get a real result.';
    task.completedAt = nowIso();
    interrupted += 1;
  }
}
if (interrupted) {
  logActivity('system', `${interrupted} task(s) marked failed after a server restart.`);
  save();
}

// Older stores have desk rows tight against the room's top wall, which pushes a
// seated character's head into the wall. Snap them onto the current layout.
if (migrateLayout(getState().office)) save();

const app = express();
app.use(express.json({ limit: '8mb' }));

/* ------------------------------ helpers -------------------------------- */

const runningTasks = new Set();

function state() {
  return getState();
}

function endpointById(id) {
  return state().endpoints.find((e) => e.id === id) || null;
}

function employeeById(id) {
  return state().employees.find((e) => e.id === id) || null;
}

function departmentById(id) {
  return state().departments.find((d) => d.id === id) || null;
}

/** Resolve the real agent bound to an employee, or null when it is not linked. */
function resolveAgent(employee) {
  if (!employee) return { agent: null, endpoint: null, error: 'Employee not found.' };
  const ref = employee.agent || {};
  if (employee.status === 'disconnected') {
    return {
      agent: { id: employee.id, name: employee.name, ref: ref.ref || null, model: ref.model || null, agentRef: ref.ref || null },
      endpoint: null,
      error: 'This employee is disconnected. Reconnect it before sending work.',
    };
  }
  const endpoint = ref.endpointId ? endpointById(ref.endpointId) : null;
  const agent = {
    id: employee.id,
    name: employee.name,
    ref: ref.ref || null,
    model: ref.model || null,
    instructions: ref.instructions || null,
    agentRef: ref.ref || null,
  };
  if (!ref.ref && !ref.endpointId) {
    return { agent, endpoint: null, error: 'This employee has no Arena AI agent reference attached.' };
  }
  if (!endpoint) {
    return { agent, endpoint: null, error: 'The endpoint this employee was linked to has been removed.' };
  }
  return { agent, endpoint, error: null };
}

function derivedEmployee(emp) {
  const { endpoint, error } = resolveAgent(emp);
  const active = state().tasks.find((t) => t.employeeId === emp.id && t.status === 'running');
  const meeting = state().meetings.find((m) => m.status === 'active' && m.participantIds.includes(emp.id));
  let status = 'idle';
  if (!endpoint) status = emp.simulated ? 'simulated' : 'offline';
  if (active) status = 'working';
  if (meeting && !active) status = 'meeting';
  if (emp.status === 'disconnected') status = 'disconnected';
  return {
    ...emp,
    status,
    activeTaskId: active ? active.id : null,
    meetingId: meeting ? meeting.id : null,
    endpointLabel: endpoint ? endpoint.label : null,
    endpointKind: endpoint ? endpoint.kind : null,
    connectionError: error || (endpoint && endpoint.status === 'error' ? endpoint.lastError : null),
    agentResolved: Boolean(emp.agent?.ref && endpoint),
  };
}

function departmentActivity() {
  const s = state();
  return s.departments.map((d) => {
    const people = s.employees.filter((e) => e.departmentId === d.id);
    const tasks = s.tasks.filter((t) => t.departmentId === d.id);
    return {
      id: d.id,
      name: d.name,
      employees: people.length,
      running: tasks.filter((t) => t.status === 'running').length,
      pending: tasks.filter((t) => ['pending', 'assigned', 'waiting'].includes(t.status)).length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      failed: tasks.filter((t) => t.status === 'failed').length,
      openTasks: tasks.filter((t) => !['completed', 'cancelled'].includes(t.status)).length,
    };
  });
}

function snapshot() {
  const s = state();
  const employees = s.employees.map(derivedEmployee);
  const connected = employees.filter((e) => e.agentResolved);
  const simulated = employees.filter((e) => e.simulated && !e.agentResolved);
  const counts = {
    employees: employees.length,
    connected: connected.length,
    simulated: simulated.length,
    active: employees.filter((e) => ['working', 'meeting'].includes(e.status)).length,
    working: employees.filter((e) => e.status === 'working').length,
    idle: employees.filter((e) => e.status === 'idle').length,
    offline: employees.filter((e) => ['offline', 'disconnected'].includes(e.status)).length,
    meetings: s.meetings.filter((m) => m.status === 'active').length,
    pending: s.tasks.filter((t) => ['pending', 'assigned', 'waiting'].includes(t.status)).length,
    running: s.tasks.filter((t) => t.status === 'running').length,
    completed: s.tasks.filter((t) => t.status === 'completed').length,
    failed: s.tasks.filter((t) => t.status === 'failed').length,
    cancelled: s.tasks.filter((t) => t.status === 'cancelled').length,
    projects: s.projects.length,
    departments: s.departments.length,
  };
  return {
    ...s,
    endpoints: s.endpoints.map(publicEndpoint),
    employees,
    counts,
    departmentActivity: departmentActivity(),
    runningTasks: [...runningTasks],
    serverTime: nowIso(),
    integration: {
      arenaPublicApi: false,
      note: 'Arena AI does not publish a public agent/session API. Employees are bound to user-authorised endpoints.',
    },
  };
}

function runInBackground(promise, label) {
  promise.catch((err) => console.error(`[${label}]`, err));
}

function addActivity(kind, text, meta) {
  logActivity(kind, text, meta);
}

/* -------------------------------- state -------------------------------- */

app.get('/api/state', (_req, res) => {
  res.json(snapshot());
});

app.get('/api/integration-info', (_req, res) => {
  res.json({
    checkedAt: '2026-11-10',
    platform: 'Arena.ai (Agent Mode)',
    publicApi: false,
    sdk: false,
    agentSessionApi: false,
    webhooks: false,
    conversationAccess: false,
    modelConfigAccess: false,
    toolAccess: false,
    auth: 'Browser session only; no documented machine-to-machine credential for Agent Mode.',
    termsNote: 'Arena Terms of Use §5(vi) prohibit programmatic or automated access to the Service. The office therefore never scrapes or automates arena.ai.',
    conclusion:
      'There is no supported way for an external application to reach the exact Agent Mode sessions you use on arena.ai. The office binds each employee to an endpoint you are authorised to call (a self-hosted bridge, a gateway, or a private agent runtime), so no model or agent is ever substituted silently.',
    supportedPaths: [
      { kind: 'openai', label: 'OpenAI-compatible endpoint', detail: 'POST {baseUrl}/chat/completions with a model and messages. Works with self-hosted bridges, gateways and private runtimes.' },
      { kind: 'custom', label: 'Templated HTTP endpoint', detail: 'Any request shape, with {{agent_id}}, {{model}}, {{messages}}, {{prompt}} placeholders and a JSON response path.' },
      { kind: 'simulation', label: 'Local simulation', detail: 'Placeholder text generated in the app, always labelled as simulation and excluded from "connected" counts.' },
    ],
  });
});

app.patch('/api/settings', (req, res) => {
  const s = state();
  s.settings = { ...s.settings, ...req.body, firstRun: s.settings.firstRun };
  if (req.body && req.body.completeOnboarding) s.settings.firstRun = false;
  save();
  res.json(snapshot().settings);
});

/* ------------------------------- endpoints ----------------------------- */

app.post('/api/endpoints', (req, res) => {
  const s = state();
  const { label, kind, baseUrl, model, path: reqPath, method, headers, bodyTemplate, responsePath, apiKey, note } = req.body || {};
  if (!kind || !['openai', 'custom', 'simulation'].includes(kind)) {
    return res.status(400).json({ error: 'kind must be one of openai, custom, simulation' });
  }
  const ep = {
    id: uid('ep'),
    label: label || (kind === 'simulation' ? 'Local simulation' : 'Untitled endpoint'),
    kind,
    baseUrl: baseUrl || '',
    model: model || '',
    path: reqPath || '',
    method: method || '',
    headers: headers || '',
    bodyTemplate: bodyTemplate || '',
    responsePath: responsePath || '',
    status: 'unverified',
    note: note || '',
    models: [],
    createdAt: nowIso(),
  };
  s.endpoints.push(ep);
  if (apiKey) setSecret(ep.id, apiKey);
  addActivity('system', `Endpoint "${ep.label}" added (${kind}).`);
  save();
  res.status(201).json(publicEndpoint(ep));
});

app.patch('/api/endpoints/:id', (req, res) => {
  const ep = endpointById(req.params.id);
  if (!ep) return res.status(404).json({ error: 'Endpoint not found' });
  const b = req.body || {};
  for (const k of ['label', 'baseUrl', 'model', 'path', 'method', 'headers', 'bodyTemplate', 'responsePath', 'note', 'kind']) {
    if (b[k] !== undefined) ep[k] = b[k];
  }
  if (b.apiKey !== undefined) setSecret(ep.id, b.apiKey || null);
  if (b.clearVerification) { ep.status = 'unverified'; ep.lastError = null; ep.verifiedAt = null; }
  save();
  res.json(publicEndpoint(ep));
});

app.delete('/api/endpoints/:id', (req, res) => {
  const s = state();
  const ep = endpointById(req.params.id);
  if (!ep) return res.status(404).json({ error: 'Endpoint not found' });
  if (ep.kind === 'simulation') return res.status(400).json({ error: 'The local simulator cannot be deleted.' });
  const linked = s.employees.filter((e) => e.agent?.endpointId === ep.id);
  s.endpoints = s.endpoints.filter((e) => e.id !== ep.id);
  setSecret(ep.id, null);
  linked.forEach((e) => {
    e.agent.endpointId = null;
    if (e.agent.source !== 'template') e.connected = false;
  });
  addActivity('system', `Endpoint "${ep.label}" deleted. ${linked.length} employee(s) disconnected.`);
  save();
  res.json({ ok: true, disconnected: linked.length });
});

app.post('/api/endpoints/:id/test', async (req, res) => {
  const ep = endpointById(req.params.id);
  if (!ep) return res.status(404).json({ error: 'Endpoint not found' });
  const result = await testEndpoint(ep, getSecret(ep.id));
  ep.status = result.status;
  ep.lastError = result.ok ? null : result.message;
  ep.verifiedAt = result.ok ? nowIso() : ep.verifiedAt;
  if (result.models) ep.models = result.models;
  save();
  res.json({ ...result, endpoint: publicEndpoint(ep) });
});

/** Send one real message and record the outcome as verification. */
app.post('/api/endpoints/:id/verify', async (req, res) => {
  const ep = endpointById(req.params.id);
  if (!ep) return res.status(404).json({ error: 'Endpoint not found' });
  const result = await runAgent({
    endpoint: ep,
    agent: { name: 'Endpoint check', model: req.body?.model || ep.model, ref: req.body?.agentRef || null },
    messages: [{ role: 'user', content: 'Reply with the single word READY.' }],
    apiKey: getSecret(ep.id),
  });
  ep.status = result.ok ? 'verified' : 'error';
  ep.lastError = result.ok ? null : result.error;
  ep.verifiedAt = result.ok ? nowIso() : ep.verifiedAt;
  save();
  res.json({ ...result, endpoint: publicEndpoint(ep) });
});

/* ------------------------------- employees ----------------------------- */

app.post('/api/employees', (req, res) => {
  const s = state();
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'A name is required.' });
  const endpoint = b.endpointId ? endpointById(b.endpointId) : null;
  if (b.endpointId && !endpoint) return res.status(400).json({ error: 'Unknown endpoint.' });

  const dept = departmentById(b.departmentId) || s.departments.find((d) => d.id === 'ops');
  const roomIds = s.office.rooms.filter((r) => r.deptId === dept.id).map((r) => r.id);
  const taken = new Set(s.employees.map((e) => e.stationId));
  const station = s.office.stations.find((st) => roomIds.includes(st.roomId) && !taken.has(st.id) && !st.employeeId)
    || s.office.stations.find((st) => !taken.has(st.id) && !st.employeeId)
    || null;

  const employee = {
    id: uid('emp'),
    name: b.name,
    title: b.title || 'Employee',
    role: b.role || 'Assistant',
    departmentId: dept.id,
    stationId: station ? station.id : null,
    roomId: station ? station.roomId : null,
    appearance: b.appearance || {
      skin: '#e8b98f', hair: '#3a2b22', hairStyle: 'short',
      shirt: dept.color || '#4f6bed', pants: '#2b3444', accessory: null,
    },
    agent: {
      ref: b.agentRef || null,
      endpointId: b.endpointId || null,
      model: b.model || endpoint?.model || null,
      instructions: b.instructions || null,
      source: b.agentRef ? 'linked' : 'template',
    },
    simulated: endpoint?.kind === 'simulation' || (!b.endpointId && !b.agentRef),
    connected: Boolean(b.agentRef && b.endpointId),
    createdAt: nowIso(),
  };
  if (station) station.employeeId = employee.id;
  s.employees.push(employee);
  addActivity('employee', `${employee.name} joined ${dept.name}${employee.agent.ref ? ` (agent ${employee.agent.ref})` : ' as an unlinked placeholder'}.`);
  save();
  res.status(201).json(derivedEmployee(employee));
});

app.patch('/api/employees/:id', (req, res) => {
  const s = state();
  const emp = employeeById(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const b = req.body || {};

  if (b.name !== undefined) emp.name = b.name;
  if (b.title !== undefined) emp.title = b.title;
  if (b.role !== undefined) emp.role = b.role;

  if (b.departmentId !== undefined) {
    const dept = departmentById(b.departmentId);
    if (!dept) return res.status(400).json({ error: 'Unknown department' });
    emp.departmentId = dept.id;
    if (b.reassignDesk !== false) {
      const taken = new Set(s.employees.filter((e) => e.id !== emp.id).map((e) => e.stationId));
      const roomIds = s.office.rooms.filter((r) => r.deptId === dept.id).map((r) => r.id);
      const station = s.office.stations.find((st) => roomIds.includes(st.roomId) && !taken.has(st.id) && (!st.employeeId || st.employeeId === emp.id));
      if (emp.stationId) {
        const old = s.office.stations.find((st) => st.id === emp.stationId);
        if (old && old.employeeId === emp.id) old.employeeId = null;
      }
      if (station) {
        station.employeeId = emp.id;
        emp.stationId = station.id;
        emp.roomId = station.roomId;
      } else {
        emp.stationId = null;
        emp.roomId = null;
      }
    }
  }

  if (b.stationId !== undefined) {
    const target = s.office.stations.find((st) => st.id === b.stationId) || null;
    const occupant = target && s.employees.find((e) => e.id !== emp.id && e.stationId === target.id);
    if (occupant) return res.status(409).json({ error: `${occupant.name} already uses that workstation.` });
    if (emp.stationId) {
      const old = s.office.stations.find((st) => st.id === emp.stationId);
      if (old && old.employeeId === emp.id) old.employeeId = null;
    }
    if (target) {
      target.employeeId = emp.id;
      emp.stationId = target.id;
      emp.roomId = target.roomId;
    } else {
      emp.stationId = null;
    }
  }

  if (b.appearance) emp.appearance = { ...emp.appearance, ...b.appearance };

  if (b.agent) {
    const a = b.agent;
    if (a.ref !== undefined) emp.agent.ref = a.ref;
    if (a.endpointId !== undefined) emp.agent.endpointId = a.endpointId;
    if (a.model !== undefined) emp.agent.model = a.model;
    if (a.instructions !== undefined) emp.agent.instructions = a.instructions;
    emp.agent.source = emp.agent.ref ? 'linked' : 'template';
    emp.simulated = !emp.agent.ref;
    emp.connected = Boolean(emp.agent.ref && emp.agent.endpointId);
  }

  if (b.status !== undefined && ['disconnected', 'idle'].includes(b.status)) emp.status = b.status;
  if (b.disconnect === true) {
    emp.status = 'disconnected';
    emp.connected = false;
  }
  if (b.reconnect === true) {
    emp.status = 'idle';
    emp.connected = Boolean(emp.agent.ref && emp.agent.endpointId);
  }
  save();
  res.json(derivedEmployee(emp));
});

app.delete('/api/employees/:id', (req, res) => {
  const s = state();
  const emp = employeeById(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const st = s.office.stations.find((x) => x.id === emp.stationId);
  if (st && st.employeeId === emp.id) st.employeeId = null;
  s.employees = s.employees.filter((e) => e.id !== emp.id);
  delete s.conversations[emp.id];
  s.meetings.forEach((m) => { m.participantIds = m.participantIds.filter((id) => id !== emp.id); });
  addActivity('employee', `${emp.name} left the company.`);
  save();
  res.json({ ok: true });
});

/* ------------------------------ departments ---------------------------- */

app.post('/api/departments', (req, res) => {
  const s = state();
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'A department name is required.' });
  const dept = {
    id: uid('dept'),
    name: b.name,
    color: b.color || '#5b7cfa',
    icon: b.icon || 'gear',
    managerId: null,
    description: b.description || '',
    custom: true,
  };
  s.departments.push(dept);
  addActivity('department', `Department "${dept.name}" created.`);
  save();
  res.status(201).json(dept);
});

app.patch('/api/departments/:id', (req, res) => {
  const d = departmentById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Department not found' });
  for (const k of ['name', 'color', 'description', 'managerId', 'icon']) {
    if (req.body[k] !== undefined) d[k] = req.body[k];
  }
  save();
  res.json(d);
});

app.delete('/api/departments/:id', (req, res) => {
  const s = state();
  const d = departmentById(req.params.id);
  if (!d) return res.status(404).json({ error: 'Department not found' });
  if (s.employees.some((e) => e.departmentId === d.id)) {
    return res.status(409).json({ error: 'Move the employees out of this department first.' });
  }
  s.departments = s.departments.filter((x) => x.id !== d.id);
  s.office.rooms.forEach((r) => { if (r.deptId === d.id) r.deptId = null; });
  save();
  res.json({ ok: true });
});

/* -------------------------------- office ------------------------------- */

app.put('/api/office', (req, res) => {
  const s = state();
  const b = req.body || {};
  const office = s.office;
  for (const key of ['rooms', 'doors', 'furniture', 'stations', 'corridors']) {
    if (Array.isArray(b[key])) office[key] = b[key];
  }
  // Keep station <-> employee links consistent after an edit.
  const byId = new Map(office.stations.map((st) => [st.id, st]));
  s.employees.forEach((e) => {
    const st = byId.get(e.stationId);
    if (st) {
      st.employeeId = e.id;
      e.roomId = st.roomId;
    } else if (e.stationId) {
      e.stationId = null;
      e.roomId = null;
    }
  });
  save();
  res.json({ ok: true, office });
});

app.post('/api/office/reset', (_req, res) => {
  const s = state();
  // Rebuilt from the seed module so the floorplan has a single source of truth.
  const fresh = createInitialState().office;
  s.office = fresh;
  // Re-bind employees to the restored workstations.
  s.employees.forEach((e, i) => {
    const st = fresh.stations[i] || null;
    e.stationId = st ? st.id : null;
    e.roomId = st ? st.roomId : null;
    if (st) st.employeeId = e.id;
  });
  save();
  res.json({ ok: true, office: s.office });
});

/* -------------------------------- chat --------------------------------- */

app.get('/api/employees/:id/messages', (req, res) => {
  const s = state();
  const emp = employeeById(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json({
    messages: s.conversations[emp.id] || [],
    connection: resolveAgent(emp).error,
  });
});

app.post('/api/employees/:id/messages', async (req, res) => {
  const s = state();
  const emp = employeeById(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  const content = (req.body?.content || '').trim();
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 5) : [];
  if (!content && !attachments.length) return res.status(400).json({ error: 'Message is empty.' });

  const { agent, endpoint, error } = resolveAgent(emp);
  const convo = s.conversations[emp.id] || (s.conversations[emp.id] = []);

  let composed = content;
  if (attachments.length) {
    composed += `\n\n[Attached files]\n${attachments.map((f) => `--- ${f.name} ---\n${String(f.text || '').slice(0, 12000)}`).join('\n\n')}`;
  }

  const userMsg = { id: uid('msg'), role: 'user', content: composed, at: nowIso(), attachments: attachments.map((f) => ({ name: f.name })) };
  convo.push(userMsg);
  save();

  if (error) {
    const fail = {
      id: uid('msg'), role: 'system', at: nowIso(), error: true,
      content: `${emp.name} is not reachable: ${error}`,
    };
    convo.push(fail);
    save();
    return res.status(409).json({ error, messages: convo });
  }

  // Give the agent the conversation history for context.
  const history = convo
    .filter((m) => !m.error)
    .slice(-21)
    .map((m) => ({ role: m.role === 'agent' ? 'assistant' : m.role, content: m.content }));

  const result = await runAgent({ endpoint, agent, messages: history, apiKey: getSecret(endpoint.id) });

  if (!result.ok) {
    convo.push({ id: uid('msg'), role: 'system', at: nowIso(), error: true, content: `${result.code || 'error'}: ${result.error}` });
    endpoint.lastError = result.error;
    save();
    return res.status(502).json({ error: result.error, code: result.code, messages: convo });
  }

  endpoint.lastError = null;
  const agentMsg = {
    id: uid('msg'),
    role: 'agent',
    content: result.text,
    at: nowIso(),
    simulated: Boolean(result.simulated),
    model: result.model || null,
    endpointId: result.endpointId,
  };
  convo.push(agentMsg);
  if (convo.length > 400) convo.splice(0, convo.length - 400);
  addActivity('chat', `${emp.name} replied${result.simulated ? ' (simulated)' : ''}.`);
  save();
  res.json({ messages: convo, reply: agentMsg });
});

/* -------------------------------- tasks -------------------------------- */

const STATUSES = ['pending', 'assigned', 'running', 'waiting', 'completed', 'failed', 'cancelled'];

app.post('/api/tasks', (req, res) => {
  const s = state();
  const b = req.body || {};
  const emp = employeeById(b.employeeId);
  if (!emp) return res.status(400).json({ error: 'Choose an employee to assign the task to.' });
  if (!b.title) return res.status(400).json({ error: 'A task title is required.' });
  const task = {
    id: uid('task'),
    title: b.title,
    description: b.description || '',
    objective: b.objective || '',
    instructions: b.instructions || '',
    expectedOutput: b.expectedOutput || '',
    priority: b.priority || 'normal',
    deadline: b.deadline || null,
    attachments: (b.attachments || []).map((f) => ({ name: f.name, text: String(f.text || '').slice(0, 12000) })),
    employeeId: emp.id,
    agentRef: emp.agent?.ref || null,
    endpointId: emp.agent?.endpointId || null,
    departmentId: b.departmentId || emp.departmentId,
    projectId: b.projectId || null,
    dependsOn: b.dependsOn || [],
    status: 'assigned',
    createdAt: nowIso(),
    startedAt: null,
    completedAt: null,
    result: null,
    error: null,
    simulated: null,
    model: null,
    autoRun: b.autoRun !== false,
  };
  s.tasks.unshift(task);
  addActivity('task', `Task "${task.title}" assigned to ${emp.name}.`, { employeeId: emp.id });
  save();
  if (task.autoRun) {
    res.status(201).json(task);
    runInBackground(executeTask(task.id), 'task');
    return;
  }
  res.status(201).json(task);
});

app.patch('/api/tasks/:id', (req, res) => {
  const s = state();
  const task = s.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const b = req.body || {};
  if (b.status && STATUSES.includes(b.status)) {
    if (['running', 'completed', 'failed'].includes(b.status) && !['completed', 'failed', 'cancelled'].includes(task.status)) {
      return res.status(400).json({ error: 'That status is set by execution, not manually.' });
    }
    task.status = b.status;
    if (b.status === 'cancelled') task.completedAt = nowIso();
  }
  for (const k of ['title', 'description', 'objective', 'instructions', 'expectedOutput', 'priority', 'deadline', 'departmentId']) {
    if (b[k] !== undefined) task[k] = b[k];
  }
  save();
  res.json(task);
});

app.post('/api/tasks/:id/run', (req, res) => {
  const s = state();
  const task = s.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status === 'running') return res.status(409).json({ error: 'This task is already running.' });
  if (task.status === 'completed') return res.status(409).json({ error: 'This task has already completed. Create a new task to run it again.' });
  const emp = employeeById(task.employeeId);
  if (!emp) return res.status(400).json({ error: 'The assigned employee no longer exists.' });
  const { endpoint, error } = resolveAgent(emp);
  if (!endpoint || error) return res.status(409).json({ error: error || 'The employee has no reachable agent.' });

  task.status = 'running';
  task.error = null;
  task.startedAt = task.startedAt || nowIso();
  save();
  runInBackground(executeTask(task.id), 'task');
  res.status(202).json(task);
});

app.post('/api/tasks/:id/cancel', (req, res) => {
  const s = state();
  const task = s.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (['completed', 'failed'].includes(task.status)) return res.status(409).json({ error: 'Task already finished.' });
  task.status = 'cancelled';
  task.completedAt = nowIso();
  task.error = 'Cancelled by the CEO. Any in-flight request keeps running until the endpoint answers, but its result will be discarded.';
  save();
  res.json(task);
});

async function executeTask(taskId) {
  const s = state();
  const task = s.tasks.find((t) => t.id === taskId);
  if (!task) return;
  const emp = employeeById(task.employeeId);
  if (!emp) { task.status = 'failed'; task.error = 'Employee missing.'; save(); return; }
  const { agent, endpoint, error } = resolveAgent(emp);
  if (!endpoint || error) {
    task.status = 'failed';
    task.error = error || 'No reachable agent.';
    task.completedAt = nowIso();
    save();
    return;
  }

  runningTasks.add(task.id);
  task.status = 'running';
  task.startedAt = task.startedAt || nowIso();
  task.error = null;
  save();

  const deps = (task.dependsOn || [])
    .map((id) => s.tasks.find((t) => t.id === id))
    .filter(Boolean);
  if (deps.some((d) => d.status !== 'completed')) {
    task.status = 'waiting';
    runningTasks.delete(task.id);
    save();
    return;
  }

  const parts = [];
  parts.push(`Task: ${task.title}`);
  if (task.objective) parts.push(`Objective: ${task.objective}`);
  if (task.description) parts.push(`Context: ${task.description}`);
  if (task.instructions) parts.push(`Instructions: ${task.instructions}`);
  if (task.expectedOutput) parts.push(`Expected output: ${task.expectedOutput}`);
  if (task.priority) parts.push(`Priority: ${task.priority}`);
  if (task.deadline) parts.push(`Deadline: ${task.deadline}`);
  if (task.attachments?.length) {
    parts.push(`Attached files:\n${task.attachments.map((f) => `--- ${f.name} ---\n${f.text}`).join('\n')}`);
  }
  if (deps.length) {
    parts.push(`Upstream results from collaborating employees:\n${deps.map((d) => `### ${d.title} (${employeeById(d.employeeId)?.name || 'agent'})\n${d.result || d.error || ''}`).join('\n\n')}`);
  }

  const messages = [{ role: 'user', content: parts.join('\n\n') }];
  const result = await runAgent({ endpoint, agent, messages, apiKey: getSecret(endpoint.id), meta: { title: task.title, task } });
  runningTasks.delete(task.id);

  const fresh = state().tasks.find((t) => t.id === taskId);
  if (!fresh) return;
  if (fresh.status === 'cancelled') {
    save();
    return;
  }

  if (result.ok) {
    fresh.status = 'completed';
    fresh.result = result.text;
    fresh.completedAt = nowIso();
    fresh.simulated = Boolean(result.simulated);
    fresh.model = result.model || null;
    fresh.error = null;
    addActivity('task', `${emp.name} completed "${fresh.title}"${result.simulated ? ' (simulated)' : ''}.`, { employeeId: emp.id, taskId: fresh.id });
  } else {
    fresh.status = 'failed';
    fresh.error = `${result.code || 'error'}: ${result.error}`;
    fresh.completedAt = nowIso();
    endpoint.lastError = result.error;
    addActivity('task', `${emp.name} failed "${fresh.title}": ${result.error}`, { employeeId: emp.id, taskId: fresh.id });
  }
  save();

  // Unblock dependants that were waiting on this task.
  if (fresh.status === 'completed') {
    state().tasks
      .filter((t) => t.status === 'waiting' && (t.dependsOn || []).includes(fresh.id))
      .forEach((t) => {
        if ((t.dependsOn || []).every((id) => state().tasks.find((x) => x.id === id)?.status === 'completed')) {
          t.status = 'assigned';
          save();
          runInBackground(executeTask(t.id), 'task');
        }
      });
  }
}

/* ------------------------------- projects ------------------------------ */

app.post('/api/projects', (req, res) => {
  const s = state();
  const b = req.body || {};
  if (!b.name) return res.status(400).json({ error: 'A project name is required.' });
  const members = (b.members || []).filter((m) => employeeById(m.employeeId));
  if (!members.length) return res.status(400).json({ error: 'Add at least one employee to the project.' });
  const project = {
    id: uid('proj'),
    name: b.name,
    description: b.description || '',
    objective: b.objective || '',
    status: 'planned',
    members: members.map((m) => ({ employeeId: m.employeeId, responsibility: m.responsibility || '' })),
    taskIds: [],
    createdAt: nowIso(),
    startedAt: null,
    completedAt: null,
  };
  s.projects.unshift(project);
  addActivity('project', `Project "${project.name}" created with ${members.length} member(s).`);
  save();
  res.status(201).json(project);
});

app.post('/api/projects/:id/start', (req, res) => {
  const s = state();
  const project = s.projects.find((p) => p.id === req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (project.status === 'running') return res.status(409).json({ error: 'This project is already running.' });

  const created = [];
  let previous = null;
  for (const [i, member] of project.members.entries()) {
    const emp = employeeById(member.employeeId);
    if (!emp) continue;
    const { endpoint, error } = resolveAgent(emp);
    const task = {
      id: uid('task'),
      title: `${project.name} — step ${i + 1}: ${member.responsibility || emp.role}`,
      description: project.description,
      objective: project.objective || project.description,
      instructions: `Your responsibility in this shared project is: ${member.responsibility || emp.role}. Work only on that part, and hand off a self-contained result that the next employee can build on.`,
      expectedOutput: 'A concrete, self-contained deliverable for the next collaborator.',
      priority: 'high',
      deadline: null,
      attachments: [],
      employeeId: emp.id,
      agentRef: emp.agent?.ref || null,
      endpointId: emp.agent?.endpointId || null,
      departmentId: emp.departmentId,
      projectId: project.id,
      dependsOn: previous ? [previous] : [],
      status: endpoint && !error ? (previous ? 'waiting' : 'assigned') : 'pending',
      createdAt: nowIso(),
      startedAt: null,
      completedAt: null,
      result: null,
      error: error || null,
      simulated: null,
      model: null,
      autoRun: false,
    };
    s.tasks.unshift(task);
    project.taskIds.push(task.id);
    created.push(task);
    previous = task.id;
  }
  project.status = created.some((t) => t.status === 'assigned') ? 'running' : 'planned';
  project.startedAt = nowIso();
  save();

  const first = created.find((t) => t.status === 'assigned');
  if (first) runInBackground(executeTask(first.id), 'project');

  res.status(201).json({ project, tasks: created });
});

/* ------------------------------- meetings ------------------------------ */

app.post('/api/meetings', (req, res) => {
  const s = state();
  const b = req.body || {};
  const ids = (b.participantIds || []).filter((id) => employeeById(id));
  if (ids.length < 2) return res.status(400).json({ error: 'Pick at least two employees for a meeting.' });
  const seats = s.office.meetingSeats || [];
  const meeting = {
    id: uid('meet'),
    topic: b.topic || 'Stand-up',
    participantIds: ids.slice(0, seats.length || 8),
    seatMap: {},
    status: 'active',
    transcript: [],
    startedAt: nowIso(),
    endedAt: null,
    relay: 'host',
    note: 'The office relays each message to every participant as context. Arena AI exposes no agent-to-agent channel, so agents do not talk to each other directly.',
  };
  meeting.participantIds.forEach((id, i) => { meeting.seatMap[id] = i; });
  s.meetings.unshift(meeting);
  addActivity('meeting', `Meeting "${meeting.topic}" started with ${meeting.participantIds.length} participants.`);
  save();
  res.status(201).json(meeting);
});

app.post('/api/meetings/:id/say', async (req, res) => {
  const s = state();
  const meeting = s.meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  if (meeting.status !== 'active') return res.status(409).json({ error: 'This meeting has ended.' });
  const content = (req.body?.content || '').trim();
  if (!content) return res.status(400).json({ error: 'Say something first.' });

  meeting.transcript.push({ id: uid('mt'), at: nowIso(), speaker: 'ceo', name: s.settings.ceoName || 'CEO', content });
  save();

  const results = [];
  for (const id of meeting.participantIds) {
    const emp = employeeById(id);
    if (!emp) continue;
    const { agent, endpoint, error } = resolveAgent(emp);
    if (!endpoint || error) {
      results.push({ employeeId: id, name: emp.name, error: error || 'No reachable agent.' });
      continue;
    }
    const transcriptText = meeting.transcript
      .slice(-12)
      .map((t) => `${t.name}: ${t.content}`)
      .join('\n');
    const prompt = [
      `You are taking part in a company meeting about: ${meeting.topic}.`,
      `The meeting is host-relayed: you receive the transcript so far and reply once. You cannot see other agents' replies as they are written.`,
      `Transcript:\n${transcriptText}`,
      `Reply briefly (max 120 words) from your own responsibility and expertise.`,
    ].join('\n\n');
    const result = await runAgent({
      endpoint, agent,
      messages: [{ role: 'user', content: prompt }],
      apiKey: getSecret(endpoint.id),
      meta: { title: meeting.topic },
    });
    if (result.ok) {
      meeting.transcript.push({
        id: uid('mt'), at: nowIso(), speaker: 'agent', employeeId: id,
        name: emp.name, content: result.text, simulated: Boolean(result.simulated), model: result.model || null,
      });
      results.push({ employeeId: id, name: emp.name, ok: true, simulated: Boolean(result.simulated) });
    } else {
      meeting.transcript.push({
        id: uid('mt'), at: nowIso(), speaker: 'system', name: emp.name,
        content: `${emp.name} could not respond: ${result.error}`, error: true,
      });
      results.push({ employeeId: id, name: emp.name, ok: false, error: result.error });
    }
    save();
  }
  res.json({ meeting, results });
});

app.post('/api/meetings/:id/end', (req, res) => {
  const s = state();
  const meeting = s.meetings.find((m) => m.id === req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  meeting.status = 'ended';
  meeting.endedAt = nowIso();
  addActivity('meeting', `Meeting "${meeting.topic}" ended.`);
  save();
  res.json(meeting);
});

/* ------------------------------- activity ------------------------------ */

app.get('/api/activity', (_req, res) => {
  res.json(state().activity.slice(0, 100));
});

/* -------------------------------- static ------------------------------- */

const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST, 'index.html'), {
      headers: { 'Cache-Control': 'no-cache, must-revalidate' },
    });
  });
} else {
  app.get('/', (_req, res) => {
    res.type('html').send('<h1>Arena Virtual Company</h1><p>Run <code>npm run build</code> first, or use <code>npm run dev</code>.</p>');
  });
}

app.use((err, _req, res, _next) => {
  console.error('[server]', err);
  res.status(500).json({ error: err.message || 'Internal error' });
});

app.listen(PORT, HOST, () => {
  console.log(`Arena Virtual Company running on http://${HOST}:${PORT}`);
  console.log('No Arena AI agent API is contacted unless you configure an endpoint yourself.');
});

process.on('SIGINT', () => { flush(); process.exit(0); });
process.on('SIGTERM', () => { flush(); process.exit(0); });
