import React from 'react';
import { useCompany } from '../lib/store';
import { api } from '../lib/api';
import { Notice } from './common';
import { IconCheck, IconLink, IconUsers, IconWarning } from './icons';

export function Onboarding({ onClose }: { onClose: () => void }) {
  const { info, act, setPanel, snap } = useCompany();

  const complete = async (next?: 'connect' | 'directory') => {
    await act(() => api.patch('/api/settings', { completeOnboarding: true }), { silent: true });
    onClose();
    if (next) setPanel(next === 'connect' ? 'settings' : 'directory');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(720px, 100%)' }}>
        <div className="modal-head">
          <div className="brand-mark" style={{ width: 34, height: 34 }}>A</div>
          <div style={{ flex: 1 }}>
            <h2>Welcome to your virtual headquarters</h2>
            <p>A top-down office for the agents you already run — nothing is simulated behind your back.</p>
          </div>
        </div>
        <div className="modal-body">
          <Notice kind="warn">
            <b>Read this first: Arena AI does not expose your agents to other apps.</b><br />
            As of {info?.checkedAt || '2026-11-10'}, arena.ai publishes no public agent API, SDK, session
            protocol or webhook, and its Terms of Use prohibit programmatic access to the service. So this
            office cannot silently log into Arena and drive the exact sessions in your browser — and it will
            not pretend to.
          </Notice>

          <div className="section-title">What that means here</div>
          <div style={{ fontSize: 12, lineHeight: 1.65, color: 'var(--muted)' }}>
            Each employee is a <b>character bound to one agent reference + one endpoint</b>. When you send a
            message or a task, the office makes a real HTTP call to that endpoint and stores whatever comes
            back. If no endpoint is bound, the employee shows <i>Offline</i> and refuses to answer instead of
            inventing a reply.
            <br /><br />
            The endpoints the office speaks are:
          </div>
          <div className="cap-list" style={{ marginTop: 8 }}>
            {(info?.supportedPaths || []).map((p) => (
              <div className="cap" key={p.kind} style={{ alignItems: 'flex-start' }}>
                <span className="yes">●</span>
                <span><b>{p.label}</b><br /><span style={{ color: 'var(--dim)' }}>{p.detail}</span></span>
              </div>
            ))}
          </div>

          <div className="section-title">What you can do right now</div>
          <div style={{ display: 'grid', gap: 7 }}>
            <div className="cap"><IconCheck size={14} /> <span>Explore the full office, departments, tasks and meetings</span></div>
            <div className="cap"><IconUsers size={14} /> <span>Hire placeholder employees, then swap them for real agents</span></div>
            <div className="cap"><IconLink size={14} /> <span>Connect an endpoint you control (bridge, gateway, private runtime)</span></div>
            <div className="cap"><IconWarning size={14} /> <span>Simulated replies are labelled everywhere and counted separately</span></div>
          </div>

          <div className="hint" style={{ marginTop: 12 }}>
            The office currently contains {snap?.employees.length || 0} placeholder employee(s). They have no agent
            attached: that is shown on every card, above their characters and in the dashboard totals.
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn ghost" onClick={() => complete()}>Explore first</button>
          <div className="spacer" />
          <button className="btn" onClick={() => complete('directory')}>Open directory</button>
          <button className="btn primary" onClick={() => complete('connect')}>
            <IconLink size={13} /> Connect my agents
          </button>
        </div>
      </div>
    </div>
  );
}
