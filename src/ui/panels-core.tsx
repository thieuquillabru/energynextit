import React, { useMemo, useState } from 'react';
import { useCompany } from '../lib/store';
import type { Employee, Task } from '../types';
import { api } from '../lib/api';
import {
  Avatar, Empty, StatusBadge, TaskBadge, clock, deptColor, deptName, timeAgo,
} from './common';
import {
  IconPlay, IconStop, IconTarget, IconPlus, IconRefresh, IconWarning,
} from './icons';

type CommonProps = { onFocusEmployee: (id: string) => void };

/* -------------------------------- dashboard ------------------------------- */

export function DashboardPanel({ onFocusEmployee }: CommonProps) {
  const { snap, setPanel } = useCompany();
  if (!snap) return null;
  const c = snap.counts;
  const maxDept = Math.max(1, ...snap.departmentActivity.map((d) => d.employees + d.openTasks));

  return (
    <div className="panel-body">
      <div className="section-title">Company overview</div>
      <div className="kpi-grid">
        <div className="kpi accent"><div className="v">{c.connected}</div><div className="k">Connected agents</div></div>
        <div className="kpi warn"><div className="v">{c.simulated}</div><div className="k">Placeholders</div></div>
        <div className="kpi accent"><div className="v">{c.working}</div><div className="k">Working now</div></div>
        <div className="kpi ok"><div className="v">{c.idle}</div><div className="k">Idle</div></div>
        <div className="kpi gold"><div className="v">{c.meetings}</div><div className="k">Meetings</div></div>
        <div className="kpi danger"><div className="v">{c.offline}</div><div className="k">Unreachable</div></div>
        <div className="kpi gold"><div className="v">{c.pending}</div><div className="k">Pending tasks</div></div>
        <div className="kpi ok"><div className="v">{c.completed}</div><div className="k">Completed</div></div>
        <div className="kpi danger"><div className="v">{c.failed}</div><div className="k">Failed</div></div>
      </div>

      <div className="hint" style={{ marginTop: 8 }}>
        Every number is computed from stored task and agent records — nothing is estimated.
      </div>

      <div className="section-title">Departments</div>
      <div className="bars">
        {snap.departmentActivity.map((d) => {
          const dept = snap.departments.find((x) => x.id === d.id);
          const color = dept?.color || '#7b8794';
          return (
            <div className="bar-row" key={d.id}>
              <span className="nm" title={d.name}>{d.name}</span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(d.employees / maxDept) * 100}%`, background: color }} />
                <div className="bar-fill" style={{ width: `${(d.running / maxDept) * 100}%`, background: 'var(--accent)' }} />
              </div>
              <span className="num">{d.employees} · {d.running}r</span>
            </div>
          );
        })}
      </div>

      <div className="section-title">Live activity</div>
      <div>
        {snap.activity.slice(0, 9).map((a) => (
          <div className="activity-item" key={a.id}>
            <span className="time">{clock(a.at)}</span>
            <span className="txt">{a.text}</span>
          </div>
        ))}
        {!snap.activity.length && <Empty>No activity yet.</Empty>}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button className="btn" onClick={() => setPanel('directory')}><IconTarget size={14} /> Directory</button>
        <button className="btn" onClick={() => setPanel('tasks')}><IconPlay size={13} /> Tasks</button>
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        Click a character in the office to manage that employee, or double-click to open its chat.
      </div>
    </div>
  );
}

/* -------------------------------- directory ------------------------------- */

export function DirectoryPanel({ onFocusEmployee }: CommonProps) {
  const { snap, selectedId, setSelectedId } = useCompany();
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('all');
  if (!snap) return null;

  const list = snap.employees.filter((e) => {
    const q = query.trim().toLowerCase();
    const matchQ = !q || [e.name, e.title, e.role, e.agent.ref || '', e.departmentId].join(' ').toLowerCase().includes(q);
    return matchQ && (dept === 'all' || e.departmentId === dept);
  });

  return (
    <div className="panel-body">
      <div className="row" style={{ marginBottom: 10 }}>
        <input className="input" placeholder="Search employees or agent ids…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="select" style={{ maxWidth: 150 }} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">All departments</option>
          {snap.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {list.map((emp) => (
        <button
          key={emp.id}
          className={`emp-row ${selectedId === emp.id ? 'selected' : ''}`}
          style={{ width: '100%', background: 'none', textAlign: 'left' }}
          onClick={() => { setSelectedId(emp.id); onFocusEmployee(emp.id); }}
        >
          <Avatar employee={emp} departments={snap.departments} />
          <div className="emp-main">
            <div className="emp-name">
              {emp.name}
              <span className="dot" style={{ background: deptColor(snap.departments, emp.departmentId) }} />
            </div>
            <div className="emp-sub">
              {emp.title} · {deptName(snap.departments, emp.departmentId)}
            </div>
            <div className="emp-sub mono" style={{ opacity: 0.75 }}>
              {emp.agent.ref ? `agent ${emp.agent.ref}` : 'no agent attached'}
            </div>
          </div>
          <div className="emp-meta">
            <StatusBadge status={emp.status} />
            {emp.agent.model && <span className="badge neutral">{emp.agent.model}</span>}
          </div>
        </button>
      ))}
      {!list.length && <Empty>No employees match this filter.</Empty>}
      <div className="hint" style={{ marginTop: 12 }}>
        Directory entries always show the real agent reference stored for that employee.
      </div>
    </div>
  );
}

/* --------------------------------- tasks ---------------------------------- */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'running', label: 'Running' },
  { id: 'completed', label: 'Completed' },
  { id: 'failed', label: 'Failed' },
] as const;

export function TasksPanel({ onFocusEmployee }: CommonProps) {
  const { snap, act, notify, setSelectedId } = useCompany();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [composer, setComposer] = useState(false);
  if (!snap) return null;

  const tasks = snap.tasks.filter((t) => {
    if (filter === 'all') return true;
    if (filter === 'open') return ['pending', 'assigned', 'waiting'].includes(t.status);
    return t.status === filter;
  });

  const empName = (id: string) => snap.employees.find((e) => e.id === id)?.name || 'unknown employee';

  return (
    <>
      <div className="panel-tabs">
        {FILTERS.map((f) => (
          <button key={f.id} className={`tab ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn sm primary" style={{ marginBottom: 6 }} onClick={() => setComposer(true)}>
          <IconPlus size={13} /> New task
        </button>
      </div>
      <div className="panel-body">
        {tasks.map((task) => {
          const emp = snap.employees.find((e) => e.id === task.employeeId);
          const open = expanded === task.id;
          return (
            <div className={`card ${open ? 'selected' : ''}`} key={task.id}>
              <div className="card-row" style={{ alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="card-title">{task.title}</div>
                  <div className="card-sub">
                    {emp ? emp.name : 'unknown'} · {task.priority} priority · {timeAgo(task.createdAt)}
                    {task.deadline ? ` · due ${new Date(task.deadline).toLocaleDateString()}` : ''}
                  </div>
                </div>
                <TaskBadge status={task.status} />
              </div>
              <div className="wrap" style={{ marginTop: 8 }}>
                <button className="btn sm ghost" onClick={() => setExpanded(open ? null : task.id)}>
                  {open ? 'Hide' : 'Details'}
                </button>
                {['pending', 'assigned', 'waiting', 'failed'].includes(task.status) && (
                  <button
                    className="btn sm"
                    onClick={() => act(() => api.post(`/api/tasks/${task.id}/run`), { ok: 'Task handed to the agent.' })}
                  >
                    <IconPlay size={11} /> Run
                  </button>
                )}
                {['pending', 'assigned', 'waiting', 'running'].includes(task.status) && (
                  <button
                    className="btn sm danger"
                    onClick={() => act(() => api.post(`/api/tasks/${task.id}/cancel`), { ok: 'Task cancelled.' })}
                  >
                    <IconStop size={11} /> Cancel
                  </button>
                )}
                {emp && (
                  <button className="btn sm ghost" onClick={() => { setSelectedId(emp.id); onFocusEmployee(emp.id); }}>
                    <IconTarget size={11} /> Employee
                  </button>
                )}
              </div>
              {open && (
                <div style={{ marginTop: 10 }}>
                  {task.objective && <><div className="label">Objective</div><div className="card-sub">{task.objective}</div></>}
                  {task.instructions && <><div className="label" style={{ marginTop: 8 }}>Instructions</div><div className="card-sub">{task.instructions}</div></>}
                  {task.expectedOutput && <><div className="label" style={{ marginTop: 8 }}>Expected output</div><div className="card-sub">{task.expectedOutput}</div></>}
                  <div className="label" style={{ marginTop: 8 }}>Agent identity</div>
                  <div className="card-sub mono">{task.agentRef || 'no agent reference'} · {task.model || 'model unknown'}</div>
                  <div className="label" style={{ marginTop: 8 }}>Timing</div>
                  <div className="card-sub">
                    created {new Date(task.createdAt).toLocaleString()}<br />
                    started {task.startedAt ? new Date(task.startedAt).toLocaleString() : '—'}<br />
                    finished {task.completedAt ? new Date(task.completedAt).toLocaleString() : '—'}
                  </div>
                  {task.result && (
                    <>
                      <div className="label" style={{ marginTop: 8 }}>
                        Result {task.simulated ? '(simulated placeholder)' : '(actual agent response)'}
                      </div>
                      <pre className="result">{task.result}</pre>
                    </>
                  )}
                  {task.error && (
                    <>
                      <div className="label" style={{ marginTop: 8 }}>Error</div>
                      <div className="notice danger" style={{ marginTop: 4 }}>{task.error}</div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {!tasks.length && <Empty>No tasks in this view.<br />Assign one with “New task”.</Empty>}
        {tasks.length > 0 && (
          <div className="hint" style={{ marginTop: 6 }}>
            Statuses come from the agent execution, not from the UI: a task is only Completed once its endpoint answered.
          </div>
        )}
      </div>
      {composer && <TaskComposerModal onClose={() => setComposer(false)} onDone={() => setComposer(false)} />}
    </>
  );
}

/* ------------------------------- task composer ---------------------------- */

export function TaskComposerModal({
  onClose, onDone, employeeId, projectId,
}: { onClose: () => void; onDone: () => void; employeeId?: string; projectId?: string }) {
  const { snap, act } = useCompany();
  const [form, setForm] = useState({
    employeeId: employeeId || snap?.employees[0]?.id || '',
    title: '',
    description: '',
    objective: '',
    instructions: '',
    expectedOutput: '',
    priority: 'normal',
    deadline: '',
    autoRun: true,
  });
  const [attachments, setAttachments] = useState<{ name: string; text: string }[]>([]);
  if (!snap) return null;

  const emp = snap.employees.find((e) => e.id === form.employeeId);

  const submit = async () => {
    if (!form.title.trim()) return;
    const payload = { ...form, attachments, projectId: projectId || null, deadline: form.deadline || null };
    const res = await act(() => api.post<Task>('/api/tasks', payload), {
      ok: form.autoRun ? 'Task sent to the agent.' : 'Task saved.',
    });
    if (res) onDone();
  };

  const addFile = async (file: File) => {
    if (file.size > 400_000) return;
    const text = await file.text();
    setAttachments((a) => [...a.slice(0, 4), { name: file.name, text }]);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 'min(560px, 100%)' }}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>Assign a task</h2>
            <p>The prompt is sent to the employee's own agent through its configured endpoint.</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="label">Assign to</label>
            <select className="select" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              {snap.employees.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} — {x.title} {x.agent.ref ? `· ${x.agent.ref}` : '· no agent attached'}
                </option>
              ))}
            </select>
            {emp && !emp.agent.ref && (
              <div className="hint" style={{ color: 'var(--warn)' }}>
                This employee has no agent attached yet. The task will be saved as pending and cannot run.
              </div>
            )}
          </div>
          <div className="field">
            <label className="label">Task title</label>
            <input className="input" value={form.title} placeholder="e.g. Draft the Q4 launch plan"
              onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
          </div>
          <div className="row">
            <div className="field">
              <label className="label">Priority</label>
              <select className="select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="field">
              <label className="label">Deadline</label>
              <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label className="label">Context / description</label>
            <textarea className="textarea" value={form.description} placeholder="Background the employee needs."
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Objective</label>
            <input className="input" value={form.objective} placeholder="What must be true when this is done?"
              onChange={(e) => setForm({ ...form, objective: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Instructions</label>
            <textarea className="textarea" value={form.instructions} placeholder="Constraints, format, things to avoid."
              onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Expected output</label>
            <input className="input" value={form.expectedOutput} placeholder="e.g. a 1-page brief in markdown"
              onChange={(e) => setForm({ ...form, expectedOutput: e.target.value })} />
          </div>
          <div className="field">
            <label className="label">Attachments (text files)</label>
            <input
              className="input"
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.ts,.js,.html,.css,.yml,.yaml"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                files.forEach((f) => addFile(f));
                e.currentTarget.value = '';
              }}
            />
            <div className="hint">
              Text is inlined into the prompt. Binary upload depends entirely on your endpoint — the office never pretends it was sent.
            </div>
            {attachments.map((a) => (
              <div key={a.name} className="cap" style={{ marginTop: 5 }}>
                <span style={{ flex: 1 }}>{a.name}</span>
                <button className="btn sm ghost" onClick={() => setAttachments(attachments.filter((x) => x.name !== a.name))}>Remove</button>
              </div>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={form.autoRun} onChange={(e) => setForm({ ...form, autoRun: e.target.checked })} />
            Send to the agent immediately
          </label>
        </div>
        <div className="modal-foot">
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!form.title.trim()} onClick={submit}>
            {form.autoRun ? 'Assign & run' : 'Save task'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- activity -------------------------------- */

export function ActivityPanel({ onFocusEmployee }: CommonProps) {
  const { snap, refresh } = useCompany();
  if (!snap) return null;
  return (
    <div className="panel-body">
      <div className="inline" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="hint">Real events emitted by the office server.</span>
        <button className="btn sm ghost" onClick={() => refresh()}><IconRefresh size={12} /> Refresh</button>
      </div>
      {snap.activity.map((a) => (
        <div className="activity-item" key={a.id}>
          <span className="time">{clock(a.at)}</span>
          <span className="txt">
            {a.text}
            {a.employeeId && (
              <button
                className="btn sm ghost"
                style={{ marginLeft: 6 }}
                onClick={() => onFocusEmployee(a.employeeId!)}
              >
                view
              </button>
            )}
          </span>
        </div>
      ))}
      {!snap.activity.length && <Empty>Nothing has happened yet.</Empty>}
    </div>
  );
}

/* ---------------------------- shared small bits --------------------------- */

export function AgentIdentity({ employee, endpointLabel }: { employee: Employee; endpointLabel: string | null }) {
  return (
    <div className="card">
      <div className="card-title">
        Agent identity
        {employee.agent.ref
          ? <span className="badge completed">linked</span>
          : <span className="badge simulated">not linked</span>}
      </div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '92px 1fr', gap: '5px 8px', fontSize: 11.5 }}>
        <span className="hint">Agent ref</span><span className="mono">{employee.agent.ref || '—'}</span>
        <span className="hint">Endpoint</span><span>{endpointLabel || '—'}</span>
        <span className="hint">Model</span><span className="mono">{employee.agent.model || '—'}</span>
        <span className="hint">Source</span><span>{employee.agent.source}</span>
        <span className="hint">Resolved</span>
        <span>{employee.agentResolved ? 'yes — messages go to this agent' : 'no — nothing is being called'}</span>
      </div>
      {employee.connectionError && (
        <div className="notice warn" style={{ marginTop: 9, marginBottom: 0 }}>
          <IconWarning size={12} /> {employee.connectionError}
        </div>
      )}
    </div>
  );
}

export function useEmployeesByDept(snap: ReturnType<typeof useCompany>['snap']) {
  return useMemo(() => {
    const map = new Map<string, Employee[]>();
    snap?.departments.forEach((d) => map.set(d.id, []));
    snap?.employees.forEach((e) => {
      if (!map.has(e.departmentId)) map.set(e.departmentId, []);
      map.get(e.departmentId)!.push(e);
    });
    return map;
  }, [snap]);
}
