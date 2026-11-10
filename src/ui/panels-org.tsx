import React, { useState } from 'react';
import { useCompany } from '../lib/store';
import { api } from '../lib/api';
import type { Endpoint, Project } from '../types';
import {
  Avatar, Empty, Field, Modal, Notice, StatusBadge, TaskBadge, deptColor, deptName, timeAgo,
} from './common';
import {
  DeptIcon, IconCheck, IconClose, IconLink, IconPlus, IconPlay, IconRefresh,
  IconTarget, IconTrash, IconWarning,
} from './icons';

type FocusProps = {
  onFocusDepartment: (id: string) => void;
  onFocusEmployee: (id: string) => void;
};

/* ------------------------------- departments ------------------------------ */

export function DepartmentsPanel({ onFocusDepartment, onFocusEmployee }: FocusProps) {
  const { snap, act, setSelectedId } = useCompany();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#5b7cfa');
  const [desc, setDesc] = useState('');
  if (!snap) return null;

  return (
    <div className="panel-body">
      <div className="inline" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="hint">Departments organise your agents. They never create new ones.</span>
        <button className="btn sm" onClick={() => setCreating(!creating)}><IconPlus size={12} /> New</button>
      </div>

      {creating && (
        <div className="card">
          <Field label="Department name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Legal" /></Field>
          <Field label="Description"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
          <Field label="Colour">
            <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 32, padding: 3 }} />
          </Field>
          <div className="row">
            <button className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
            <button
              className="btn primary"
              disabled={!name.trim()}
              onClick={async () => {
                const res = await act(() => api.post('/api/departments', { name, color, description: desc }), { ok: 'Department created.' });
                if (res) { setCreating(false); setName(''); setDesc(''); }
              }}
            >Create</button>
          </div>
        </div>
      )}

      {snap.departments.map((dept) => {
        const people = snap.employees.filter((e) => e.departmentId === dept.id);
        const tasks = snap.tasks.filter((t) => t.departmentId === dept.id);
        const open = tasks.filter((t) => !['completed', 'cancelled'].includes(t.status));
        const rooms = snap.office.rooms.filter((r) => r.deptId === dept.id);
        return (
          <div className="card" key={dept.id}>
            <div className="card-row">
              <div className="card-title" style={{ color: dept.color }}>
                <DeptIcon icon={dept.icon} /> {dept.name}
              </div>
              <button className="btn sm ghost" onClick={() => onFocusDepartment(dept.id)}><IconTarget size={11} /> Focus</button>
            </div>
            <div className="card-sub">{dept.description || 'No description.'}</div>
            <div className="wrap" style={{ marginTop: 8 }}>
              <span className="badge neutral">{people.length} employees</span>
              <span className="badge neutral">{open.length} open tasks</span>
              <span className="badge neutral">{rooms.length} room{rooms.length === 1 ? '' : 's'}</span>
            </div>
            <div style={{ marginTop: 9 }}>
              <label className="label">Manager</label>
              <select
                className="select"
                value={dept.managerId || ''}
                onChange={(e) => act(() => api.patch(`/api/departments/${dept.id}`, { managerId: e.target.value || null }), { ok: 'Manager updated.' })}
              >
                <option value="">— none assigned —</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ marginTop: 6 }}>
              {people.map((p) => (
                <div className="emp-row" key={p.id} style={{ padding: '6px 4px' }}>
                  <Avatar employee={p} departments={snap.departments} size="sm" />
                  <div className="emp-main">
                    <div className="emp-name" style={{ fontSize: 12 }}>{p.name}</div>
                    <div className="emp-sub">{p.title}</div>
                  </div>
                  <StatusBadge status={p.status} />
                  <button className="btn sm ghost" onClick={() => { setSelectedId(p.id); onFocusEmployee(p.id); }}>Open</button>
                  <select
                    className="select"
                    style={{ width: 92, height: 26, padding: '0 6px', fontSize: 10.5 }}
                    value={p.departmentId}
                    onChange={(e) => act(
                      () => api.patch(`/api/employees/${p.id}`, { departmentId: e.target.value }),
                      { ok: `${p.name} moved.` },
                    )}
                  >
                    {snap.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              ))}
              {!people.length && <div className="hint" style={{ padding: '4px 0' }}>No employees assigned.</div>}
            </div>
            {open.slice(0, 3).map((t) => (
              <div key={t.id} className="card-sub" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <TaskBadge status={t.status} /><span>{t.title}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------- projects -------------------------------- */

export function ProjectsPanel({ onFocusEmployee }: { onFocusEmployee: (id: string) => void }) {
  const { snap, act } = useCompany();
  const [creating, setCreating] = useState(false);
  if (!snap) return null;

  return (
    <div className="panel-body">
      <div className="notice info">
        A project creates one real task per selected employee, wired in sequence: each agent receives the
        previous agent's actual output as context. The office relays results — agents never talk to each other directly.
      </div>
      <div className="inline" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
        <button className="btn sm primary" onClick={() => setCreating(true)}><IconPlus size={12} /> New project</button>
      </div>

      {snap.projects.map((p) => {
        const tasks = snap.tasks.filter((t) => t.projectId === p.id);
        const done = tasks.filter((t) => t.status === 'completed').length;
        const failed = tasks.filter((t) => ['failed', 'cancelled'].includes(t.status)).length;
        const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
        return (
          <div className="card" key={p.id}>
            <div className="card-row">
              <div className="card-title">{p.name}</div>
              <span className={`badge ${p.status === 'running' ? 'running' : p.status === 'planned' ? 'pending' : 'completed'}`}>{p.status}</span>
            </div>
            <div className="card-sub">{p.description || p.objective || 'No description.'}</div>
            <div className="bar-track" style={{ marginTop: 9, height: 8 }}>
              <div className="bar-fill" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#4fb286,#57e0ff)' }} />
              {failed > 0 && <div className="bar-fill" style={{ width: `${(failed / Math.max(1, tasks.length)) * 100}%`, background: 'var(--danger)' }} />}
            </div>
            <div className="card-sub" style={{ marginTop: 5 }}>
              {done}/{tasks.length} steps complete · created {timeAgo(p.createdAt)}
            </div>
            <div className="wrap" style={{ marginTop: 8 }}>
              {p.members.map((m) => {
                const emp = snap.employees.find((e) => e.id === m.employeeId);
                if (!emp) return null;
                return (
                  <button key={m.employeeId} className="chip" onClick={() => onFocusEmployee(emp.id)}>
                    <Avatar employee={emp} departments={snap.departments} size="sm" /> {emp.name}
                  </button>
                );
              })}
            </div>
            {tasks.map((t) => (
              <div key={t.id} className="card-sub" style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 5 }}>
                <TaskBadge status={t.status} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
              </div>
            ))}
            <div className="wrap" style={{ marginTop: 8 }}>
              {p.status === 'planned' && (
                <button
                  className="btn sm primary"
                  onClick={() => act(() => api.post(`/api/projects/${p.id}/start`), { ok: 'Project started — the first agent is working.' })}
                ><IconPlay size={11} /> Start project</button>
              )}
              {p.status === 'running' && <span className="badge running">agents are working</span>}
            </div>
          </div>
        );
      })}
      {!snap.projects.length && <Empty>No projects yet.<br />A project chains several agents together.</Empty>}

      {creating && <ProjectComposer onClose={() => setCreating(false)} />}
    </div>
  );
}

function ProjectComposer({ onClose }: { onClose: () => void }) {
  const { snap, act } = useCompany();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [objective, setObjective] = useState('');
  const [members, setMembers] = useState<{ employeeId: string; responsibility: string }[]>([]);
  const [startNow, setStartNow] = useState(true);
  if (!snap) return null;

  const addMember = () => {
    const used = new Set(members.map((m) => m.employeeId));
    const next = snap.employees.find((e) => !used.has(e.id));
    if (next) setMembers([...members, { employeeId: next.id, responsibility: '' }]);
  };

  return (
    <Modal
      title="New project"
      subtitle="Each member gets one task; results flow forward as context."
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={!name.trim() || !members.length}
            onClick={async () => {
              const project = await act(() => api.post<Project>('/api/projects', {
                name, description, objective, members,
              }), { ok: 'Project created.' });
              if (project) {
                if (startNow) {
                  await act(() => api.post(`/api/projects/${project.id}/start`), { ok: 'Project started.' });
                }
                onClose();
              }
            }}
          >{startNow ? 'Create & start' : 'Create'}</button>
        </>
      }
    >
      <Field label="Project name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Launch marketing website" autoFocus /></Field>
      <Field label="Description"><textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <Field label="Objective"><input className="input" value={objective} onChange={(e) => setObjective(e.target.value)} /></Field>
      <div className="section-title">Collaborators (in order)</div>
      {members.map((m, i) => (
        <div className="card" key={i}>
          <div className="row" style={{ alignItems: 'center' }}>
            <select className="select" value={m.employeeId}
              onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, employeeId: e.target.value } : x))}>
              {snap.employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name} — {emp.role}</option>)}
            </select>
            <button className="btn sm danger icon" onClick={() => setMembers(members.filter((_, j) => j !== i))}><IconClose size={12} /></button>
          </div>
          <input
            className="input" style={{ marginTop: 6 }}
            placeholder={`What step ${i + 1} is responsible for`}
            value={m.responsibility}
            onChange={(e) => setMembers(members.map((x, j) => j === i ? { ...x, responsibility: e.target.value } : x))}
          />
        </div>
      ))}
      <button className="btn ghost" onClick={addMember}><IconPlus size={12} /> Add collaborator</button>
      <label className="check" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={startNow} onChange={(e) => setStartNow(e.target.checked)} />
        Start immediately
      </label>
    </Modal>
  );
}

/* --------------------------------- settings -------------------------------- */

export function SettingsPanel() {
  const { snap, info, act, notify } = useCompany();
  const [adding, setAdding] = useState(false);
  const [addingAgent, setAddingAgent] = useState(false);
  if (!snap) return null;

  const placeholders = snap.employees.filter((e) => e.simulated && !e.agentResolved);

  return (
    <div className="panel-body">
      <div className="section-title">Company</div>
      <Field label="Company name">
        <input
          className="input"
          defaultValue={snap.settings.companyName}
          onBlur={(e) => act(() => api.patch('/api/settings', { companyName: e.target.value }), { ok: 'Saved.' })}
        />
      </Field>
      <Field label="CEO name">
        <input
          className="input"
          defaultValue={snap.settings.ceoName}
          onBlur={(e) => act(() => api.patch('/api/settings', { ceoName: e.target.value }), { ok: 'Saved.' })}
        />
      </Field>

      <div className="section-title">Agent connections</div>
      <div className="notice warn">
        <b>Arena AI publishes no agent API.</b> Nothing here calls arena.ai automatically. Each employee is bound to an
        endpoint <i>you</i> control — see the report below.
      </div>

      {snap.endpoints.map((ep) => <EndpointCard key={ep.id} endpoint={ep} />)}

      <div className="wrap" style={{ marginTop: 4 }}>
        <button className="btn" onClick={() => setAdding(true)}><IconPlus size={12} /> Add endpoint</button>
        <button className="btn" onClick={() => setAddingAgent(true)}><IconPlus size={12} /> Add employee</button>
      </div>

      {placeholders.length > 0 && (
        <>
          <div className="section-title">Placeholder employees</div>
          <div className="notice warn">
            {placeholders.length} employee(s) are demo placeholders with no agent attached. They are counted
            separately and every panel labels them.
          </div>
          <button
            className="btn danger sm"
            onClick={() => act(async () => {
              for (const p of placeholders) await api.del(`/api/employees/${p.id}`);
            }, { ok: 'Placeholders removed.' })}
          >
            <IconTrash size={12} /> Remove all placeholders
          </button>
        </>
      )}

      <div className="section-title">Office</div>
      <div className="wrap">
        <button className="btn" onClick={() => act(() => api.post('/api/office/reset'), { ok: 'Floorplan reset.' })}>
          <IconRefresh size={12} /> Reset floorplan
        </button>
        <button
          className="btn"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(snap.office, null, 2));
              notify('ok', 'Layout JSON copied to clipboard.');
            } catch {
              notify('err', 'Clipboard is not available in this browser context.');
            }
          }}
        >Copy layout JSON</button>
      </div>

      <div className="section-title">Integration report</div>
      {info ? (
        <>
          <div className="cap-list">
            <Cap label="Public Arena agent API" value={info.publicApi} />
            <Cap label="Official SDK" value={info.sdk} />
            <Cap label="Agent session API" value={info.agentSessionApi} />
            <Cap label="Webhooks" value={info.webhooks} />
            <Cap label="Conversation access" value={info.conversationAccess} />
            <Cap label="Model config access" value={info.modelConfigAccess} />
            <Cap label="Tool access" value={info.toolAccess} />
          </div>
          <div className="notice info" style={{ marginTop: 10 }}>
            <b>Authentication:</b> {info.auth}
          </div>
          <div className="notice warn">
            <b>Terms:</b> {info.termsNote}
          </div>
          <div className="notice ok">
            <b>Conclusion:</b> {info.conclusion}
          </div>
          <div className="hint">Checked {info.checkedAt}.</div>
        </>
      ) : <div className="hint">Loading capability report…</div>}

      {adding && <EndpointModal onClose={() => setAdding(false)} />}
      {addingAgent && <AddAgentModal onClose={() => setAddingAgent(false)} />}
    </div>
  );
}

function Cap({ label, value }: { label: string; value: boolean }) {
  return (
    <div className="cap">
      <span className={value ? 'yes' : 'no'}>{value ? 'YES' : 'NO'}</span>
      <span>{label}</span>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const { act, notify, snap } = useCompany();
  const [testing, setTesting] = useState(false);
  const [editing, setEditing] = useState(false);
  const linked = snap?.employees.filter((e) => e.agent.endpointId === endpoint.id).length || 0;

  const badge = endpoint.kind === 'simulation'
    ? <span className="badge simulated">simulation</span>
    : endpoint.status === 'verified' ? <span className="badge completed">verified</span>
      : endpoint.status === 'error' ? <span className="badge failed">error</span>
        : <span className="badge pending">unverified</span>;

  return (
    <div className="card">
      <div className="card-row">
        <div className="card-title" style={{ flex: 1, minWidth: 0 }}>
          <IconLink size={13} /> {endpoint.label}
        </div>
        {badge}
      </div>
      <div className="card-sub mono" style={{ wordBreak: 'break-all' }}>
        {endpoint.kind === 'simulation' ? 'local placeholder generator' : `${endpoint.kind} · ${endpoint.baseUrl}${endpoint.path || ''}`}
      </div>
      <div className="wrap" style={{ marginTop: 6 }}>
        <span className="badge neutral">{endpoint.model || 'no model set'}</span>
        <span className="badge neutral">{endpoint.hasKey ? 'key stored server-side' : 'no key'}</span>
        <span className="badge neutral">{linked} employee(s)</span>
      </div>
      {endpoint.lastError && <div className="notice danger" style={{ marginTop: 8, marginBottom: 0 }}>{endpoint.lastError}</div>}
      {endpoint.note && <div className="hint">{endpoint.note}</div>}
      <div className="wrap" style={{ marginTop: 8 }}>
        {endpoint.kind !== 'simulation' && (
          <>
            <button
              className="btn sm"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                const res = await act(() => api.post<{ message: string; ok: boolean }>(`/api/endpoints/${endpoint.id}/test`), { silent: true });
                setTesting(false);
                if (res) notify(res.ok ? 'ok' : 'info', res.message);
              }}
            >{testing ? 'Testing…' : 'Test reachability'}</button>
            <button
              className="btn sm"
              disabled={testing}
              onClick={async () => {
                setTesting(true);
                const res = await act(() => api.post<{ ok: boolean; error?: string; text?: string }>(`/api/endpoints/${endpoint.id}/verify`), { silent: true });
                setTesting(false);
                if (res?.ok) notify('ok', `Endpoint answered: “${(res.text || '').slice(0, 80)}”`);
                else notify('err', res?.error || 'Verification failed.');
              }}
            >Verify with a message</button>
            <button className="btn sm ghost" onClick={() => setEditing(true)}>Edit</button>
            <button
              className="btn sm danger"
              onClick={() => act(() => api.del(`/api/endpoints/${endpoint.id}`), { ok: 'Endpoint deleted.' })}
            ><IconTrash size={11} /></button>
          </>
        )}
      </div>
      {editing && <EndpointModal existing={endpoint} onClose={() => setEditing(false)} />}
    </div>
  );
}

function EndpointModal({ existing, onClose }: { existing?: Endpoint; onClose: () => void }) {
  const { act } = useCompany();
  const [form, setForm] = useState({
    kind: existing?.kind || 'openai',
    label: existing?.label || '',
    baseUrl: existing?.baseUrl || '',
    path: existing?.path || '',
    model: existing?.model || '',
    apiKey: '',
    headers: existing?.headers || '',
    bodyTemplate: existing?.bodyTemplate || '',
    responsePath: existing?.responsePath || '',
    method: existing?.method || '',
    note: existing?.note || '',
  });

  const set = (k: string, v: string) => setForm({ ...form, [k]: v });

  const save = async () => {
    const payload: Record<string, unknown> = { ...form };
    if (!form.apiKey) delete payload.apiKey;
    if (existing) {
      const res = await act(() => api.patch(`/api/endpoints/${existing.id}`, payload), { ok: 'Endpoint updated.' });
      if (res) onClose();
    } else {
      const res = await act(() => api.post('/api/endpoints', payload), { ok: 'Endpoint added.' });
      if (res) onClose();
    }
  };

  return (
    <Modal
      title={existing ? 'Edit endpoint' : 'Add an agent endpoint'}
      subtitle="The office will only ever call the endpoint you configure here."
      onClose={onClose}
      footer={<><div className="spacer" /><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save endpoint</button></>}
    >
      <Field label="Type" hint="OpenAI-compatible is the most common: POST {baseUrl}{path} with { model, messages }.">
        <select className="select" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
          <option value="openai">OpenAI-compatible chat endpoint</option>
          <option value="custom">Custom / templated HTTP endpoint</option>
          <option value="simulation">Local simulation (no agent called)</option>
        </select>
      </Field>
      <Field label="Label"><input className="input" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. My agent bridge" /></Field>

      {form.kind !== 'simulation' && (
        <>
          <Field
            label={form.kind === 'custom' ? 'URL template' : 'Base URL'}
            hint={form.kind === 'custom'
              ? 'May include {{agent_id}}, {{model}}, {{prompt}}. Example: https://my-bridge.local/agent/{{agent_id}}/invoke'
              : 'Example: https://my-bridge.local/v1 — the office appends the path below.'}
          >
            <input className="input" value={form.baseUrl} onChange={(e) => set('baseUrl', e.target.value)} placeholder="https://…" />
          </Field>
          {form.kind === 'openai' && (
            <Field label="Chat path" hint="Default /chat/completions. Model discovery uses /models on the same host.">
              <input className="input" value={form.path} onChange={(e) => set('path', e.target.value)} placeholder="/chat/completions" />
            </Field>
          )}
          <Field label="Model / agent name" hint="Sent as the model field (openai) or {{model}} (custom).">
            <input className="input" value={form.model} onChange={(e) => set('model', e.target.value)} placeholder="e.g. arena-agent" />
          </Field>
          <Field label="API key" hint={existing?.hasKey ? 'A key is stored. Leave blank to keep it.' : 'Stored server-side only, never sent to the browser.'}>
            <input className="input" type="password" value={form.apiKey} onChange={(e) => set('apiKey', e.target.value)} placeholder="sk-…" autoComplete="off" />
          </Field>
          <Field label="Extra headers" hint="Optional. JSON object or one Key: Value per line.">
            <textarea className="textarea" style={{ minHeight: 54 }} value={form.headers} onChange={(e) => set('headers', e.target.value)} placeholder={'{"X-Org": "acme"}'} />
          </Field>
          {form.kind === 'custom' && (
            <>
              <Field label="Body template" hint={'"{{messages}}" expands to a JSON array; {{prompt}} to the latest user text.'}>
                <textarea className="textarea" value={form.bodyTemplate} onChange={(e) => set('bodyTemplate', e.target.value)}
                  placeholder={'{"agentId":"{{agent_id}}","input":"{{prompt}}"}'} />
              </Field>
              <Field label="Response path" hint="Dot path to the reply text, e.g. data.output. Optional — common shapes are auto-detected.">
                <input className="input" value={form.responsePath} onChange={(e) => set('responsePath', e.target.value)} placeholder="data.output" />
              </Field>
            </>
          )}
        </>
      )}
      {form.kind === 'simulation' && (
        <Notice kind="warn">
          Simulation never contacts any model. Replies are generated locally and labelled everywhere in the interface.
        </Notice>
      )}
      <Field label="Note"><input className="input" value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
    </Modal>
  );
}

function AddAgentModal({ onClose }: { onClose: () => void }) {
  const { snap, act } = useCompany();
  const [form, setForm] = useState({
    name: '',
    title: 'Employee',
    role: 'Assistant',
    departmentId: snap?.departments[1]?.id || snap?.departments[0]?.id || '',
    endpointId: snap?.endpoints.find((e) => e.kind !== 'simulation')?.id || '',
    agentRef: '',
    model: '',
    instructions: '',
  });
  const [discovering, setDiscovering] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  if (!snap) return null;
  const ep = snap.endpoints.find((e) => e.id === form.endpointId);

  const discover = async () => {
    if (!ep) return;
    setDiscovering(true);
    const res = await act(() => api.post<{ models?: string[] }>(`/api/endpoints/${ep.id}/test`), { silent: true });
    setDiscovering(false);
    if (res?.models) setModels(res.models);
  };

  return (
    <Modal
      title="Add an employee"
      subtitle="Bind a character to an agent you can already reach. No agent is invented."
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={!form.name.trim()}
            onClick={async () => {
              const res = await act(() => api.post('/api/employees', form), { ok: 'Employee added to the office.' });
              if (res) onClose();
            }}
          >Hire</button>
        </>
      }
    >
      <div className="row">
        <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Agent display name" autoFocus /></Field>
        <Field label="Job title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
      </div>
      <div className="row">
        <Field label="Role">
          <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {['Developer', 'Researcher', 'Analyst', 'Designer', 'Writer', 'Marketing Specialist', 'Project Manager', 'Assistant', 'Technical Specialist'].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select className="select" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
            {snap.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="section-title">Agent binding</div>
      <Field label="Endpoint" hint="Without an endpoint the employee stays a placeholder and never claims to be an agent.">
        <select className="select" value={form.endpointId} onChange={(e) => setForm({ ...form, endpointId: e.target.value })}>
          <option value="">— none (placeholder) —</option>
          {snap.endpoints.map((e) => <option key={e.id} value={e.id}>{e.label} ({e.kind})</option>)}
        </select>
      </Field>
      <Field label="Agent reference" hint="The exact id your endpoint uses for this agent (sent as “agent”, or {{agent_id}} in a custom template).">
        <input className="input mono" value={form.agentRef} onChange={(e) => setForm({ ...form, agentRef: e.target.value })} placeholder="agent_abc123" />
      </Field>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label="Model">
          <input className="input" list="model-list" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder={ep?.model || 'e.g. gpt-4.1'} />
          <datalist id="model-list">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </Field>
        <button className="btn" style={{ marginBottom: 11 }} disabled={!ep || discovering} onClick={discover}>
          {discovering ? '…' : 'Discover'}
        </button>
      </div>
      {models.length > 0 && <div className="hint">{models.length} model(s) reported by the endpoint.</div>}
      <Field label="Existing system instructions (reference only)" hint="Kept with the employee for display. The office does not inject or modify your agent's instructions.">
        <textarea className="textarea" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
      </Field>
      {!form.endpointId && (
        <Notice kind="warn">
          This employee will be a visual placeholder. Tasks and chat will be blocked with a clear error until you
          attach an endpoint and an agent reference.
        </Notice>
      )}
    </Modal>
  );
}

/* ------------------------------- connection CTA ---------------------------- */

export function ConnectNotice() {
  const { snap, setPanel } = useCompany();
  const [dismissed, setDismissed] = useState(false);
  if (!snap || dismissed) return null;
  const connected = snap.counts.connected;
  if (!connected) {
    return (
      <div className="banner">
        <IconWarning size={14} />
        <span>
          <b>No agents connected.</b> The employees you see are labelled placeholders. Arena AI has no public agent API,
          so connect an endpoint you control to bring in the real ones.
        </span>
        <button className="btn sm gold" onClick={() => setPanel('settings')}>Connect</button>
        <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={() => setDismissed(true)} aria-label="Dismiss">
          <IconClose size={12} />
        </button>
      </div>
    );
  }
  const anySim = snap.endpoints.some((e) => e.kind === 'simulation' && e.status === 'ready');
  if (anySim) {
    return (
      <div className="banner info">
        <IconCheck size={14} />
        <span><b>Simulation endpoint present.</b> Employees bound to it return local placeholder text, never Arena AI output.</span>
      </div>
    );
  }
  return null;
}

export { IconWarning };
