import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCompany } from '../lib/store';
import { api } from '../lib/api';
import type { Task } from '../types';
import {
  AppearanceEditor, Avatar, Empty, Notice, StatusBadge, TaskBadge, clock, deptName, timeAgo,
} from './common';
import { Portrait } from './charts';
import {
  IconChat, IconClose, IconMeeting, IconPlay, IconPlus, IconSend, IconStop,
  IconTarget, IconTrash, IconWarning,
} from './icons';
import { AgentIdentity, TaskComposerModal } from './panels-core';

type Props = {
  employeeId: string;
  initialTab?: 'profile' | 'chat' | 'tasks' | 'look';
  onClose: () => void;
  onFocus: (id: string) => void;
  onMeeting: (ids: string[]) => void;
  onAgentReply?: (id: string, text: string) => void;
};

const ROLES = ['Developer', 'Researcher', 'Analyst', 'Designer', 'Writer', 'Marketing Specialist', 'Project Manager', 'Assistant', 'Technical Specialist'];

export function EmployeePanel({ employeeId, initialTab = 'profile', onClose, onFocus, onMeeting, onAgentReply }: Props) {
  const { snap, act, notify, setSelectedId } = useCompany();
  const [tab, setTab] = useState<'profile' | 'chat' | 'tasks' | 'look'>(initialTab);
  const [composer, setComposer] = useState(false);
  const emp = snap?.employees.find((e) => e.id === employeeId);

  useEffect(() => { setTab(initialTab); }, [employeeId, initialTab]);

  if (!snap || !emp) return null;
  const dept = snap.departments.find((d) => d.id === emp.departmentId);
  const tasks = snap.tasks.filter((t) => t.employeeId === emp.id);
  const activeTask = tasks.find((t) => t.status === 'running');
  const freeStations = snap.office.stations.filter((s) => !snap.employees.some((e) => e.stationId === s.id) || s.id === emp.stationId);

  const close = () => { setSelectedId(null); onClose(); };

  return (
    <>
      <aside className="panel" style={{ width: 440 }}>
        <div className="panel-head">
          <Avatar employee={emp} departments={snap.departments} size="lg" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              {emp.name}
              <StatusBadge status={emp.status} />
            </h2>
            <div className="sub" style={{ marginTop: 2 }}>
              {emp.title} · {dept?.name || 'unassigned'} {emp.agent.model ? `· ${emp.agent.model}` : ''}
            </div>
          </div>
          <button className="icon-btn" onClick={close} aria-label="Close"><IconClose size={15} /></button>
        </div>

        <div className="panel-tabs">
          <button className={`tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile</button>
          <button className={`tab ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>Chat</button>
          <button className={`tab ${tab === 'tasks' ? 'active' : ''}`} onClick={() => setTab('tasks')}>Tasks {tasks.length ? `(${tasks.length})` : ''}</button>
          <button className={`tab ${tab === 'look' ? 'active' : ''}`} onClick={() => setTab('look')}>Look</button>
        </div>

        {tab === 'profile' && (
          <div className="panel-body">
            <Portrait appearance={emp.appearance} pose={emp.status === 'working' ? 'type' : 'sit'} />
            <div style={{ height: 12 }} />
            <AgentIdentity employee={emp} endpointLabel={emp.endpointLabel} />

            {!emp.agentResolved && (
              <Notice kind="warn">
                <b>Not connected.</b> {emp.connectionError || 'No Arena AI agent reference is attached.'} Tasks and chat
                are blocked rather than answered by a different model.
              </Notice>
            )}

            <div className="section-title">Organisation</div>
            <div className="row">
              <div className="field">
                <label className="label">Department</label>
                <select
                  className="select"
                  value={emp.departmentId}
                  onChange={(e) => act(() => api.patch(`/api/employees/${emp.id}`, { departmentId: e.target.value }), { ok: 'Moved to a new department.' })}
                >
                  {snap.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="label">Role</label>
                <select
                  className="select"
                  value={emp.role}
                  onChange={(e) => act(() => api.patch(`/api/employees/${emp.id}`, { role: e.target.value }), { ok: 'Role updated.' })}
                >
                  {[...new Set([...ROLES, emp.role])].map((r) => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="label">Job title</label>
              <input
                className="input"
                defaultValue={emp.title}
                key={emp.id + emp.title}
                onBlur={(e) => e.target.value !== emp.title && act(() => api.patch(`/api/employees/${emp.id}`, { title: e.target.value }), { ok: 'Title updated.' })}
              />
            </div>

            <div className="field">
              <label className="label">Workstation</label>
              <select
                className="select"
                value={emp.stationId || ''}
                onChange={(e) => act(() => api.patch(`/api/employees/${emp.id}`, { stationId: e.target.value || null }), { ok: 'Workstation updated.' })}
              >
                <option value="">— no desk —</option>
                {freeStations.map((s) => {
                  const room = snap.office.rooms.find((r) => r.id === s.roomId);
                  return <option key={s.id} value={s.id}>{room?.name || s.roomId} · {s.id}</option>;
                })}
              </select>
              <div className="hint">The character walks to this desk before working, and sits while its agent is executing.</div>
            </div>

            <div className="section-title">Actions</div>
            <div className="wrap">
              <button className="btn" onClick={() => onFocus(emp.id)}><IconTarget size={12} /> Focus camera</button>
              <button className="btn primary" onClick={() => setComposer(true)}><IconPlus size={12} /> Assign task</button>
              <button className="btn" onClick={() => setTab('chat')}><IconChat size={12} /> Open chat</button>
              <button className="btn" onClick={() => onMeeting([emp.id])}><IconMeeting size={12} /> Start meeting</button>
              {emp.status === 'disconnected' ? (
                <button className="btn" onClick={() => act(() => api.patch(`/api/employees/${emp.id}`, { reconnect: true }), { ok: 'Reconnected.' })}>Reconnect</button>
              ) : (
                <button className="btn ghost" onClick={() => act(() => api.patch(`/api/employees/${emp.id}`, { disconnect: true }), { ok: 'Employee disconnected.' })}>Disconnect</button>
              )}
              <button
                className="btn danger"
                onClick={async () => {
                  if (!window.confirm(`Remove ${emp.name} from the office? The agent itself is untouched.`)) return;
                  const ok = await act(() => api.del(`/api/employees/${emp.id}`), { ok: 'Employee removed.' });
                  if (ok) close();
                }}
              ><IconTrash size={12} /> Remove</button>
            </div>

            <div className="section-title">Current work</div>
            {activeTask ? (
              <div className="card">
                <div className="card-row">
                  <div className="card-title">{activeTask.title}</div>
                  <TaskBadge status={activeTask.status} />
                </div>
                <div className="card-sub">Started {activeTask.startedAt ? timeAgo(activeTask.startedAt) : 'just now'} · the character is at its desk.</div>
              </div>
            ) : (
              <div className="hint">No task is executing right now. The character's state reflects that.</div>
            )}

            {emp.agent.instructions && (
              <>
                <div className="section-title">Stored instructions (reference)</div>
                <pre className="result" style={{ maxHeight: 160 }}>{emp.agent.instructions}</pre>
                <div className="hint">Shown for reference only. The office never overwrites your agent's own instructions.</div>
              </>
            )}
          </div>
        )}

        {tab === 'chat' && <ChatTab employeeId={emp.id} onAgentReply={onAgentReply} />}

        {tab === 'tasks' && (
          <div className="panel-body">
            <div className="inline" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
              <button className="btn sm primary" onClick={() => setComposer(true)}><IconPlus size={12} /> New task</button>
            </div>
            {tasks.map((t) => <TaskCard key={t.id} task={t} onFocus={onFocus} />)}
            {!tasks.length && <Empty>No tasks assigned yet.</Empty>}
          </div>
        )}

        {tab === 'look' && (
          <div className="panel-body">
            <AppearanceEditor
              value={emp.appearance}
              onChange={(appearance) => act(
                () => api.patch(`/api/employees/${emp.id}`, { appearance }),
                { silent: true },
              )}
            />
          </div>
        )}
      </aside>
      {composer && <TaskComposerModal employeeId={emp.id} onClose={() => setComposer(false)} onDone={() => setComposer(false)} />}
    </>
  );
}

function TaskCard({ task, onFocus }: { task: Task; onFocus: (id: string) => void }) {
  const { snap, act } = useCompany();
  const [open, setOpen] = useState(false);
  const emp = snap?.employees.find((e) => e.id === task.employeeId);
  return (
    <div className="card">
      <div className="card-row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card-title">{task.title}</div>
          <div className="card-sub">
            {emp?.name} · {task.priority} · {timeAgo(task.createdAt)}
          </div>
        </div>
        <TaskBadge status={task.status} />
      </div>
      <div className="wrap" style={{ marginTop: 8 }}>
        <button className="btn sm ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Details'}</button>
        {['pending', 'assigned', 'waiting', 'failed'].includes(task.status) && (
          <button className="btn sm" onClick={() => act(() => api.post(`/api/tasks/${task.id}/run`), { ok: 'Task sent to the agent.' })}>
            <IconPlay size={11} /> Run
          </button>
        )}
        {['pending', 'assigned', 'waiting', 'running'].includes(task.status) && (
          <button className="btn sm danger" onClick={() => act(() => api.post(`/api/tasks/${task.id}/cancel`), { ok: 'Cancelled.' })}>
            <IconStop size={11} /> Cancel
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 8 }}>
          {task.objective && <><div className="label">Objective</div><div className="card-sub">{task.objective}</div></>}
          {task.instructions && <><div className="label" style={{ marginTop: 8 }}>Instructions</div><div className="card-sub">{task.instructions}</div></>}
          <div className="label" style={{ marginTop: 8 }}>Agent</div>
          <div className="card-sub mono">{task.agentRef || 'none'} · {task.model || 'model unknown'}</div>
          {task.result && (
            <>
              <div className="label" style={{ marginTop: 8 }}>Result {task.simulated ? '(simulated)' : '(actual)'}</div>
              <pre className="result">{task.result}</pre>
            </>
          )}
          {task.error && <div className="notice danger" style={{ marginTop: 8 }}>{task.error}</div>}
        </div>
      )}
      {!open && task.result && (
        <div className="card-sub" style={{ marginTop: 7, opacity: 0.8 }}>
          {task.result.slice(0, 110)}{task.result.length > 110 ? '…' : ''}
        </div>
      )}
    </div>
  );
}

function ChatTab({ employeeId, onAgentReply }: { employeeId: string; onAgentReply?: (id: string, text: string) => void }) {
  const { snap, refresh, notify } = useCompany();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const emp = snap?.employees.find((e) => e.id === employeeId);
  const messages = useMemo(() => snap?.conversations[employeeId] || [], [snap, employeeId]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages.length, sending]);

  if (!snap || !emp) return null;

  const send = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setText('');
    setSending(true);
    setError(null);
    try {
      const res = await api.post<{ messages: any[]; reply?: { content: string } }>(
        `/api/employees/${employeeId}/messages`, { content, attachments: files },
      );
      setFiles([]);
      if (res.reply) onAgentReply?.(employeeId, res.reply.content);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The agent could not be reached.');
      notify('err', err instanceof Error ? err.message : 'The agent could not be reached.');
      await refresh();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chat">
      <div className="chat-log" ref={logRef}>
        {!emp.agentResolved && (
          <div className="notice warn" style={{ marginBottom: 4 }}>
            <b>No live agent.</b> {emp.connectionError || 'Attach an endpoint and agent reference first.'}
            {' '}Messages are not sent anywhere and no fake answer is produced.
          </div>
        )}
        {!messages.length && (
          <Empty>
            No conversation yet.<br />
            Messages here go to the agent bound to {emp.name}
            {emp.agent.ref ? ` (${emp.agent.ref})` : ''}.
          </Empty>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role === 'agent' ? 'agent' : m.role === 'user' ? 'user' : 'system'}`}>
            <div className="bubble">{m.content}</div>
            <div className="msg-meta">
              <span>{m.role === 'agent' ? emp.name : m.role === 'user' ? 'You' : 'System'}</span>
              <span>·</span>
              <span>{clock(m.at)}</span>
              {m.simulated && <span className="badge simulated">simulated</span>}
              {m.model && <span className="mono">{m.model}</span>}
            </div>
          </div>
        ))}
        {sending && (
          <div className="msg agent">
            <div className="bubble inline">
              <span className="typing"><i /><i /><i /></span>
              <span style={{ color: 'var(--muted)', fontSize: 11.5 }}>waiting for the agent…</span>
            </div>
          </div>
        )}
        {error && <div className="notice danger">{error}</div>}
      </div>
      <div className="chat-input">
        {files.length > 0 && (
          <div className="wrap" style={{ marginBottom: 6 }}>
            {files.map((f) => (
              <span className="chip" key={f.name}>
                {f.name}
                <button
                  className="btn sm ghost"
                  style={{ height: 16, padding: '0 4px' }}
                  onClick={() => setFiles(files.filter((x) => x.name !== f.name))}
                >×</button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={text}
          placeholder={emp.agentResolved ? `Message ${emp.name}…` : 'Attach an agent to send messages'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!emp.agentResolved || sending}
        />
        <div className="chat-actions">
          <label className="btn sm ghost" title="Attach text files" style={{ cursor: 'pointer' }}>
            Attach
            <input
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.ts,.js,.html,.css,.yml,.yaml,.log"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const list = Array.from(e.target.files || []).slice(0, 3);
                const next: { name: string; text: string }[] = [];
                for (const f of list) {
                  if (f.size > 300_000) { notify('err', `${f.name} is larger than 300 KB.`); continue; }
                  next.push({ name: f.name, text: await f.text() });
                }
                setFiles((cur) => [...cur, ...next].slice(0, 3));
                e.currentTarget.value = '';
              }}
            />
          </label>
          <span className="hint" style={{ flex: 1 }}>
            {emp.agentResolved
              ? `Routed to ${emp.endpointLabel || 'endpoint'}${emp.agent.model ? ` · ${emp.agent.model}` : ''}`
              : 'No endpoint bound'}
          </span>
          {!emp.agentResolved && <span style={{ color: 'var(--warn)', display: 'inline-flex' }}><IconWarning size={13} /></span>}
          <button className="btn primary sm" disabled={!text.trim() || sending || !emp.agentResolved} onClick={send}>
            <IconSend size={12} /> Send
          </button>
        </div>
      </div>
    </div>
  );
}
