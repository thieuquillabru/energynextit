/**
 * End-to-end smoke test for the office server + integration layer.
 *
 * Starts a mock OpenAI-compatible agent runtime, starts the office against a
 * throwaway data directory, and exercises the real HTTP paths: endpoint
 * verification, employee binding, chat, tasks, project chaining, meetings,
 * layout persistence, and the "no agent attached" failure modes.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const MOCK_PORT = 4999;
const OFFICE_PORT = 4174;
const BASE = `http://127.0.0.1:${OFFICE_PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-office-test-'));

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, extra = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ''}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, json, text };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000, interval = 200) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const value = await fn();
    if (value) return value;
    await sleep(interval);
  }
  return null;
}

/* ------------------------------ mock agent ------------------------------- */

const mockServer = http.createServer((req, res) => {
  const send = (code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(obj));
  };
  if (req.method === 'GET' && req.url === '/v1/models') {
    return send(200, { data: [{ id: 'mock-large' }, { id: 'mock-small' }] });
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch { /* ignore */ }
      const last = (body.messages || []).filter((m) => m.role === 'user').pop();
      const content = last?.content || '';
      if (/please fail/i.test(content)) {
        return send(500, { error: 'mock agent exploded on purpose' });
      }
      if (!body.model) return send(400, { error: 'model is required' });
      const agentTag = body.agent ? ` via agent ${body.agent}` : '';
      const sawUpstream = /Upstream results/.test(content) ? ' SAW_UPSTREAM' : '';
      return send(200, {
        choices: [{
          message: {
            role: 'assistant',
            content: `MOCK[${body.model}${agentTag}] received ${(body.messages || []).length} message(s). Last prompt: "${content.slice(0, 80)}"${sawUpstream}`,
          },
        }],
      });
    });
    return undefined;
  }
  if (req.method === 'POST' && req.url === '/custom/invoke') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = {};
      try { body = JSON.parse(raw); } catch { /* ignore */ }
      return send(200, { data: { output: `CUSTOM agent=${body.agentId} got: ${String(body.input).slice(0, 60)}` } });
    });
    return undefined;
  }
  return send(404, { error: 'not found' });
});

/* --------------------------------- main ---------------------------------- */

let office;
try {
  await new Promise((resolve) => mockServer.listen(MOCK_PORT, '127.0.0.1', resolve));
  console.log(`mock agent runtime on :${MOCK_PORT}`);

  office = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(OFFICE_PORT), HOST: '127.0.0.1', DATA_DIR: dataDir, AGENT_TIMEOUT_MS: '8000' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  office.stdout.on('data', (d) => process.env.VERBOSE && process.stdout.write(`[office] ${d}`));
  office.stderr.on('data', (d) => process.stdout.write(`[office:err] ${d}`));

  const up = await waitFor(async () => {
    try {
      const r = await fetch(`${BASE}/api/state`);
      return r.ok;
    } catch { return false; }
  }, 10000);
  if (!up) throw new Error('office server did not start');

  console.log('\n1. Initial state');
  let state = (await api('GET', '/api/state')).json;
  check('seeded 8 placeholder employees', state.employees.length === 8);
  check('placeholders are flagged simulated', state.employees.every((e) => e.simulated));
  check('no employee is marked connected', state.counts.connected === 0);
  check('only the simulation endpoint exists', state.endpoints.length === 1 && state.endpoints[0].kind === 'simulation');
  check('snapshot never leaks an api key field', !('apiKey' in state.endpoints[0]));

  console.log('\n2. Connect a real OpenAI-compatible endpoint');
  let res = await api('POST', '/api/endpoints', {
    kind: 'openai',
    label: 'Mock agent runtime',
    baseUrl: `http://127.0.0.1:${MOCK_PORT}/v1`,
    model: 'mock-large',
    apiKey: 'secret-key-123',
  });
  const ep = res.json;
  check('endpoint created', res.status === 201 && ep.id);
  check('key is not echoed back', ep.hasKey === true && !JSON.stringify(ep).includes('secret-key-123'));

  res = await api('POST', `/api/endpoints/${ep.id}/test`);
  check('model discovery works', res.json.ok === true && res.json.models.includes('mock-large'), JSON.stringify(res.json).slice(0, 120));

  res = await api('POST', `/api/endpoints/${ep.id}/verify`);
  check('verification calls the real endpoint', res.json.ok === true && res.json.text?.startsWith('MOCK['), JSON.stringify(res.json).slice(0, 140));

  console.log('\n3. Bind an employee to a real agent reference');
  res = await api('POST', '/api/employees', {
    name: 'Orion',
    title: 'Backend Engineer',
    role: 'Developer',
    departmentId: 'dev',
    endpointId: ep.id,
    agentRef: 'agent_orion_001',
    model: 'mock-large',
  });
  const orion = res.json;
  check('employee created', res.status === 201 && orion.id);
  check('employee resolves to a real agent', orion.agentResolved === true);
  check('status is idle, not simulated', orion.status === 'idle' && orion.simulated === false);
  check('employee received a workstation', Boolean(orion.stationId));

  console.log('\n4. Chat uses the bound agent');
  res = await api('POST', `/api/employees/${orion.id}/messages`, { content: 'Hello, what are you working on?' });
  check('chat returns a real reply', res.status === 200 && res.json.reply?.content?.includes('MOCK[mock-large via agent agent_orion_001]'), JSON.stringify(res.json).slice(0, 180));
  check('reply is not flagged simulated', res.json.reply?.simulated === false);

  state = (await api('GET', '/api/state')).json;
  const convo = state.conversations[orion.id] || [];
  check('conversation history persisted', convo.length === 2 && convo[0].role === 'user' && convo[1].role === 'agent');

  console.log('\n5. Task execution reflects the real result');
  res = await api('POST', '/api/tasks', {
    employeeId: orion.id,
    title: 'Draft the API contract',
    description: 'Write the contract for the new endpoint.',
    objective: 'A reviewed contract.',
    instructions: 'Keep it short.',
    priority: 'high',
    expectedOutput: 'markdown',
    autoRun: true,
  });
  const task = res.json;
  check('task accepted', res.status === 201 && task.id);
  const finished = await waitFor(async () => {
    const s = (await api('GET', '/api/state')).json;
    return s.tasks.find((t) => t.id === task.id && ['completed', 'failed'].includes(t.status));
  }, 12000);
  check('task completed', Boolean(finished) && finished.status === 'completed', finished?.error || '');
  check('task stores the real agent output', Boolean(finished?.result?.startsWith('MOCK[')), finished?.result?.slice(0, 80));
  check('task records agent reference', finished?.agentRef === 'agent_orion_001');
  check('task timestamps set', Boolean(finished?.startedAt && finished?.completedAt));

  console.log('\n6. Failures are reported, not hidden');
  res = await api('POST', '/api/tasks', {
    employeeId: orion.id, title: 'Please fail', autoRun: true,
  });
  const failing = await waitFor(async () => {
    const s = (await api('GET', '/api/state')).json;
    return s.tasks.find((t) => t.id === res.json.id && ['completed', 'failed'].includes(t.status));
  }, 12000);
  check('failed task is marked failed', failing?.status === 'failed', JSON.stringify(failing?.status));
  check('failure keeps the upstream error', /mock agent exploded/.test(failing?.error || ''), failing?.error);

  console.log('\n7. Employees without an agent refuse to fabricate');
  state = (await api('GET', '/api/state')).json;
  const placeholder = state.employees.find((e) => e.simulated && !e.agentResolved);
  res = await api('POST', `/api/employees/${placeholder.id}/messages`, { content: 'hi' });
  check('unlinked employee returns 409', res.status === 409, `got ${res.status}`);
  check('error names the reason', /no Arena AI agent reference|not reachable/i.test(res.json.error || ''), res.json.error);

  res = await api('POST', '/api/tasks', { employeeId: placeholder.id, title: 'Should not run', autoRun: true });
  const pending = await waitFor(async () => {
    const s = (await api('GET', '/api/state')).json;
    return s.tasks.find((t) => t.id === res.json.id && ['failed', 'completed'].includes(t.status));
  }, 8000);
  check('unlinked task cannot complete', pending?.status === 'failed', pending?.status);

  console.log('\n8. Custom templated endpoints');
  res = await api('POST', '/api/endpoints', {
    kind: 'custom',
    label: 'Custom bridge',
    baseUrl: `http://127.0.0.1:${MOCK_PORT}/custom/invoke`,
    bodyTemplate: '{"agentId":"{{agent_id}}","input":"{{prompt}}"}',
    responsePath: 'data.output',
  });
  const custom = res.json;
  res = await api('POST', `/api/employees`, {
    name: 'Lyra', title: 'Researcher', role: 'Researcher', departmentId: 'research',
    endpointId: custom.id, agentRef: 'agent_lyra_007', model: 'custom-model',
  });
  const lyra = res.json;
  res = await api('POST', `/api/employees/${lyra.id}/messages`, { content: 'Summarise the market.' });
  check('custom template fills placeholders', res.json.reply?.content?.includes('agent_lyra_007'), JSON.stringify(res.json).slice(0, 160));
  check('custom response path extracts text', res.json.reply?.content?.startsWith('CUSTOM'), res.json.reply?.content);

  console.log('\n9. Project collaboration chains real outputs');
  state = (await api('GET', '/api/state')).json;
  res = await api('POST', '/api/projects', {
    name: 'Website launch',
    description: 'Build and launch the marketing site.',
    members: [
      { employeeId: lyra.id, responsibility: 'Research the audience' },
      { employeeId: orion.id, responsibility: 'Implement the site' },
    ],
  });
  const project = res.json;
  check('project created', res.status === 201 && project.members.length === 2);
  res = await api('POST', `/api/projects/${project.id}/start`);
  check('project start creates chained tasks', res.json.tasks?.length === 2 && res.json.tasks[1].dependsOn.includes(res.json.tasks[0].id));
  const chained = await waitFor(async () => {
    const s = (await api('GET', '/api/state')).json;
    const tasks = s.tasks.filter((t) => t.projectId === project.id);
    return tasks.length === 2 && tasks.every((t) => t.status === 'completed') ? tasks : null;
  }, 20000);
  check('both project steps completed', Boolean(chained), 'timeout waiting for project tasks');
  const down = chained?.find((t) => t.employeeId === orion.id);
  check('downstream task received the upstream result', Boolean(down?.result?.includes('SAW_UPSTREAM')), down?.result?.slice(0, 140));

  console.log('\n10. Meetings relay through the real agents');
  res = await api('POST', '/api/meetings', { participantIds: [orion.id, lyra.id], topic: 'Launch readiness' });
  const meeting = res.json;
  check('meeting created with seats', res.status === 201 && Object.keys(meeting.seatMap).length === 2);
  res = await api('POST', `/api/meetings/${meeting.id}/say`, { content: 'Where are we on the launch?' });
  const agentTurns = res.json.meeting?.transcript?.filter((t) => t.speaker === 'agent') || [];
  check('each participant answered', agentTurns.length === 2, JSON.stringify(res.json.results));
  check('transcript keeps the CEO message first', res.json.meeting.transcript[0].speaker === 'ceo');
  check('meeting notes it is host-relayed', /host-relayed|relay/i.test(res.json.meeting.note || ''));
  await api('POST', `/api/meetings/${meeting.id}/end`);

  console.log('\n11. Office layout persists');
  state = (await api('GET', '/api/state')).json;
  const officeState = state.office;
  const table = officeState.furniture.find((f) => f.type === 'meetingTable');
  const movedTo = { x: table.x + 25, y: table.y + 5 };
  officeState.furniture.find((f) => f.id === table.id).x = movedTo.x;
  officeState.furniture.find((f) => f.id === table.id).y = movedTo.y;
  res = await api('PUT', '/api/office', {
    rooms: officeState.rooms,
    corridors: officeState.corridors,
    doors: officeState.doors,
    furniture: officeState.furniture,
    stations: officeState.stations,
  });
  check('layout accepted', res.status === 200);
  state = (await api('GET', '/api/state')).json;
  check('layout change is live', state.office.furniture.find((f) => f.id === table.id).x === movedTo.x);

  console.log('\n12. Restart restores the company and the agent links');
  office.kill('SIGTERM');
  await sleep(800);
  office = spawn(process.execPath, ['server/index.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(OFFICE_PORT), HOST: '127.0.0.1', DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitFor(async () => {
    try { return (await fetch(`${BASE}/api/state`)).ok; } catch { return false; }
  }, 10000);
  state = (await api('GET', '/api/state')).json;
  const persistedOrion = state.employees.find((e) => e.agent.ref === 'agent_orion_001');
  check('employees restored', state.employees.length === 10);
  check('agent references restored', Boolean(persistedOrion));
  check('agent still resolves after restart', persistedOrion?.agentResolved === true);
  check('task history restored', state.tasks.filter((t) => t.status === 'completed').length >= 3);
  check('layout restored', state.office.furniture.find((f) => f.id === table.id).x === movedTo.x);
  check('chat history restored', (state.conversations[persistedOrion.id] || []).length >= 2);
  check('endpoint key survived restart', state.endpoints.find((e) => e.id === ep.id)?.hasKey === true);

  console.log('\n13. Disconnect / reconnect');
  res = await api('PATCH', `/api/employees/${orion.id}`, { disconnect: true });
  check('disconnect marks the employee', res.json.status === 'disconnected');
  res = await api('POST', `/api/employees/${orion.id}/messages`, { content: 'are you there?' });
  check('disconnected employee cannot chat', res.status === 409);
  res = await api('PATCH', `/api/employees/${orion.id}`, { reconnect: true });
  check('reconnect restores idle state', res.json.status === 'idle');
  res = await api('POST', `/api/employees/${orion.id}/messages`, { content: 'back online?' });
  check('reconnected agent answers again', res.status === 200 && res.json.reply?.content?.includes('MOCK['));

  console.log('\n14. Deleting an endpoint disconnects its employees');
  res = await api('DELETE', `/api/endpoints/${custom.id}`);
  check('endpoint deleted', res.status === 200);
  state = (await api('GET', '/api/state')).json;
  const lyraAfter = state.employees.find((e) => e.id === lyra.id);
  check('dependent employee no longer resolves', lyraAfter?.agentResolved === false);
  check('employee shows a connection error', Boolean(lyraAfter?.connectionError));
} catch (err) {
  console.error('\nFATAL', err);
  failed++;
} finally {
  mockServer.close();
  if (office) office.kill('SIGKILL');
  await sleep(300);
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log('failed checks:\n - ' + failures.join('\n - '));
  process.exit(failed === 0 ? 0 : 1);
}
