import type { Appearance, Door, FurnitureItem, Office, Room } from '../types';
import { furnitureSize, stationGeom } from './layout';

export type Pose = 'idle' | 'walk' | 'sit' | 'type' | 'think' | 'meet' | 'talk';
export type DirKey = 'up' | 'down' | 'left' | 'right';

/* ========================================================================== *
 * Art direction — "Nordic tech HQ"
 *
 * Cool slate architecture, warm oak millwork, muted sage/brass accents, soft
 * north daylight. Everything is drawn procedurally with one light direction
 * (top-left) so furniture, characters and rooms share a single lighting model.
 * ========================================================================== */

export const PALETTE = {
  void: '#0c0f15',
  floorShadow: 'rgba(4,7,12,0.55)',

  wall: '#3c4655',
  wallTop: '#525f72',
  wallDark: '#232b36',
  wallTrim: '#5d6b80',
  skirting: '#2a323e',

  woodA: '#6b5138',
  woodB: '#7d5e40',
  woodLine: '#5a4028',
  oakTop: '#8a6844',
  oakEdge: '#5f4529',
  walnut: '#4a3527',
  walnutLight: '#5b4231',

  carpetA: '#39434f',
  carpetB: '#404b58',
  tileA: '#c3cbd2',
  tileB: '#b3bcc4',
  concrete: '#5a626c',

  glass: '#a9d4e8',
  metal: '#9aa6b4',
  metalDark: '#5c6774',
  steel: '#7d8896',

  deskTop: '#7c6144',
  deskEdge: '#5f4529',
  deskTrim: '#3d2c1c',
  execTop: '#4a3527',
  execEdge: '#2f2117',

  gold: '#c2a05a',
  brass: '#b08d4a',
  screen: '#0a1119',
  glow: '#5fd0e8',

  leafA: '#3f7a52',
  leafB: '#559a63',
  leafC: '#2f6242',
  pot: '#8f5741',
  potRim: '#a76c52',

  fabric: '#3b4a63',
  fabricDark: '#28323f',
  leather: '#4b3a2c',
  paper: '#e8e6df',
} as const;

/* ------------------------------- utilities ------------------------------- */

const shadeCache = new Map<string, string>();

export function shade(hex: string, amt: number) {
  const key = `${hex}|${amt}`;
  const hit = shadeCache.get(key);
  if (hit) return hit;
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(full, 16);
  let r = (num >> 16) & 255;
  let g = (num >> 8) & 255;
  let b = num & 255;
  if (amt >= 0) {
    r = Math.round(r + (255 - r) * amt);
    g = Math.round(g + (255 - g) * amt);
    b = Math.round(b + (255 - b) * amt);
  } else {
    r = Math.round(r * (1 + amt));
    g = Math.round(g * (1 + amt));
    b = Math.round(b * (1 + amt));
  }
  const out = `rgb(${r},${g},${b})`;
  shadeCache.set(key, out);
  return out;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Deterministic pseudo-random in [0,1) from coordinates — no per-frame flicker. */
function hash(x: number, y: number, seed = 0) {
  let h = Math.imul(Math.round(x) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(y) + seed, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

function shadowUnder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, softness = 8, alpha = 0.28) {
  const g = ctx.createLinearGradient(0, y + h - 2, 0, y + h + softness);
  g.addColorStop(0, `rgba(4,7,11,${alpha})`);
  g.addColorStop(1, 'rgba(4,7,11,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - softness * 0.4, y + h - 2, w + softness * 0.8, softness);
}

const patternCache = new Map<string, HTMLCanvasElement>();

function materialPattern(
  ctx: CanvasRenderingContext2D,
  key: string,
  size: number,
  paint: (c: CanvasRenderingContext2D, s: number) => void,
) {
  let canvas = patternCache.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext('2d')!;
    paint(c, size);
    patternCache.set(key, canvas);
  }
  return ctx.createPattern(canvas, 'repeat');
}

/* ================================ FLOORS ================================= */

function carpetPattern(ctx: CanvasRenderingContext2D, tint: string) {
  return materialPattern(ctx, `carpet:${tint}`, 64, (c, s) => {
    c.fillStyle = tint;
    c.fillRect(0, 0, s, s);
    // fine woven speckle
    for (let i = 0; i < 260; i++) {
      const x = hash(i, 3) * s;
      const y = hash(i, 7) * s;
      c.fillStyle = hash(i, 11) > 0.5 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.075)';
      c.fillRect(x, y, 1.4, 1.4);
    }
    // faint pile direction instead of a hard tile grid
    c.strokeStyle = 'rgba(0,0,0,0.045)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, s - 0.5);
    c.lineTo(s, s - 0.5);
    c.stroke();
  });
}

function woodPattern(ctx: CanvasRenderingContext2D, base: string) {
  return materialPattern(ctx, `wood:${base}`, 128, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    const plank = 32;
    for (let row = 0; row < s / plank; row++) {
      const y = row * plank;
      const tone = (hash(row, 1) - 0.5) * 0.12;
      c.fillStyle = tone > 0 ? `rgba(255,236,205,${tone})` : `rgba(0,0,0,${-tone})`;
      c.fillRect(0, y, s, plank);
      // grain
      c.strokeStyle = 'rgba(74,48,26,0.16)';
      c.lineWidth = 1;
      for (let g = 0; g < 5; g++) {
        const gy = y + 4 + g * 6 + hash(row, g) * 3;
        c.beginPath();
        c.moveTo(0, gy);
        for (let x = 0; x <= s; x += 16) c.lineTo(x, gy + Math.sin((x + row * 13 + g * 7) / 22) * 1.1);
        c.stroke();
      }
      // plank seam
      c.fillStyle = 'rgba(38,24,12,0.35)';
      c.fillRect(0, y + plank - 1, s, 1);
      const offset = (row % 2) * (s / 2);
      c.fillRect((offset + s / 4) % s, y, 1, plank);
    }
    // polish
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, 'rgba(255,245,225,0.06)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.06)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

function tilePattern(ctx: CanvasRenderingContext2D) {
  return materialPattern(ctx, 'tile', 96, (c, s) => {
    c.fillStyle = PALETTE.tileA;
    c.fillRect(0, 0, s, s);
    const t = 48;
    for (let row = 0; row < s / t; row++) {
      for (let col = 0; col < s / t; col++) {
        const x = col * t;
        const y = row * t;
        const v = (hash(col, row) - 0.5) * 0.06;
        c.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
        c.fillRect(x + 1, y + 1, t - 2, t - 2);
        // faint marble vein
        c.strokeStyle = 'rgba(120,132,144,0.18)';
        c.lineWidth = 0.8;
        c.beginPath();
        const vx = x + 8 + hash(col, row, 3) * 30;
        c.moveTo(vx, y + 4);
        c.quadraticCurveTo(vx + 10, y + 20, vx - 4, y + 40);
        c.stroke();
        // bevel
        c.strokeStyle = 'rgba(255,255,255,0.35)';
        c.beginPath();
        c.moveTo(x + 1, y + t - 1);
        c.lineTo(x + 1, y + 1);
        c.lineTo(x + t - 1, y + 1);
        c.stroke();
      }
    }
    c.strokeStyle = 'rgba(96,106,118,0.55)';
    c.lineWidth = 1.6;
    for (let i = 0; i <= s; i += t) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i, s); c.stroke();
      c.beginPath(); c.moveTo(0, i); c.lineTo(s, i); c.stroke();
    }
  });
}

function concretePattern(ctx: CanvasRenderingContext2D) {
  return materialPattern(ctx, 'concrete', 128, (c, s) => {
    c.fillStyle = PALETTE.concrete;
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 420; i++) {
      const x = hash(i, 2) * s;
      const y = hash(i, 5) * s;
      const a = hash(i, 9) * 0.09;
      c.fillStyle = hash(i, 13) > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
      c.fillRect(x, y, 1.6, 1.6);
    }
    // pour joints
    c.strokeStyle = 'rgba(28,32,38,0.30)';
    c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(0, s / 2); c.lineTo(s, s / 2); c.stroke();
    c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s); c.stroke();
    // soft sheen
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.0)');
    g.addColorStop(1, 'rgba(0,0,0,0.08)');
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
}

export function paintFloor(ctx: CanvasRenderingContext2D, room: Room, tint?: string) {
  const { x, y, w, h } = room;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  let pattern: CanvasPattern | null = null;
  if (room.floor === 'wood') pattern = woodPattern(ctx, PALETTE.woodA);
  else if (room.floor === 'tile') pattern = tilePattern(ctx);
  else if (room.floor === 'concrete') pattern = concretePattern(ctx);
  else pattern = carpetPattern(ctx, PALETTE.carpetA);

  ctx.fillStyle = pattern || PALETTE.carpetA;
  ctx.fillRect(x, y, w, h);

  // room-level grade: daylight from the top, weight at the bottom
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(206,228,255,0.10)');
  g.addColorStop(0.35, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(6,10,16,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // corner falloff keeps big rooms from reading flat
  const rg = ctx.createRadialGradient(x + w / 2, y + h / 2, Math.min(w, h) * 0.2, x + w / 2, y + h / 2, Math.max(w, h) * 0.72);
  rg.addColorStop(0, 'rgba(255,255,255,0.03)');
  rg.addColorStop(1, 'rgba(0,0,0,0.16)');
  ctx.fillStyle = rg;
  ctx.fillRect(x, y, w, h);

  if (tint) {
    ctx.globalAlpha = 0.055;
    ctx.fillStyle = tint;
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/* ============================== ARCHITECTURE ============================= */

export function drawBuildingBase(ctx: CanvasRenderingContext2D, office: Office) {
  const { world } = office;
  // structure plate
  const g = ctx.createLinearGradient(0, 0, 0, world.h);
  g.addColorStop(0, '#161b23');
  g.addColorStop(1, '#0e1218');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, world.w, world.h);

  // floor plate under corridors
  ctx.fillStyle = 'rgba(96,106,120,0.16)';
  ctx.fillRect(24, 24, world.w - 48, world.h - 48);

  // outer structure
  ctx.strokeStyle = '#1a2029';
  ctx.lineWidth = 26;
  ctx.strokeRect(13, 13, world.w - 26, world.h - 26);
  ctx.strokeStyle = '#2b3441';
  ctx.lineWidth = 18;
  ctx.strokeRect(15, 15, world.w - 30, world.h - 30);
  ctx.strokeStyle = 'rgba(148,166,190,0.16)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(25, 25, world.w - 50, world.h - 50);
}

function wallSegment(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, opts: { glass?: boolean } = {}) {
  if (w <= 0 || h <= 0) return;
  if (opts.glass) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, 'rgba(150,200,225,0.30)');
    g.addColorStop(0.45, 'rgba(196,226,240,0.18)');
    g.addColorStop(1, 'rgba(120,170,200,0.26)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(24,34,46,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.strokeStyle = 'rgba(232,246,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (w > h) { ctx.moveTo(x + 3, y + h - 2.5); ctx.lineTo(x + w - 3, y + h - 2.5); }
    else { ctx.moveTo(x + w - 2.5, y + 3); ctx.lineTo(x + w - 2.5, y + h - 3); }
    ctx.stroke();
    return;
  }
  // three-tone wall: shadow, body, lit top edge
  ctx.fillStyle = PALETTE.wallDark;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PALETTE.wall;
  ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  const top = h >= w;
  ctx.fillStyle = PALETTE.wallTop;
  if (top) ctx.fillRect(x + 1, y + 1, Math.max(2, w * 0.32), h - 2);
  else ctx.fillRect(x + 1, y + 1, w - 2, Math.max(2, h * 0.32));
  ctx.fillStyle = 'rgba(190,210,235,0.18)';
  if (top) ctx.fillRect(x + 1, y + 1, 1.5, h - 2);
  else ctx.fillRect(x + 1, y + 1, w - 2, 1.5);
}

export function drawWalls(ctx: CanvasRenderingContext2D, office: Office) {
  const t = office.wall || 12;
  for (const room of office.rooms) {
    const { x, y, w, h } = room;
    // north wall: glass frontage for department rooms, solid elsewhere
    const glazed = room.floor === 'carpet' && room.kind !== 'ceo';
    if (glazed) {
      const door = office.doors.find((d) => d.roomId === room.id);
      const left = door ? door.x : x + w / 2;
      ctx.save();
      wallSegment(ctx, x, y, left - x, t * 0.5);
      wallSegment(ctx, left + (door?.w || 0), y, x + w - (left + (door?.w || 0)), t * 0.5);
      ctx.restore();
    } else {
      wallSegment(ctx, x, y, w, t);
    }
    wallSegment(ctx, x, y + h - t, w, t);              // south
    wallSegment(ctx, x, y, t, h);                      // west
    wallSegment(ctx, x + w - t, y, t, h);              // east

    // skirting + contact shadow inside the room
    ctx.strokeStyle = 'rgba(10,14,20,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + t - 1, y + t - 1, w - t * 2 + 2, h - t * 2 + 2);

    const inner = ctx.createLinearGradient(0, y + t, 0, y + t + 26);
    inner.addColorStop(0, 'rgba(4,7,12,0.34)');
    inner.addColorStop(1, 'rgba(4,7,12,0)');
    ctx.fillStyle = inner;
    ctx.fillRect(x + t, y + t, w - t * 2, 26);

    const side = ctx.createLinearGradient(x + t, 0, x + t + 20, 0);
    side.addColorStop(0, 'rgba(4,7,12,0.22)');
    side.addColorStop(1, 'rgba(4,7,12,0)');
    ctx.fillStyle = side;
    ctx.fillRect(x + t, y + t, 20, h - t * 2);
  }
}

export function drawWindows(ctx: CanvasRenderingContext2D, office: Office) {
  const t = office.wall || 12;
  const top = office.rooms.filter((r) => r.y <= 60).sort((a, b) => a.x - b.x);
  for (const room of top) {
    const panes = Math.max(2, Math.floor(room.w / 96));
    const pad = 18;
    const usable = room.w - pad * 2;
    const pw = usable / panes;
    for (let i = 0; i < panes; i++) {
      const x = room.x + pad + i * pw + 4;
      const y = room.y - t - 1;
      const w = pw - 8;
      const h = t * 0.62;
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, '#dff2ff');
      g.addColorStop(0.5, '#a9cde4');
      g.addColorStop(1, '#7fa8c4');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x, y, w, 1.4);
      // mullion
      ctx.fillStyle = 'rgba(30,38,48,0.85)';
      if (i > 0) ctx.fillRect(x - 4, y - 2, 2.4, h + 4);
    }
  }
}

export function drawDoorFrames(ctx: CanvasRenderingContext2D, office: Office) {
  for (const door of office.doors) {
    const { x, y, w, h } = door;
    const horizontal = door.orientation === 'h';
    if (horizontal) {
      // sliding glass door leaf
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, 'rgba(188,222,238,0.45)');
      g.addColorStop(1, 'rgba(140,186,210,0.28)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(22,30,40,0.95)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = 'rgba(240,250,255,0.45)';
      ctx.fillRect(x + 3, y + 2, w - 6, 2);
      ctx.fillStyle = 'rgba(226,240,250,0.85)';
      ctx.fillRect(x + w / 2 - 0.75, y + 3, 1.5, h - 6);
      // door handle
      ctx.fillStyle = PALETTE.metal;
      roundRect(ctx, x + w - 12, y + h / 2 - 1.5, 6, 3, 1.5);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(180,214,232,0.35)';
      ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(22,30,40,0.95)';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    }
  }
}

/* =============================== FURNITURE =============================== */

const woodTone = (item: FurnitureItem) => item.color || PALETTE.deskTop;

function surface(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, radius = 4) {
  // top face with a light top-left edge and a darker bottom lip
  ctx.fillStyle = shade(base, -0.34);
  roundRect(ctx, x, y, w, h + 3, radius);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w * 0.6, y + h);
  g.addColorStop(0, shade(base, 0.12));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.16));
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,247,232,0.20)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + radius, y + 0.6);
  ctx.lineTo(x + w - radius, y + 0.6);
  ctx.stroke();
  // wood grain on wide surfaces
  if (w > 60) {
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, x, y, w, h, radius);
    ctx.clip();
    ctx.strokeStyle = 'rgba(52,34,18,0.13)';
    ctx.lineWidth = 1;
    for (let i = 0; i < Math.min(6, h / 8); i++) {
      const gy = y + 7 + i * 8;
      ctx.beginPath();
      ctx.moveTo(x, gy);
      for (let gx = x; gx <= x + w; gx += 18) ctx.lineTo(gx, gy + Math.sin((gx + i * 9) / 26) * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function monitor(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, accent: string, powered = true) {
  // stand
  ctx.fillStyle = PALETTE.metalDark;
  ctx.fillRect(x + w / 2 - 3, y + h, 6, 5);
  roundRect(ctx, x + w / 2 - 11, y + h + 4, 22, 3.5, 1.5);
  ctx.fill();
  // bezel
  ctx.fillStyle = '#12171f';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  // screen
  const g = ctx.createLinearGradient(x, y, x, y + h);
  if (powered) {
    g.addColorStop(0, '#12313f');
    g.addColorStop(1, '#0a1c27');
  } else {
    g.addColorStop(0, '#191f27');
    g.addColorStop(1, '#0f141a');
  }
  ctx.fillStyle = g;
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 2);
  ctx.fill();
  if (powered) {
    // window chrome + content lines
    ctx.fillStyle = 'rgba(95,208,232,0.85)';
    ctx.fillRect(x + 3, y + 3, w - 6, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.fillRect(x + 3, y + 6.5, w * 0.42, 1.2);
    ctx.fillStyle = accent;
    const lines = Math.max(2, Math.floor((h - 12) / 4));
    for (let i = 0; i < lines; i++) {
      ctx.globalAlpha = 0.45 + hash(x + i, y) * 0.4;
      ctx.fillRect(x + 3, y + 10 + i * 4, (w - 8) * (0.35 + hash(y + i, x) * 0.55), 1.6);
    }
    ctx.globalAlpha = 1;
    // sheen
    const s = ctx.createLinearGradient(x, y, x + w, y + h);
    s.addColorStop(0, 'rgba(255,255,255,0.10)');
    s.addColorStop(0.5, 'rgba(255,255,255,0)');
    ctx.fillStyle = s;
    roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 2);
    ctx.fill();
  }
}

function keyboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number) {
  ctx.fillStyle = '#20262e';
  roundRect(ctx, x, y, w, 11, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < Math.floor(w / 4); c++) ctx.fillRect(x + 2 + c * 4, y + 2 + r * 4, 2.4, 2);
  }
  ctx.fillStyle = PALETTE.metal;
  ctx.fillRect(x + w + 4, y + 1, 3, 5); // mouse
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(x + w + 4, y + 1, 3, 1.4);
}

function mug(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, 7, 8, 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(x + 8, y + 4, 2.4, -1.2, 1.2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.30)';
  ctx.fillRect(x + 1, y + 1, 1.6, 5);
}

function paperStack(ctx: CanvasRenderingContext2D, x: number, y: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.20)';
  ctx.fillRect(x + 1, y + 1, 16, 11);
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(x, y, 16, 10);
  ctx.fillStyle = 'rgba(120,130,145,0.45)';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 2, y + 2.5 + i * 2.6, 11 - i * 2, 1);
}

function plant(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const cx = x + w / 2;
  const baseY = y + h;
  // pot
  const potW = w * 0.52;
  const potH = h * 0.34;
  const p = ctx.createLinearGradient(cx - potW / 2, 0, cx + potW / 2, 0);
  p.addColorStop(0, shade(PALETTE.pot, -0.18));
  p.addColorStop(0.5, PALETTE.pot);
  p.addColorStop(1, shade(PALETTE.pot, -0.26));
  ctx.fillStyle = p;
  roundRect(ctx, cx - potW / 2, baseY - potH, potW, potH, 3);
  ctx.fill();
  ctx.fillStyle = PALETTE.potRim;
  roundRect(ctx, cx - potW / 2 - 1.5, baseY - potH - 2, potW + 3, 4, 2);
  ctx.fill();
  // foliage: layered leaves
  const top = baseY - potH;
  const leaves = 9;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + 0.4;
    const len = h * (0.34 + hash(i, x) * 0.24);
    const lx = cx + Math.cos(a) * potW * 0.42;
    const ly = top - len * 0.42;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(a * 0.5);
    ctx.fillStyle = i % 3 === 0 ? PALETTE.leafC : i % 3 === 1 ? PALETTE.leafA : PALETTE.leafB;
    ctx.beginPath();
    ctx.ellipse(0, 0, len * 0.30, len * 0.52, a * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY - 1, potW * 0.5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

function bookshelf(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 6, 0.25);
  ctx.fillStyle = '#2f2620';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.fillStyle = '#463529';
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, 2);
  ctx.fill();
  const shelves = 2;
  const shelfH = (h - 6) / shelves;
  for (let s = 0; s < shelves; s++) {
    const sy = y + 3 + s * shelfH;
    ctx.fillStyle = 'rgba(12,8,6,0.55)';
    ctx.fillRect(x + 3, sy, w - 6, shelfH - 3);
    let bx = x + 5;
    let i = 0;
    while (bx < x + w - 8) {
      const bw = 3 + Math.floor(hash(bx, sy) * 4);
      const bh = shelfH * (0.5 + hash(sy, bx) * 0.32);
      const colors = ['#8c4b3f', '#3f6b8c', '#6b7f4a', '#b08d4a', '#5b4a6b', '#8a8378'];
      ctx.fillStyle = colors[Math.floor(hash(bx, sy, 3) * colors.length)];
      ctx.fillRect(bx, sy + (shelfH - 3) - bh, bw, bh);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(bx, sy + (shelfH - 3) - bh, bw, 1);
      bx += bw + 1.5;
      i++;
      if (i > 40) break;
    }
    ctx.fillStyle = 'rgba(30,22,16,0.9)';
    ctx.fillRect(x + 3, sy + shelfH - 3.5, w - 6, 2.5);
  }
  ctx.strokeStyle = 'rgba(255,226,190,0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
}

function cabinet(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 6, 0.26);
  ctx.fillStyle = '#39424e';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#4c5765');
  g.addColorStop(1, '#333c47');
  ctx.fillStyle = g;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 2.5);
  ctx.fill();
  const drawers = w > h ? 2 : 3;
  for (let i = 1; i < drawers; i++) {
    ctx.fillStyle = 'rgba(16,20,26,0.55)';
    if (w > h) ctx.fillRect(x + (w / drawers) * i, y + 3, 1.2, h - 6);
    else ctx.fillRect(x + 3, y + (h / drawers) * i, w - 6, 1.2);
  }
  ctx.fillStyle = PALETTE.metal;
  const handles = w > h ? 2 : 3;
  for (let i = 0; i < handles; i++) {
    if (w > h) roundRect(ctx, x + (w / handles) * (i + 0.5) - 5, y + h / 2 - 1, 10, 2, 1);
    else roundRect(ctx, x + w / 2 - 5, y + (h / handles) * (i + 0.5) - 1, 10, 2, 1);
    ctx.fill();
  }
}

function sofa(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y + 4, w, h - 4, 8, 0.30);
  const fabric = '#3d4a5e';
  // back
  ctx.fillStyle = shade(fabric, -0.24);
  roundRect(ctx, x, y, w, h * 0.42, 6);
  ctx.fill();
  // seat
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, shade(fabric, 0.10));
  g.addColorStop(1, shade(fabric, -0.14));
  ctx.fillStyle = g;
  roundRect(ctx, x + 2, y + h * 0.26, w - 4, h * 0.62, 6);
  ctx.fill();
  // cushions
  const cushions = Math.max(2, Math.round(w / 52));
  for (let i = 1; i < cushions; i++) {
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + (w / cushions) * i, y + h * 0.34);
    ctx.lineTo(x + (w / cushions) * i, y + h * 0.84);
    ctx.stroke();
  }
  // arms
  ctx.fillStyle = shade(fabric, -0.10);
  roundRect(ctx, x - 1, y + h * 0.18, 9, h * 0.66, 4);
  ctx.fill();
  roundRect(ctx, x + w - 8, y + h * 0.18, 9, h * 0.66, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 2, y + h * 0.27, w - 4, 2, 1);
  ctx.stroke();
}

function coffeeTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 6, 0.22);
  ctx.fillStyle = 'rgba(16,20,26,0.8)';
  roundRect(ctx, x + 4, y + h - 4, w - 8, 5, 2);
  ctx.fill();
  surface(ctx, x, y, w, h, '#5d4a3a', 6);
  ctx.fillStyle = 'rgba(180,205,225,0.22)';
  roundRect(ctx, x + 6, y + 5, w - 12, h - 10, 3);
  ctx.fill();
  // magazines
  ctx.fillStyle = '#c9c2b4';
  ctx.save();
  ctx.translate(x + w * 0.3, y + h * 0.45);
  ctx.rotate(-0.18);
  ctx.fillRect(-11, -7, 22, 14);
  ctx.fillStyle = '#8c5a4a';
  ctx.fillRect(-11, -7, 22, 4);
  ctx.restore();
}

function meetingTable(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 12, 0.32);
  // pedestal legs
  ctx.fillStyle = '#2a231d';
  ctx.fillRect(x + w * 0.2, y + h - 6, 12, 8);
  ctx.fillRect(x + w * 0.8 - 12, y + h - 6, 12, 8);
  // walnut top with inset glass
  ctx.fillStyle = PALETTE.walnut;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, shade(PALETTE.walnutLight, 0.18));
  g.addColorStop(0.5, PALETTE.walnutLight);
  g.addColorStop(1, PALETTE.walnut);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2 - 1.5, w / 2 - 1.5, h / 2 - 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,160,185,0.18)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2 - 1.5, w / 2 - 20, h / 2 - 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,215,0.16)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2 - 1.5, w / 2 - 20, h / 2 - 12, 0, 0, Math.PI * 2);
  ctx.stroke();
  // notepads and water glasses
  for (let i = 0; i < 4; i++) {
    const px = x + w * (0.25 + (i % 2) * 0.5);
    const py = y + h * (0.3 + Math.floor(i / 2) * 0.4);
    ctx.fillStyle = '#ded8c8';
    roundRect(ctx, px - 8, py - 5, 16, 10, 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(120,140,160,0.8)';
    roundRect(ctx, px + 12, py - 4, 6, 8, 1.5);
    ctx.fill();
  }
}

function receptionDesk(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 10, 0.32);
  // counter body
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#2b323c');
  g.addColorStop(1, '#1d232b');
  ctx.fillStyle = g;
  roundRect(ctx, x, y + h * 0.28, w, h * 0.72, 8);
  ctx.fill();
  // stone top
  ctx.fillStyle = '#c8cdd3';
  roundRect(ctx, x - 4, y, w + 8, h * 0.42, 8);
  ctx.fill();
  const top = ctx.createLinearGradient(x, y, x, y + h * 0.42);
  top.addColorStop(0, '#e6e9ec');
  top.addColorStop(1, '#b7bec6');
  ctx.fillStyle = top;
  roundRect(ctx, x - 4, y, w + 8, h * 0.34, 8);
  ctx.fill();
  // backlit logo panel
  const lw = Math.min(120, w * 0.42);
  ctx.fillStyle = 'rgba(10,16,24,0.85)';
  roundRect(ctx, x + w / 2 - lw / 2, y + h * 0.46, lw, h * 0.36, 4);
  ctx.fill();
  ctx.fillStyle = PALETTE.glow;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x + w / 2 - lw / 2 + 8, y + h * 0.62, lw - 16, 2);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(200,235,250,0.55)';
  ctx.fillRect(x + w / 2 - lw / 2 + 8, y + h * 0.53, lw * 0.45, 3);
  // monitor on top
  monitor(ctx, x + w * 0.16, y - 6, 34, 20, 'rgba(140,220,200,0.9)');
}

function whiteboard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 2, y + 3, w, h);
  ctx.fillStyle = '#eef2f5';
  roundRect(ctx, x, y, w, h + 4, 2);
  ctx.fill();
  ctx.strokeStyle = '#9aa6b2';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x + 0.7, y + 0.7, w - 1.4, h + 2.6);
  // scribbles
  ctx.strokeStyle = 'rgba(70,110,160,0.55)';
  ctx.lineWidth = 1;
  const bw = w / 4;
  for (let i = 0; i < 3; i++) {
    ctx.strokeRect(x + 10 + i * bw, y + 3, bw - 12, h - 2);
  }
  ctx.strokeStyle = 'rgba(180,90,80,0.45)';
  ctx.beginPath();
  ctx.moveTo(x + 12, y + h - 2);
  ctx.lineTo(x + w * 0.5, y + 1);
  ctx.stroke();
}

function wallScreen(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.fillStyle = '#0e141b';
  roundRect(ctx, x, y, w, h + 6, 3);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#0d2733');
  g.addColorStop(1, '#071620');
  ctx.fillStyle = g;
  roundRect(ctx, x + 2, y + 2, w - 4, h + 2, 2);
  ctx.fill();
  // data bars
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 3 === 0 ? 'rgba(95,208,232,0.75)' : 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + 8 + i * (w - 16) / 6, y + h - 6 - (6 + hash(i, x) * (h - 14)), (w - 20) / 8, 6 + hash(i, x) * (h - 14));
  }
  ctx.fillStyle = 'rgba(95,208,232,0.55)';
  ctx.fillRect(x + 8, y + 5, w * 0.3, 2);
}

function serverRack(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 8, 0.36);
  ctx.fillStyle = '#151a21';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x + w, y);
  g.addColorStop(0, '#2c333d');
  g.addColorStop(0.5, '#232a33');
  g.addColorStop(1, '#171c23');
  ctx.fillStyle = g;
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 2);
  ctx.fill();
  const units = Math.floor(h / 12);
  for (let i = 0; i < units; i++) {
    const uy = y + 5 + i * 11;
    ctx.fillStyle = '#0e1319';
    ctx.fillRect(x + 4, uy, w - 8, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x + 5, uy + 0.8, w - 10, 0.8);
    // vents
    ctx.fillStyle = 'rgba(160,178,196,0.18)';
    for (let v = 0; v < 4; v++) ctx.fillRect(x + 6 + v * 4, uy + 3, 2, 3);
    // status LEDs
    const on = hash(x + i, y) > 0.35;
    ctx.fillStyle = on ? '#57d68a' : '#2c4a3a';
    ctx.fillRect(x + w - 9, uy + 3, 2, 2);
    ctx.fillStyle = hash(y, x + i) > 0.6 ? '#5fd0e8' : '#22414c';
    ctx.fillRect(x + w - 6, uy + 3, 2, 2);
  }
}

function printer(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 6, 0.28);
  ctx.fillStyle = '#d3d7dc';
  roundRect(ctx, x, y + h * 0.2, w, h * 0.8, 4);
  ctx.fill();
  ctx.fillStyle = '#b9bfc6';
  roundRect(ctx, x, y + h * 0.2, w, h * 0.28, 4);
  ctx.fill();
  ctx.fillStyle = '#2c323a';
  roundRect(ctx, x + w * 0.22, y + h * 0.26, w * 0.56, h * 0.18, 2);
  ctx.fill();
  ctx.fillStyle = '#eef1f4';
  roundRect(ctx, x + w * 0.3, y + h * 0.52, w * 0.4, h * 0.3, 1.5);
  ctx.fill();
  ctx.fillStyle = '#57d68a';
  ctx.fillRect(x + w - 8, y + h * 0.3, 2.4, 2.4);
}

function coffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 5, 0.28);
  ctx.fillStyle = '#22282f';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  ctx.fillStyle = '#333b44';
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h * 0.5, 2);
  ctx.fill();
  ctx.fillStyle = '#8a5a3a';
  ctx.fillRect(x + 4, y + 4, w - 8, 3);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(x + w * 0.25, y + h * 0.55, w * 0.5, h * 0.28);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  roundRect(ctx, x + w * 0.34, y + h * 0.72, w * 0.32, h * 0.2, 1);
  ctx.fill();
  ctx.fillStyle = '#57d0e8';
  ctx.fillRect(x + 3, y + 3, 2.5, 2);
}

function waterCooler(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 5, 0.26);
  ctx.fillStyle = '#e3e8ec';
  roundRect(ctx, x + w * 0.12, y + h * 0.22, w * 0.76, h * 0.78, 3);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h * 0.4);
  g.addColorStop(0, 'rgba(150,210,240,0.85)');
  g.addColorStop(1, 'rgba(90,160,200,0.75)');
  ctx.fillStyle = g;
  roundRect(ctx, x + w * 0.2, y, w * 0.6, h * 0.4, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  roundRect(ctx, x + w * 0.28, y + 2, w * 0.14, h * 0.3, 2);
  ctx.fill();
  ctx.fillStyle = '#8b98a6';
  ctx.fillRect(x + w * 0.36, y + h * 0.52, w * 0.28, 3);
  ctx.fillStyle = '#4a5663';
  ctx.fillRect(x + w * 0.42, y + h * 0.62, 3, 3);
  ctx.fillStyle = '#c0503f';
  ctx.fillRect(x + w * 0.56, y + h * 0.62, 3, 3);
}

function vendingMachine(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  shadowUnder(ctx, x, y, w, h, 7, 0.3);
  ctx.fillStyle = '#1b2027';
  roundRect(ctx, x, y, w, h, 3);
  ctx.fill();
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#2a3038');
  g.addColorStop(1, '#171b21');
  ctx.fillStyle = g;
  roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,200,230,0.22)';
  roundRect(ctx, x + 4, y + 4, w * 0.58, h - 8, 2);
  ctx.fill();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      ctx.fillStyle = ['#c46a5a', '#5a9ec4', '#c4b25a', '#8ac47a'][Math.floor(hash(r, c, x) * 4)];
      ctx.fillRect(x + 7 + c * 6, y + 7 + r * 8, 4, 5);
    }
  }
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(x + w - 12, y + 6, 8, h - 16);
  ctx.fillStyle = '#57d68a';
  ctx.fillRect(x + w - 10, y + 9, 4, 2);
  ctx.fillStyle = '#0b0f14';
  roundRect(ctx, x + 4, y + h - 10, w - 16, 6, 2);
  ctx.fill();
}

export function drawFurniture(ctx: CanvasRenderingContext2D, item: FurnitureItem) {
  const { w, h } = furnitureSize(item);
  const { x, y } = item;
  switch (item.type) {
    case 'rug': {
      const r = Math.min(14, h / 3);
      ctx.save();
      ctx.globalAlpha = 0.85;
      const g = ctx.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, item.color || 'rgba(72,82,100,0.5)');
      g.addColorStop(1, 'rgba(18,24,32,0.55)');
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, r);
      ctx.fill();
      ctx.strokeStyle = 'rgba(228,214,186,0.18)';
      ctx.lineWidth = 2;
      roundRect(ctx, x + 5, y + 5, w - 10, h - 10, r - 4);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(228,214,186,0.09)';
      ctx.lineWidth = 1;
      roundRect(ctx, x + 10, y + 10, w - 20, h - 20, r - 6);
      ctx.stroke();
      ctx.restore();
      return;
    }
    case 'execDesk': {
      shadowUnder(ctx, x, y, w, h, 12, 0.34);
      surface(ctx, x, y, w, h, PALETTE.walnut, 5);
      // brass inlay
      ctx.strokeStyle = 'rgba(194,160,90,0.55)';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x + 8, y + 8, w - 16, h - 16);
      monitor(ctx, x + w * 0.24, y + 6, 46, 27, 'rgba(95,208,232,0.95)');
      monitor(ctx, x + w * 0.52, y + 6, 46, 27, 'rgba(150,220,190,0.9)');
      keyboard(ctx, x + w * 0.34, y + h * 0.62, 40);
      paperStack(ctx, x + w * 0.76, y + h * 0.6);
      mug(ctx, x + w * 0.12, y + h * 0.62, '#b9793f');
      // desk lamp
      ctx.fillStyle = PALETTE.brass;
      ctx.fillRect(x + w - 20, y + 8, 3, 12);
      ctx.beginPath();
      ctx.moveTo(x + w - 26, y + 8);
      ctx.lineTo(x + w - 12, y + 8);
      ctx.lineTo(x + w - 16, y + 1);
      ctx.lineTo(x + w - 22, y + 1);
      ctx.closePath();
      ctx.fill();
      return;
    }
    case 'receptionDesk':
      receptionDesk(ctx, x, y, w, h);
      return;
    case 'meetingTable':
      meetingTable(ctx, x, y, w, h);
      return;
    case 'coffeeTable':
      coffeeTable(ctx, x, y, w, h);
      return;
    case 'sofa':
      sofa(ctx, x, y, w, h);
      return;
    case 'plant':
      plant(ctx, x, y, w, h);
      return;
    case 'bookshelf':
      bookshelf(ctx, x, y, w, h);
      return;
    case 'cabinet':
      cabinet(ctx, x, y, w, h);
      return;
    case 'whiteboard':
      whiteboard(ctx, x, y, w, h);
      return;
    case 'screen':
      wallScreen(ctx, x, y, w, h);
      return;
    case 'monitorWall': {
      // video wall in the CEO suite
      ctx.fillStyle = '#0d1218';
      roundRect(ctx, x - 4, y - 4, w + 8, h + 8, 5);
      ctx.fill();
      const cols = 3;
      const rows = 2;
      const gx = 3;
      const cw = (w - gx * (cols - 1)) / cols;
      const ch = (h - gx * (rows - 1)) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const mx = x + c * (cw + gx);
          const my = y + r * (ch + gx);
          const g = ctx.createLinearGradient(mx, my, mx + cw, my + ch);
          g.addColorStop(0, '#0e2b38');
          g.addColorStop(1, '#071620');
          ctx.fillStyle = g;
          roundRect(ctx, mx, my, cw, ch, 2);
          ctx.fill();
          ctx.fillStyle = c === 1 && r === 0 ? 'rgba(194,160,90,0.8)' : 'rgba(95,208,232,0.62)';
          const bw = cw * (0.25 + hash(c, r) * 0.5);
          ctx.fillRect(mx + 6, my + ch - 8, bw, 3);
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fillRect(mx + 6, my + 6, cw * 0.4, 2);
        }
      }
      return;
    }
    case 'serverRack':
      serverRack(ctx, x, y, w, h);
      return;
    case 'printer':
      printer(ctx, x, y, w, h);
      return;
    case 'coffeeMachine':
      coffeeMachine(ctx, x, y, w, h);
      return;
    case 'waterCooler':
      waterCooler(ctx, x, y, w, h);
      return;
    case 'vendingMachine':
      vendingMachine(ctx, x, y, w, h);
      return;
    default: {
      shadowUnder(ctx, x, y, w, h, 5, 0.24);
      surface(ctx, x, y, w, h, item.color || '#54606e', 4);
    }
  }
}

/* ------------------------------- desk + chair ---------------------------- */

export function drawChair(ctx: CanvasRenderingContext2D, cx: number, cy: number, style: 'std' | 'exec' = 'std', facing: DirKey = 'down') {
  const exec = style === 'exec';
  const shell = exec ? '#332a1d' : '#39465a';
  const shellLight = exec ? '#55452e' : '#52637c';
  const side = facing === 'left' || facing === 'right';

  ctx.save();
  ctx.translate(cx, cy);
  // casters
  ctx.fillStyle = 'rgba(8,11,15,0.85)';
  const base = exec ? 15 : 12;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.ellipse(i * base * 0.7, 6, 2.4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // star base
  ctx.strokeStyle = '#3c4550';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-base * 0.8, 4);
  ctx.lineTo(base * 0.8, 4);
  ctx.moveTo(0, 4);
  ctx.lineTo(0, -1);
  ctx.stroke();
  // gas lift
  ctx.fillStyle = '#4a5460';
  ctx.fillRect(-1.6, -6, 3.2, 10);
  // seat
  const sw = exec ? 32 : 28;
  const sh = exec ? 12 : 11;
  const g = ctx.createLinearGradient(-sw / 2, -8, sw / 2, -8 + sh);
  g.addColorStop(0, shellLight);
  g.addColorStop(1, shell);
  ctx.fillStyle = g;
  roundRect(ctx, -sw / 2, -8, sw, sh, 4);
  ctx.fill();
  // backrest
  const bh = exec ? 24 : 21;
  const bg = ctx.createLinearGradient(0, -8 - bh, 0, -6);
  bg.addColorStop(0, shellLight);
  bg.addColorStop(1, shell);
  ctx.fillStyle = bg;
  if (side) roundRect(ctx, -sw / 2 + 1, -8 - bh + 4, 7, bh, 3);
  else roundRect(ctx, -sw / 2 + 1, -8 - bh + 2, sw - 2, bh - 2, 4);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  if (side) {
    roundRect(ctx, -sw / 2 + 1, -8 - bh + 4, 7, bh, 3);
  } else {
    roundRect(ctx, -sw / 2 + 1, -8 - bh + 2, sw - 2, bh - 2, 4);
  }
  ctx.stroke();
  if (exec) {
    // stitched panel
    ctx.strokeStyle = 'rgba(194,160,90,0.35)';
    ctx.beginPath();
    ctx.moveTo(-sw / 2 + 6, -8 - bh + 7);
    ctx.lineTo(sw / 2 - 6, -8 - bh + 7);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawStationDesk(ctx: CanvasRenderingContext2D, st: { x: number; y: number; desk: { w: number; h: number }; style?: string }) {
  const { x, y } = st;
  const w = st.desk.w;
  const h = st.desk.h;
  const exec = st.style === 'exec';
  const variant = Math.floor(hash(x, y, 7) * 3);
  const accent = ['rgba(95,208,232,0.95)', 'rgba(150,220,190,0.92)', 'rgba(200,170,235,0.92)'][variant];

  // contact shadow + legs first (behind the top)
  shadowUnder(ctx, x, y, w, h, 10, 0.30);
  ctx.fillStyle = '#2a2018';
  ctx.fillRect(x + 8, y + h - 2, 4, 9);
  ctx.fillRect(x + w - 12, y + h - 2, 4, 9);

  surface(ctx, x, y, w, h, exec ? PALETTE.walnut : PALETTE.deskTop, 4);

  // monitor(s)
  if (variant === 1 && w >= 110) {
    monitor(ctx, x + w * 0.16, y + 7, 40, 24, accent);
    monitor(ctx, x + w * 0.56, y + 7, 40, 24, accent);
  } else {
    monitor(ctx, x + w * 0.34, y + 6, 44, 26, accent);
  }
  // keyboard + mouse
  keyboard(ctx, x + w * 0.30, y + h * 0.68, Math.min(46, w * 0.42));
  // personal items
  if (variant === 0) paperStack(ctx, x + 8, y + h - 17);
  if (variant === 2) mug(ctx, x + 9, y + h - 20, '#b9793f');
  if (variant === 1) mug(ctx, x + w - 20, y + h - 19, '#5c7fa8');
  if (variant === 0) {
    // small desk plant
    plant(ctx, x + w - 20, y + h - 22, 16, 18);
  }
  if (exec) {
    ctx.strokeStyle = 'rgba(194,160,90,0.4)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 5.5, y + 5.5, w - 11, h - 11);
  }
}

export function drawMeetingChairs(ctx: CanvasRenderingContext2D, seats: { x: number; y: number; facing?: string }[]) {
  for (const seat of seats) {
    const facing = (seat.facing === 'north' ? 'up' : seat.facing === 'south' ? 'down' : seat.facing === 'east' ? 'right' : 'left') as DirKey;
    drawChair(ctx, seat.x, seat.y, 'std', facing);
  }
}

/* ============================== LIGHT + LABELS =========================== */

export function drawLightPools(ctx: CanvasRenderingContext2D, office: Office) {
  // daylight through the north windows
  for (const room of office.rooms.filter((r) => r.y <= 60)) {
    const g = ctx.createLinearGradient(0, room.y + 12, 0, room.y + 190);
    g.addColorStop(0, 'rgba(200,228,255,0.26)');
    g.addColorStop(0.55, 'rgba(200,228,255,0.07)');
    g.addColorStop(1, 'rgba(196,224,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(room.x + 12, room.y + 12, room.w - 24, 180);
    // slanted shafts
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#cfe6ff';
    for (let i = 0; i < 3; i++) {
      const sx = room.x + 40 + i * (room.w / 3);
      ctx.beginPath();
      ctx.moveTo(sx, room.y + 12);
      ctx.lineTo(sx + 26, room.y + 12);
      ctx.lineTo(sx + 92, room.y + 170);
      ctx.lineTo(sx + 40, room.y + 170);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  // ceiling pools per room
  for (const room of office.rooms) {
    const warm = room.kind === 'ceo' || room.kind === 'lounge';
    const count = Math.max(1, Math.round(room.w / 300));
    for (let i = 0; i < count; i++) {
      const cx = room.x + (room.w / count) * (i + 0.5);
      const cy = room.y + room.h * 0.45;
      const r = Math.max(room.w / count, room.h) * 0.62;
      const g = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
      g.addColorStop(0, warm ? 'rgba(255,214,158,0.16)' : 'rgba(214,232,255,0.13)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(room.x, room.y, room.w, room.h);
    }
  }

  // corridor lighting
  for (const cor of office.corridors) {
    const count = Math.max(1, Math.round(cor.w / 260));
    for (let i = 0; i < count; i++) {
      const cx = cor.x + (cor.w / count) * (i + 0.5);
      const g = ctx.createRadialGradient(cx, cor.y + cor.h / 2, 8, cx, cor.y + cor.h / 2, cor.h * 0.95);
      g.addColorStop(0, 'rgba(226,238,255,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(cor.x, cor.y, cor.w, cor.h);
    }
  }
}

export function drawRoomLabels(ctx: CanvasRenderingContext2D, office: Office, departments: { id: string; name: string; color: string }[]) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const room of office.rooms) {
    const dept = departments.find((d) => d.id === room.deptId);
    const text = room.name.toUpperCase();
    ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    const w = tw + 30;
    const h = 20;
    const above = room.y > 200;
    const x = room.x + (office.wall || 12) + 8;
    const y = above ? room.y - h - 12 : room.y + room.h + 12;
    // plate
    ctx.fillStyle = 'rgba(12,16,22,0.86)';
    roundRect(ctx, x, y, w, h, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(170,190,215,0.22)';
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 3);
    ctx.stroke();
    ctx.fillStyle = dept ? dept.color : '#8fa0b5';
    roundRect(ctx, x + 5, y + 5, 3, h - 10, 1.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(232,241,252,0.92)';
    ctx.fillText(text, x + 14, y + h / 2 + 0.5);
    // small floor line in the department colour, pointing at the room
    ctx.fillStyle = dept ? `${dept.color}55` : 'rgba(160,180,210,0.3)';
    ctx.fillRect(x, above ? y + h + 2 : y - 4, w, 2);
  }
  ctx.restore();
}


/** A thin department-coloured inlay line, inset from the walls. */
export function drawFloorInlays(ctx: CanvasRenderingContext2D, office: Office, departments: { id: string; name: string; color: string }[]) {
  const t = office.wall || 12;
  for (const room of office.rooms) {
    const dept = departments.find((d) => d.id === room.deptId);
    if (!dept) continue;
    const inset = t + 16;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = `${dept.color}44`;
    ctx.lineWidth = 1.6;
    roundRect(ctx, room.x + inset, room.y + inset, room.w - inset * 2, room.h - inset * 2, 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // corner ticks
    ctx.strokeStyle = `${dept.color}88`;
    ctx.lineWidth = 1.2;
    const c = 18;
    const bx = room.x + inset;
    const by = room.y + inset;
    const ex = room.x + room.w - inset;
    const ey = room.y + room.h - inset;
    ctx.beginPath();
    ctx.moveTo(bx, by + c); ctx.lineTo(bx, by); ctx.lineTo(bx + c, by);
    ctx.moveTo(ex - c, by); ctx.lineTo(ex, by); ctx.lineTo(ex, by + c);
    ctx.moveTo(bx, ey - c); ctx.lineTo(bx, ey); ctx.lineTo(bx + c, ey);
    ctx.moveTo(ex - c, ey); ctx.lineTo(ex, ey); ctx.lineTo(ex, ey - c);
    ctx.stroke();
    ctx.restore();
  }
}

/* ========================== ENVIRONMENTAL DETAIL ========================= */

/** Wall-mounted art, clocks and boards. Drawn on the wall band, like real signage. */
export function drawWallDecor(ctx: CanvasRenderingContext2D, office: Office, departments: { id: string; name: string; color: string }[]) {
  const t = office.wall || 12;
  for (const room of office.rooms) {
    const dept = departments.find((d) => d.id === room.deptId);
    const accent = dept?.color || '#8fa0b5';
    const kind = room.kind || 'room';

    // framed pieces on the west wall
    const pieces = kind === 'ceo' ? 2 : 1;
    for (let i = 0; i < pieces; i++) {
      const py = room.y + room.h * (0.30 + i * 0.26);
      const ph = 22;
      ctx.fillStyle = 'rgba(12,16,22,0.75)';
      ctx.fillRect(room.x + t * 0.18, py - ph / 2, t * 0.64, ph);
      ctx.fillStyle = i === 0 ? `${accent}66` : 'rgba(206,222,238,0.30)';
      ctx.fillRect(room.x + t * 0.26, py - ph / 2 + 2, t * 0.48, ph - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(room.x + t * 0.26, py - ph / 2 + 2, t * 0.48, 1);
    }

    // clock on the east wall
    if (kind !== 'reception') {
      const cx = room.x + room.w - t / 2;
      const cy = room.y + room.h * 0.22;
      ctx.fillStyle = '#e8eef4';
      ctx.beginPath();
      ctx.arc(cx, cy, 4.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,38,48,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.strokeStyle = '#2a3340';
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy - 2.6);
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 2, cy + 1.2);
      ctx.stroke();
    }

    // pin board above the desks in department rooms
    if (room.floor === 'carpet' && kind !== 'ceo') {
      const bw = 46;
      const bx = room.x + room.w - t - bw - 26;
      const by = room.y + t * 0.15;
      ctx.fillStyle = 'rgba(150,120,84,0.55)';
      roundRect(ctx, bx, by, bw, t * 0.7, 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = ['#e8e2d2', '#c8d8e8', '#e8d8c8', '#d8e8d8'][i];
        ctx.fillRect(bx + 4 + (i % 2) * 20, by + 2 + Math.floor(i / 2) * 4, 14, 3);
      }
    }
  }
}

/** Corridor dressing: floor runners, benches, plants and directional plates. */
export function drawCorridorDetails(ctx: CanvasRenderingContext2D, office: Office) {
  for (const cor of office.corridors) {
    const horizontal = cor.w > cor.h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cor.x, cor.y, cor.w, cor.h);
    ctx.clip();

    // subtle material contrast: a lighter runner down the middle
    const g = horizontal
      ? ctx.createLinearGradient(0, cor.y, 0, cor.y + cor.h)
      : ctx.createLinearGradient(cor.x, 0, cor.x + cor.w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(0.5, 'rgba(226,238,250,0.07)');
    g.addColorStop(1, 'rgba(0,0,0,0.05)');
    ctx.fillStyle = g;
    ctx.fillRect(cor.x, cor.y, cor.w, cor.h);

    // inlay strips
    ctx.fillStyle = 'rgba(210,226,242,0.12)';
    if (horizontal) {
      ctx.fillRect(cor.x, cor.y + cor.h * 0.5 - 12, cor.w, 1.4);
      ctx.fillRect(cor.x, cor.y + cor.h * 0.5 + 12, cor.w, 1.4);
    } else {
      ctx.fillRect(cor.x + cor.w * 0.5 - 12, cor.y, 1.4, cor.h);
      ctx.fillRect(cor.x + cor.w * 0.5 + 12, cor.y, 1.4, cor.h);
    }
    ctx.restore();
  }

  // potted plants tucked into corridor corners
  const corners = [
    { x: 46, y: 366 }, { x: 96, y: 366 },
    { x: 46, y: 862 }, { x: 96, y: 862 },
  ];
  for (const c of corners) plant(ctx, c.x, c.y, 30, 32);
}

/* =============================== CHARACTERS ============================== */

export const CHAR_W = 60;
export const CHAR_H = 96;
const SPRITE_SCALE = 2;
const BODY_SCALE = 1.6;
const BODY_H = CHAR_H / BODY_SCALE; // body units available above the feet

function drawCharacterBody(ctx: CanvasRenderingContext2D, a: Appearance, pose: Pose, dir: DirKey, frame: number) {
  const sitting = pose === 'sit' || pose === 'type' || pose === 'meet';
  const walk = pose === 'walk';
  const side = dir === 'left' || dir === 'right';
  const back = dir === 'up';
  const swing = walk ? (frame % 2 === 0 ? 2.6 : -2.6) : 0;
  const typing = pose === 'type';
  const shirt = a.shirt;
  const pants = a.pants || '#2f3846';
  const skin = a.skin;
  const shoes = '#20252c';

  const hip = sitting ? -13 : -26;
  const shoulder = sitting ? -32 : -48;
  const headY = sitting ? -40 : -57;

  // legs
  if (!sitting) {
    ctx.fillStyle = pants;
    roundRect(ctx, -7 + swing * 0.3, hip - 2, 6.4, -hip - 2, 2.5); // left
    ctx.fill();
    roundRect(ctx, 0.6 - swing * 0.3, hip - 2, 6.4, -hip - 2, 2.5);
    ctx.fill();
    ctx.fillStyle = shade(pants, 0.12);
    ctx.fillRect(-7 + swing * 0.3, hip + 6, 6.4, 2);
    ctx.fillRect(0.6 - swing * 0.3, hip + 6, 6.4, 2);
    ctx.fillStyle = shoes;
    roundRect(ctx, -7.6 + swing * 0.5, -3.4, 7.4, 3.6, 1.6);
    ctx.fill();
    roundRect(ctx, 0.4 - swing * 0.5, -3.4, 7.4, 3.6, 1.6);
    ctx.fill();
  } else {
    // seated: lap + knees toward the desk
    ctx.fillStyle = pants;
    roundRect(ctx, -8.5, hip - 6, 17, 7, 3);
    ctx.fill();
    ctx.fillStyle = shade(pants, -0.12);
    roundRect(ctx, -8.5, hip - 6, 17, 2.2, 1);
    ctx.fill();
  }

  // torso
  const bw = 17;
  const torsoH = hip - shoulder;
  const bodyGrad = ctx.createLinearGradient(-bw / 2, shoulder, bw / 2, hip);
  bodyGrad.addColorStop(0, shade(shirt, 0.14));
  bodyGrad.addColorStop(0.6, shirt);
  bodyGrad.addColorStop(1, shade(shirt, -0.16));
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, -bw / 2, shoulder, bw, torsoH + 2, 4.5);
  ctx.fill();
  // collar
  ctx.fillStyle = shade(shirt, -0.28);
  if (!back) {
    ctx.beginPath();
    ctx.moveTo(-4.4, shoulder + 0.4);
    ctx.lineTo(0, shoulder + 4.2);
    ctx.lineTo(4.4, shoulder + 0.4);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(-4.4, shoulder + 0.2, 8.8, 1.6);
  }
  // arms
  const armX = bw / 2 - 1.4;
  ctx.fillStyle = shade(shirt, -0.08);
  if (side) {
    roundRect(ctx, -2.8, shoulder + 2, 5.6, torsoH - 4, 2.6);
    ctx.fill();
    ctx.fillStyle = skin;
    roundRect(ctx, -2.6, shoulder + torsoH - 3.4, 5.2, 4, 2);
    ctx.fill();
  } else {
    const armSwing = typing ? 3.2 : swing * 0.7;
    roundRect(ctx, -armX - 2.8, shoulder + 2, 5.4, torsoH - 6 + armSwing, 2.6);
    ctx.fill();
    roundRect(ctx, armX - 2.6, shoulder + 2, 5.4, torsoH - 6 - armSwing, 2.6);
    ctx.fill();
    ctx.fillStyle = skin;
    roundRect(ctx, -armX - 2.6, shoulder + torsoH - 5 + armSwing, 5, 4.2, 2);
    ctx.fill();
    roundRect(ctx, armX - 2.4, shoulder + torsoH - 5 - armSwing, 5, 4.2, 2);
    ctx.fill();
  }

  // neck
  ctx.fillStyle = shade(skin, -0.14);
  ctx.fillRect(-2.4, headY + 8, 4.8, 4);

  // head
  const headR = 8.4;
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, headY, headR * 0.94, headR, 0, 0, Math.PI * 2);
  ctx.fill();
  // ear
  if (!back) {
    ctx.fillStyle = shade(skin, -0.10);
    ctx.beginPath();
    ctx.ellipse(dir === 'left' ? -headR * 0.85 : headR * 0.85, headY + 1, 1.8, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // face
  if (!back) {
    const eyeY = headY - 0.4;
    ctx.fillStyle = '#1a1d22';
    if (side) {
      const ex = dir === 'left' ? -4.6 : 4.6;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 1.15, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // brow
      ctx.strokeStyle = shade(a.hair, -0.15);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex - 2.2, eyeY - 2.6);
      ctx.lineTo(ex + 2, eyeY - 2.4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(-3, eyeY, 1.25, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(3, eyeY, 1.25, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = shade(a.hair, -0.2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-4.6, eyeY - 2.8);
      ctx.lineTo(-1.6, eyeY - 2.9);
      ctx.moveTo(1.6, eyeY - 2.9);
      ctx.lineTo(4.6, eyeY - 2.8);
      ctx.stroke();
      // mouth
      ctx.strokeStyle = 'rgba(120,70,62,0.65)';
      ctx.beginPath();
      ctx.moveTo(-1.8, headY + 4.4);
      ctx.lineTo(1.8, headY + 4.4);
      ctx.stroke();
    }
  }

  // hair
  const hair = a.hair;
  const style = a.hairStyle || 'short';
  ctx.fillStyle = hair;
  if (style === 'bun') {
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.45, headR * 1.02, headR * 0.82, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 1.05, 3.4, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'long') {
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.35, headR * 1.08, headR * 0.95, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-headR * 0.92, headY + 3, 2.6, headR * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR * 0.92, headY + 3, 2.6, headR * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (style === 'curly') {
    for (let i = 0; i < 7; i++) {
      const ang = Math.PI + (i / 6) * Math.PI;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * headR * 0.82, headY + Math.sin(ang) * headR * 0.86, 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (style === 'buzz') {
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.3, headR * 0.98, headR * 0.72, 0, Math.PI, Math.PI * 2);
    ctx.fill();
  } else if (style === 'side') {
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.4, headR * 1.02, headR * 0.86, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(headR * 0.5, headY - headR * 0.5, headR * 0.62, headR * 0.5, 0.4, Math.PI, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.32, headR * 1.0, headR * 0.8, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, headY - headR * 0.62, headR * 0.55, headR * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.ellipse(-headR * 0.35, headY - headR * 0.72, headR * 0.34, headR * 0.2, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // accessories
  if (a.accessory === 'glasses') {
    ctx.strokeStyle = 'rgba(30,38,48,0.9)';
    ctx.lineWidth = 0.9;
    if (side) {
      ctx.strokeRect(dir === 'left' ? -7 : 2.2, headY - 2.2, 4.8, 4);
    } else {
      ctx.strokeRect(-6.2, headY - 2.2, 4.8, 4);
      ctx.strokeRect(1.4, headY - 2.2, 4.8, 4);
      ctx.beginPath();
      ctx.moveTo(-1.4, headY - 0.4);
      ctx.lineTo(1.4, headY - 0.4);
      ctx.stroke();
    }
  } else if (a.accessory === 'headset') {
    ctx.strokeStyle = '#2a3138';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, headY - 0.6, headR + 1.6, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = '#2a3138';
    ctx.beginPath();
    ctx.ellipse(dir === 'left' ? -headR - 1 : headR + 1, headY + 1.4, 2.4, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

const charCache = new Map<string, HTMLCanvasElement>();

export function characterSprite(a: Appearance, pose: Pose, dir: DirKey, frame: number) {
  const key = [a.skin, a.hair, a.hairStyle, a.shirt, a.pants, a.accessory, pose, dir, frame % 2].join('|');
  const hit = charCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = CHAR_W * SPRITE_SCALE;
  c.height = CHAR_H * SPRITE_SCALE;
  const ctx = c.getContext('2d')!;
  ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
  ctx.translate(CHAR_W / 2, CHAR_H);
  ctx.scale(BODY_SCALE, BODY_SCALE);
  drawCharacterBody(ctx, a, pose, dir, frame);
  charCache.set(key, c);
  return c;
}

export function blitCharacter(
  ctx: CanvasRenderingContext2D,
  a: Appearance,
  pose: Pose,
  dir: DirKey,
  frame: number,
  x: number,
  y: number,
  alpha = 1,
) {
  const sprite = characterSprite(a, pose, dir, frame);
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - CHAR_W / 2, y - CHAR_H, CHAR_W, CHAR_H);
  ctx.restore();
}

export function drawCharacterShadow(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  const g = ctx.createRadialGradient(x, y, 1, x, y, 16 * scale);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.20)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 16 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* =============================== OVERLAYS ================================ */

export function drawMonitorGlow(ctx: CanvasRenderingContext2D, st: { x: number; y: number; desk: { w: number; h: number } }, color: string, strength: number) {
  const mx = st.x + st.desk.w / 2;
  const my = st.y + 18;
  const g = ctx.createRadialGradient(mx, my, 2, mx, my, 58);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, strength)) * 0.5;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(mx, my + 6, 62, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawProgressRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, t: number) {
  ctx.save();
  ctx.strokeStyle = 'rgba(10,14,20,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  const start = t * 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, start, start + Math.PI * 1.2);
  ctx.stroke();
  ctx.restore();
}

export function drawStatusBadge(ctx: CanvasRenderingContext2D, x: number, y: number, status: string, color: string, t: number) {
  ctx.save();
  const bob = Math.sin(t * 2.2 + x * 0.05) * 1.2;
  const cy = y + bob;
  ctx.fillStyle = 'rgba(10,14,20,0.86)';
  roundRect(ctx, x - 8, cy - 8, 16, 16, 8);
  ctx.fill();
  ctx.strokeStyle = `${color}cc`;
  ctx.lineWidth = 1.4;
  roundRect(ctx, x - 8, cy - 8, 16, 16, 8);
  ctx.stroke();
  if (status === 'working') {
    // pulsing core
    const pulse = 0.5 + Math.sin(t * 5) * 0.35;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, cy, 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, cy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (status === 'offline' || status === 'disconnected') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - 3, cy - 3);
    ctx.lineTo(x + 3, cy + 3);
    ctx.moveTo(x + 3, cy - 3);
    ctx.lineTo(x - 3, cy + 3);
    ctx.stroke();
  } else if (status === 'meeting') {
    ctx.fillStyle = color;
    roundRect(ctx, x - 4, cy - 3, 8, 5, 2);
    ctx.fill();
    ctx.fillRect(x - 5, cy + 2, 10, 1.6);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, cy, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawNameTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.save();
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 16;
  const h = 16;
  ctx.fillStyle = 'rgba(9,13,19,0.86)';
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = `${color}77`;
  ctx.lineWidth = 1;
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 8);
  ctx.stroke();
  ctx.fillStyle = 'rgba(232,242,252,0.94)';
  ctx.fillText(text, x, y + 0.5);
  ctx.restore();
}

export function seatGeometry(office: Office) {
  return office.stations.map((st) => stationGeom(st));
}
