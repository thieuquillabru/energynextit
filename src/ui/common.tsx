import React from 'react';
import type { Appearance, Department, Employee, TaskStatus } from '../types';
import { IconClose, IconWarning } from './icons';

export const STATUS_LABEL: Record<string, string> = {
  working: 'Working',
  meeting: 'In meeting',
  idle: 'Idle',
  simulated: 'Placeholder',
  offline: 'Offline',
  disconnected: 'Disconnected',
};

export const TASK_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  running: 'Running',
  waiting: 'Waiting',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
}

export function deptColor(departments: Department[], id: string) {
  return departments.find((d) => d.id === id)?.color || '#7b8794';
}

export function deptName(departments: Department[], id: string) {
  return departments.find((d) => d.id === id)?.name || 'Unassigned';
}

export function Avatar({ employee, departments, size = 'md' }: { employee: Employee; departments: Department[]; size?: 'sm' | 'md' | 'lg' }) {
  const color = deptColor(departments, employee.departmentId);
  const cls = size === 'lg' ? 'avatar lg' : size === 'sm' ? 'avatar sm' : 'avatar';
  return (
    <div
      className={cls}
      style={{ background: `linear-gradient(150deg, ${color}, ${employee.appearance.shirt})` }}
      title={employee.name}
    >
      {initials(employee.name)}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`badge ${status}`}>
      {status === 'working' && <span className="typing" style={{ marginRight: 2 }}><i /><i /><i /></span>}
      {STATUS_LABEL[status] || status}
    </span>
  );
}

export function TaskBadge({ status }: { status: TaskStatus }) {
  return <span className={`badge ${status}`}>{TASK_LABEL[status] || status}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="label">{label}</label>
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Modal({
  title, subtitle, children, footer, onClose, width,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
  width?: number;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={width ? { width: `min(${width}px, 100%)` } : undefined}>
        <div className="modal-head">
          <div style={{ flex: 1 }}>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><IconClose size={15} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Notice({ kind, children }: { kind: 'info' | 'warn' | 'danger' | 'ok'; children: React.ReactNode }) {
  return <div className={`notice ${kind}`}>{children}</div>;
}

export function timeAgo(iso: string | null) {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Math.max(0, Date.now() - then);
  const s = Math.round(diff / 1000);
  if (s < 45) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function clock(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/* ----------------------------- appearance editor ---------------------------- */

const SKINS = ['#f2cba4', '#eec49b', '#e8b98f', '#d9a273', '#c98d63', '#b87e57', '#8a5a3b'];
const HAIRS = ['#201a16', '#3a2b22', '#6b4a2f', '#a9662f', '#c9a227', '#8a8f99', '#7a3f8f'];
const SHIRTS = ['#3f8efc', '#f2655a', '#4fb286', '#f2994a', '#9b6bf2', '#37b6c9', '#c9a227', '#e0e6ef', '#7b8794'];
const PANTS = ['#2b3444', '#37323e', '#2f3a36', '#2d2f36', '#33303d', '#1f2430'];
const HAIRSTYLES = ['short', 'bun', 'long', 'curly', 'bald'];
const ACCESSORIES: { id: string | null; label: string }[] = [
  { id: null, label: 'None' },
  { id: 'glasses', label: 'Glasses' },
  { id: 'headset', label: 'Headset' },
  { id: 'earpiece', label: 'Earpiece' },
  { id: 'badge', label: 'Badge' },
];

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="wrap">
      {colors.map((c) => (
        <button
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          style={{
            width: 24, height: 24, borderRadius: 7, background: c, cursor: 'pointer',
            border: value === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
            boxShadow: value === c ? '0 0 0 2px rgba(87,224,255,0.6)' : 'none',
          }}
        />
      ))}
    </div>
  );
}

export function AppearanceEditor({ value, onChange }: { value: Appearance; onChange: (a: Appearance) => void }) {
  const set = (patch: Partial<Appearance>) => onChange({ ...value, ...patch });
  return (
    <div>
      <div className="field">
        <label className="label">Hair style</label>
        <div className="wrap">
          {HAIRSTYLES.map((h) => (
            <button
              key={h}
              className={`btn sm ${value.hairStyle === h ? 'active' : 'ghost'}`}
              onClick={() => set({ hairStyle: h })}
            >
              {h}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="label">Skin</label>
        <Swatches colors={SKINS} value={value.skin} onChange={(skin) => set({ skin })} />
      </div>
      <div className="field">
        <label className="label">Hair colour</label>
        <Swatches colors={HAIRS} value={value.hair} onChange={(hair) => set({ hair })} />
      </div>
      <div className="field">
        <label className="label">Shirt</label>
        <Swatches colors={SHIRTS} value={value.shirt} onChange={(shirt) => set({ shirt })} />
      </div>
      <div className="field">
        <label className="label">Trousers</label>
        <Swatches colors={PANTS} value={value.pants} onChange={(pants) => set({ pants })} />
      </div>
      <div className="field">
        <label className="label">Accessory</label>
        <div className="wrap">
          {ACCESSORIES.map((a) => (
            <button
              key={a.label}
              className={`btn sm ${value.accessory === a.id ? 'active' : 'ghost'}`}
              onClick={() => set({ accessory: a.id })}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div className="hint">
        Appearance is purely visual. It never changes the agent's model, instructions or tools.
      </div>
    </div>
  );
}

export function InlineWarning({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline" style={{ alignItems: 'flex-start', gap: 6, color: 'var(--warn)', fontSize: 11, lineHeight: 1.5 }}>
      <IconWarning size={13} />
      <span>{children}</span>
    </div>
  );
}
