import React, { useEffect, useRef } from 'react';
import { useCompany } from '../lib/store';
import type { PanelId } from '../types';
import { IconRefresh } from './icons';
import {
  IconActivity, IconBuilding, IconDashboard, IconEdit, IconLink, IconMaximize,
  IconProject, IconSettings, IconTarget, IconTasks, IconUsers, IconZoomIn,
  IconZoomOut, IconPlus, IconMeeting, IconClose,
} from './icons';

/* --------------------------------- top bar -------------------------------- */

export function TopBar({ onNewTask, onMeeting }: { onNewTask: () => void; onMeeting: () => void }) {
  const { snap, setPanel, refresh, setSelectedId } = useCompany();
  if (!snap) return null;
  const c = snap.counts;

  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">A</div>
        <div className="brand-text">
          <strong>{snap.settings.companyName}</strong>
          <span>Virtual headquarters</span>
        </div>
      </div>

      <div className="stat-chips">
        <span className="chip info"><span className="dot" /><b>{c.connected}</b> connected</span>
        <span className="chip"><span className="dot" style={{ background: '#57e0ff' }} /><b>{c.working}</b> working</span>
        <span className="chip warn"><b>{c.simulated}</b> placeholders</span>
        <span className="chip ok"><b>{c.completed}</b> done</span>
        {c.failed > 0 && <span className="chip danger"><b>{c.failed}</b> failed</span>}
      </div>

      <div className="spacer" />

      <div className="topbar-actions">
        <button className="btn ghost" onClick={() => refresh()} title="Refresh state"><IconRefresh size={14} /></button>
        <button className="btn" onClick={onMeeting}><IconMeeting size={14} /> Meeting</button>
        <button className="btn" onClick={() => { setSelectedId(null); setPanel('settings'); }}><IconLink size={14} /> Connections</button>
        <button className="btn primary" onClick={onNewTask}><IconPlus size={14} /> Assign task</button>
      </div>
    </div>
  );
}

/* --------------------------------- side nav -------------------------------- */

const NAV: { id: PanelId; label: string; Icon: React.FC<{ size?: number }> }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: IconDashboard },
  { id: 'directory', label: 'Employee directory', Icon: IconUsers },
  { id: 'tasks', label: 'Tasks', Icon: IconTasks },
  { id: 'departments', label: 'Departments', Icon: IconBuilding },
  { id: 'projects', label: 'Projects', Icon: IconProject },
  { id: 'activity', label: 'Activity', Icon: IconActivity },
  { id: 'settings', label: 'Connections & settings', Icon: IconSettings },
];

export function SideNav() {
  const { snap, panel, setPanel, setSelectedId } = useCompany();
  if (!snap) return null;
  const badges: Record<string, number> = {
    tasks: snap.counts.pending + snap.counts.running,
    directory: snap.counts.employees,
  };
  return (
    <div className="sidenav">
      {NAV.map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`nav-btn ${panel === id ? 'active' : ''}`}
          onClick={() => {
            setSelectedId(null);
            setPanel(panel === id ? null : id);
          }}
          aria-label={label}
        >
          <Icon size={19} />
          <span className="tip">{label}</span>
          {badges[id!] ? <span className="count">{badges[id!]}</span> : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------- view controls ---------------------------- */

type SceneApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  reset: () => void;
  focusSelected: () => void;
  toggleEditor: () => void;
};

export function ViewControls({ editor, api }: { editor: boolean; api: SceneApi }) {
  const { zoomLabel } = useCompany();
  return (
    <div className="bottombar">
      <button className="icon-btn" onClick={api.zoomOut} title="Zoom out"><IconZoomOut size={16} /></button>
      <span className="zoom-readout">{Math.round(zoomLabel * 100)}%</span>
      <button className="icon-btn" onClick={api.zoomIn} title="Zoom in"><IconZoomIn size={16} /></button>
      <span className="divider" />
      <button className="icon-btn" onClick={api.fit} title="Fit the whole office"><IconMaximize size={16} /></button>
      <button className="icon-btn" onClick={api.reset} title="Reset camera"><IconRefresh size={15} /></button>
      <button className="icon-btn" onClick={api.focusSelected} title="Focus selected employee"><IconTarget size={16} /></button>
      <span className="divider" />
      <button className={`btn sm ${editor ? 'active' : ''}`} onClick={api.toggleEditor}>
        <IconEdit size={13} /> {editor ? 'Editing layout' : 'Edit layout'}
      </button>
    </div>
  );
}

/* --------------------------------- minimap -------------------------------- */

export function Minimap({ scene, hidden, onNavigate }: { scene: { drawMinimap: (c: HTMLCanvasElement) => void } | null; hidden?: boolean; onNavigate: (p: { x: number; y: number }) => void }) {
  const { snap } = useCompany();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!scene) return;
    const timer = setInterval(() => {
      if (canvasRef.current) scene.drawMinimap(canvasRef.current);
    }, 350);
    return () => clearInterval(timer);
  }, [scene]);

  if (!snap) return null;

  return (
    <div
      className="minimap"
      style={hidden ? { display: 'none' } : undefined}
      title="Click to move the camera"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const world = snap.office.world;
        const scale = Math.min(rect.width / world.w, rect.height / world.h) * 0.94;
        const ox = (rect.width - world.w * scale) / 2;
        const oy = (rect.height - world.h * scale) / 2;
        onNavigate({
          x: (e.clientX - rect.left - ox) / scale,
          y: (e.clientY - rect.top - oy) / scale,
        });
      }}
    >
      <canvas ref={canvasRef} />
      <div className="minimap-head">Office map</div>
    </div>
  );
}

/* --------------------------------- toasts --------------------------------- */

export function Toasts() {
  const { toasts, dismissToast } = useCompany();
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} onClick={() => dismissToast(t.id)}>
          <span className="ico" style={{ color: t.kind === 'err' ? 'var(--danger)' : t.kind === 'ok' ? 'var(--ok)' : 'var(--accent)' }}>
            {t.kind === 'err' ? '⚠' : t.kind === 'ok' ? '✓' : 'ℹ'}
          </span>
          <span style={{ flex: 1 }}>{t.text}</span>
          <button className="icon-btn" style={{ width: 20, height: 20, border: 'none', background: 'transparent' }}>
            <IconClose size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- boot screen ------------------------------ */

export function BootScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const { loading } = useCompany();
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: '#0a0d13', zIndex: 200 }}>
      <div style={{ textAlign: 'center', maxWidth: 460, padding: 24 }}>
        <div style={{ width: 54, height: 54, borderRadius: 16, margin: '0 auto 16px', background: 'linear-gradient(145deg,#57e0ff,#6f8dff 55%,#a06bff)', display: 'grid', placeItems: 'center', fontSize: 24, fontWeight: 800, color: '#061018' }}>A</div>
        <h2 style={{ margin: '0 0 6px', fontSize: 17 }}>Arena Virtual Company</h2>
        {error ? (
          <>
            <p style={{ color: '#ffb9b3', fontSize: 12, lineHeight: 1.6 }}>{error}</p>
            <button className="btn primary" style={{ marginTop: 12 }} onClick={onRetry}>Try again</button>
          </>
        ) : (
          <p style={{ color: '#93a1b5', fontSize: 12 }}>{loading ? 'Building the office…' : 'Starting…'}</p>
        )}
      </div>
    </div>
  );
}
