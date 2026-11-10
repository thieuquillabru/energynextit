import { useEffect, useRef } from 'react';
import type { Appearance } from '../types';
import { blitCharacter, drawCharacterShadow, type DirKey, type Pose } from '../engine/sprites';

/* ------------------------------- donut ----------------------------------- */

export type Segment = { label: string; value: number; color: string };

/**
 * Real data only: every arc is a count that comes from the store.
 */
export function Donut({
  segments,
  total,
  caption,
  size = 104,
  thickness = 12,
}: {
  segments: Segment[];
  total: number;
  caption: string;
  size?: number;
  thickness?: number;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const sum = segments.reduce((acc, s) => acc + s.value, 0);
  let offset = 0;

  return (
    <div className="chart-wrap">
      <svg className="donut" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={caption}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(126,154,189,0.14)" strokeWidth={thickness} />
        {sum > 0 &&
          segments.map((s, i) => {
            if (!s.value) return null;
            const len = (s.value / sum) * c;
            const dash = `${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`;
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })}
        <text x="50%" y="47%" textAnchor="middle" fontSize="18" fontWeight="620" fill="#eef3fa">
          {total}
        </text>
        <text x="50%" y="63%" textAnchor="middle" fontSize="8" letterSpacing="1.2" fill="#6d7b8e">
          {caption.toUpperCase()}
        </text>
      </svg>
      <div className="legend">
        {segments.map((s) => (
          <div className="legend-item" key={s.label}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{s.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------ portrait --------------------------------- */

/**
 * Renders the employee's actual in-office character, so a panel and the office
 * can never show different people.
 */
export function Portrait({ appearance, pose = 'sit', dir = 'down' }: { appearance: Appearance; pose?: Pose; dir?: DirKey }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 240;
    const h = 150;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // backdrop: desk lamp pool + floor line
    const glow = ctx.createRadialGradient(w / 2, h * 0.42, 6, w / 2, h * 0.42, h * 0.9);
    glow.addColorStop(0, 'rgba(92,200,232,0.16)');
    glow.addColorStop(1, 'rgba(92,200,232,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(126,154,189,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, h - 24);
    ctx.lineTo(w - 24, h - 24);
    ctx.stroke();

    ctx.save();
    ctx.translate(w / 2, h - 32);
    ctx.scale(1.5, 1.5);
    drawCharacterShadow(ctx, 0, 0, 1.1);
    blitCharacter(ctx, appearance, pose, dir, 0, 0, 0);
    ctx.restore();

    // soft vignette
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,8,12,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }, [appearance, pose, dir]);

  return <canvas ref={ref} className="portrait" aria-hidden="true" />;
}
