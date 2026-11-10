import React, { useEffect, useRef, useState } from 'react';
import { useCompany } from '../lib/store';
import { api } from '../lib/api';
import { Avatar, Empty, Modal, Notice, clock } from './common';
import { IconClose, IconMeeting, IconSend } from './icons';

export function MeetingComposer({ preselect, onClose }: { preselect: string[]; onClose: () => void }) {
  const { snap, act } = useCompany();
  const [selected, setSelected] = useState<string[]>(preselect);
  const [topic, setTopic] = useState('Project stand-up');
  if (!snap) return null;

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Modal
      title="Start a meeting"
      subtitle="The office relays your message to each participant and shows the replies in order."
      onClose={onClose}
      footer={
        <>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn primary"
            disabled={selected.length < 2}
            onClick={async () => {
              const res = await act(() => api.post('/api/meetings', { participantIds: selected, topic }), { ok: 'Meeting started.' });
              if (res) onClose();
            }}
          >Start meeting</button>
        </>
      }
    >
      <Notice kind="info">
        Arena AI exposes no agent-to-agent channel, so agents do not talk to each other. Each one receives the
        transcript so far and replies once, and the office passes the results around.
      </Notice>
      <div className="field">
        <label className="label">Topic</label>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} />
      </div>
      <div className="section-title">Participants ({selected.length})</div>
      {snap.employees.map((e) => (
        <button
          key={e.id}
          className={`emp-row ${selected.includes(e.id) ? 'selected' : ''}`}
          style={{ width: '100%', background: 'none', textAlign: 'left' }}
          onClick={() => toggle(e.id)}
        >
          <Avatar employee={e} departments={snap.departments} size="sm" />
          <div className="emp-main">
            <div className="emp-name">{e.name}</div>
            <div className="emp-sub">{e.title} · {e.agent.ref ? 'agent linked' : 'no agent'}</div>
          </div>
          {selected.includes(e.id) && <span className="badge completed">selected</span>}
        </button>
      ))}
    </Modal>
  );
}

export function MeetingPanel({ meetingId, onClose }: { meetingId: string; onClose: () => void }) {
  const { snap, act, notify, refresh } = useCompany();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const meeting = snap?.meetings.find((m) => m.id === meetingId);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [meeting?.transcript.length, sending]);

  if (!snap || !meeting) return null;

  const say = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setText('');
    setSending(true);
    try {
      const res = await api.post<{ results: { name: string; ok: boolean; error?: string }[] }>(`/api/meetings/${meeting.id}/say`, { content });
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length) notify('err', `${failed.length} participant(s) could not reply: ${failed[0].error}`);
      await refresh();
    } catch (err) {
      notify('err', err instanceof Error ? err.message : 'Meeting message failed.');
      await refresh();
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="panel" style={{ width: 440 }}>
      <div className="panel-head">
        <span style={{ color: 'var(--gold)' }}><IconMeeting size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{meeting.topic}</h2>
          <div className="sub">{meeting.status === 'active' ? 'In progress' : 'Ended'} · {meeting.participantIds.length} participants</div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose size={15} /></button>
      </div>

      <div className="panel-body tight" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '10px 12px 8px' }}>
          <div className="wrap">
            {meeting.participantIds.map((id) => {
              const emp = snap.employees.find((e) => e.id === id);
              if (!emp) return null;
              return (
                <span className="chip" key={id}>
                  <Avatar employee={emp} departments={snap.departments} size="sm" /> {emp.name}
                </span>
              );
            })}
          </div>
          <div className="hint" style={{ marginTop: 6 }}>{meeting.note}</div>
        </div>

        <div className="chat-log" ref={logRef} style={{ flex: 1 }}>
          {!meeting.transcript.length && <Empty>Say something to open the meeting.</Empty>}
          {meeting.transcript.map((t) => (
            <div key={t.id} className={`msg ${t.speaker === 'ceo' ? 'user' : t.speaker === 'system' ? 'system' : 'agent'}`}>
              <div className="bubble">{t.content}</div>
              <div className="msg-meta">
                <span>{t.name}</span><span>·</span><span>{clock(t.at)}</span>
                {t.simulated && <span className="badge simulated">simulated</span>}
                {t.error && <span className="badge failed">no reply</span>}
              </div>
            </div>
          ))}
          {sending && (
            <div className="msg system">
              <div className="bubble inline"><span className="typing"><i /><i /><i /></span> relaying to {meeting.participantIds.length} agents…</div>
            </div>
          )}
        </div>

        <div className="chat-input">
          <textarea
            value={text}
            placeholder="Address the room…"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); say(); } }}
            disabled={meeting.status !== 'active' || sending}
          />
          <div className="chat-actions">
            <button className="btn ghost sm" onClick={() => act(() => api.post(`/api/meetings/${meeting.id}/end`), { ok: 'Meeting ended.' })} disabled={meeting.status !== 'active'}>
              End meeting
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn primary sm" disabled={!text.trim() || sending || meeting.status !== 'active'} onClick={say}>
              <IconSend size={12} /> Send
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
