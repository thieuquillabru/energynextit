import type { Appearance, Door, FurnitureItem, Office, Room } from '../types';
import { furnitureSize, stationGeom } from './layout';

export type Pose = 'idle' | 'walk' | 'sit' | 'type' | 'think' | 'meet' | 'talk';
export type DirKey = 'up' | 'down' | 'left' | 'right';

export const PALETTE = {
  void: '#0d1017',
  wall: '#424c5e',
  wallTop: '#525e73',
  wallDark: '#333b4a',
  woodA: '#6d4f36',
  woodB: '#7a5a3d',
  woodLine: '#5b402b',
  carpetA: '#333d4c',
  carpetB: '#384353',
  tileA: '#b6c0ca',
  tileB: '#a7b2bd',
  glass: '#9fd8ef',
  metal: '#93a0b0',
  deskTop: '#8b6544',
  deskEdge: '#6b4a30',
  deskTrim: '#4e3624',
  execTop: '#3a4351',
  execEdge: '#2a313c',
  gold: '#c9a227',
  screen: '#0d1620',
  glow: '#57e0ff',
  leafA: '#3f8f5a',
  leafB: '#4fa86a',
  pot: '#a5543f',
  fabric: '#2b3a55',
  fabricDark: '#202b3f',
};

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

function fill(ctx: CanvasRenderingContext2D, color: string) {
  ctx.fillStyle = color;
  ctx.fill();
}

function shadowRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 4, alpha = 0.25) {
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  roundRect(ctx, x + 2, y + 3, w, h, r);
  ctx.fill();
  ctx.restore();
}

/* -------------------------------- floors -------------------------------- */

const patternCache = new Map<string, CanvasPattern>();

function floorPattern(ctx: CanvasRenderingContext2D, type: Room['floor']) {
  const cached = patternCache.get(type);
  if (cached) return cached;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const p = c.getContext('2d')!;

  if (type === 'wood') {
    p.fillStyle = PALETTE.woodA;
    p.fillRect(0, 0, size, size);
    for (let i = 0; i < 4; i++) {
      p.fillStyle = i % 2 ? PALETTE.woodB : PALETTE.woodA;
      p.fillRect(0, i * 16, size, 15);
      p.fillStyle = PALETTE.woodLine;
      p.globalAlpha = 0.5;
      p.fillRect(0, i * 16 + 15, size, 1);
      p.globalAlpha = 1;
      p.fillStyle = 'rgba(0,0,0,0.10)';
      p.fillRect(((i * 37) % size), i * 16, 1, 15);
    }
  } else if (type === 'concrete') {
    p.fillStyle = '#2b3240';
    p.fillRect(0, 0, size, size);
    p.fillStyle = '#2f3746';
    for (let i = 0; i < 90; i++) p.fillRect((i * 41) % size, (i * 67) % size, 1, 1);
    p.strokeStyle = 'rgba(0,0,0,0.28)';
    p.lineWidth = 1;
    p.beginPath(); p.moveTo(0, 32); p.lineTo(size, 32); p.stroke();
    p.strokeStyle = 'rgba(255,255,255,0.045)';
    p.beginPath(); p.moveTo(0, 33); p.lineTo(size, 33); p.stroke();
  } else if (type === 'tile') {
    p.fillStyle = PALETTE.tileA;
    p.fillRect(0, 0, size, size);
    p.fillStyle = PALETTE.tileB;
    const t = 32;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        if ((x + y) % 2 === 0) p.fillRect(x * t, y * t, t, t);
      }
    }
    p.strokeStyle = 'rgba(255,255,255,0.2)';
    p.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      p.beginPath(); p.moveTo(i * t, 0); p.lineTo(i * t, size); p.stroke();
      p.beginPath(); p.moveTo(0, i * t); p.lineTo(size, i * t); p.stroke();
    }
  } else {
    p.fillStyle = PALETTE.carpetA;
    p.fillRect(0, 0, size, size);
    p.fillStyle = PALETTE.carpetB;
    for (let i = 0; i < 120; i++) {
      const x = (i * 37) % size;
      const y = (i * 53) % size;
      p.fillRect(x, y, 1, 1);
    }
    p.fillStyle = 'rgba(0,0,0,0.10)';
    for (let i = 0; i < size; i += 16) {
      p.fillRect(i, 0, 1, size);
      p.fillRect(0, i, size, 1);
    }
  }
  const pat = ctx.createPattern(c, 'repeat')!;
  patternCache.set(type, pat);
  return pat;
}

export function paintFloor(ctx: CanvasRenderingContext2D, room: Room) {
  ctx.save();
  ctx.fillStyle = floorPattern(ctx, room.floor);
  ctx.fillRect(room.x, room.y, room.w, room.h);
  // soft ambient light from the windows
  const g = ctx.createLinearGradient(room.x, room.y, room.x, room.y + room.h);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.02)');
  g.addColorStop(1, 'rgba(0,0,0,0.10)');
  ctx.fillStyle = g;
  ctx.fillRect(room.x, room.y, room.w, room.h);
  ctx.restore();
}

/* --------------------------------- walls -------------------------------- */

function wallSegments(room: Room, doors: Door[], t: number) {
  const sides = {
    n: { x: room.x, y: room.y, w: room.w, h: t, horizontal: true },
    s: { x: room.x, y: room.y + room.h - t, w: room.w, h: t, horizontal: true },
    w: { x: room.x, y: room.y, w: t, h: room.h, horizontal: false },
    e: { x: room.x + room.w - t, y: room.y, w: t, h: room.h, horizontal: false },
  };
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (const side of Object.values(sides)) {
    const holes = doors
      .filter((d) => d.roomId === room.id || true)
      .filter((d) => d.orientation === 'h'
        ? side.horizontal &&
          d.y + d.h > side.y - 4 && d.y < side.y + side.h + 4 &&
          d.x < side.x + side.w && d.x + d.w > side.x
        : !side.horizontal &&
          d.x + d.w > side.x - 4 && d.x < side.x + side.w + 4 &&
          d.y < side.y + side.h && d.y + d.h > side.y)
      .map((d) => (side.horizontal
        ? { a: Math.max(d.x, side.x), b: Math.min(d.x + d.w, side.x + side.w) }
        : { a: Math.max(d.y, side.y), b: Math.min(d.y + d.h, side.y + side.h) }))
      .sort((a, b) => a.a - b.a);

    if (!holes.length) {
      out.push(side);
      continue;
    }
    let cursor = side.horizontal ? side.x : side.y;
    const end = side.horizontal ? side.x + side.w : side.y + side.h;
    for (const hole of holes) {
      if (hole.a > cursor) {
        out.push(side.horizontal
          ? { x: cursor, y: side.y, w: hole.a - cursor, h: side.h }
          : { x: side.x, y: cursor, w: side.w, h: hole.a - cursor });
      }
      cursor = Math.max(cursor, hole.b);
    }
    if (cursor < end) {
      out.push(side.horizontal
        ? { x: cursor, y: side.y, w: end - cursor, h: side.h }
        : { x: side.x, y: cursor, w: side.w, h: end - cursor });
    }
  }
  return out;
}

export function drawWalls(ctx: CanvasRenderingContext2D, office: Office) {
  const t = office.wall;
  ctx.save();
  for (const room of office.rooms) {
    for (const seg of wallSegments(room, office.doors, t)) {
      if (seg.w <= 0 || seg.h <= 0) continue;
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(seg.x, seg.y, seg.w, seg.h);
      // top highlight
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(seg.x, seg.y, seg.w, Math.min(3, seg.h));
      // inner shadow onto the floor
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      if (seg.h > seg.w) {
        ctx.fillRect(seg.x + seg.w, seg.y, 4, seg.h);
        ctx.fillRect(seg.x - 2, seg.y, 2, seg.h);
      } else {
        ctx.fillRect(seg.x, seg.y + seg.h, seg.w, 4);
        ctx.fillRect(seg.x, seg.y - 2, seg.w, 2);
      }
    }
  }
  ctx.restore();
}

/** Glass panes on exterior walls, drawn after the wall slabs. */
export function drawWindows(ctx: CanvasRenderingContext2D, office: Office) {
  ctx.save();
  const t = office.wall;
  for (const room of office.rooms) {
    const edges: { x: number; y: number; w: number; h: number }[] = [];
    if (room.y <= 48) edges.push({ x: room.x + 22, y: room.y + 3, w: room.w - 44, h: t - 6 });
    if (room.x <= 48) edges.push({ x: room.x + 3, y: room.y + 22, w: t - 6, h: room.h - 44 });
    if (room.x + room.w >= office.world.w - 48) edges.push({ x: room.x + room.w - t + 3, y: room.y + 22, w: t - 6, h: room.h - 44 });
    for (const e of edges) {
      const grad = ctx.createLinearGradient(e.x, e.y, e.x + e.w, e.y + e.h);
      grad.addColorStop(0, 'rgba(159,216,239,0.95)');
      grad.addColorStop(0.45, 'rgba(214,243,255,0.95)');
      grad.addColorStop(1, 'rgba(123,186,214,0.95)');
      ctx.fillStyle = grad;
      ctx.fillRect(e.x, e.y, e.w, e.h);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(e.x, e.y + e.h * 0.25, e.w, 2);
      ctx.strokeStyle = 'rgba(30,50,70,0.35)';
      ctx.lineWidth = 1;
      const vertical = e.h > e.w;
      const len = vertical ? e.h : e.w;
      for (let p = 60; p < len; p += 70) {
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(e.x, e.y + p);
          ctx.lineTo(e.x + e.w, e.y + p);
        } else {
          ctx.moveTo(e.x + p, e.y);
          ctx.lineTo(e.x + p, e.y + e.h);
        }
        ctx.stroke();
      }
    }
    // light spill onto the floor
    if (room.y <= 48) {
      const spill = ctx.createLinearGradient(0, room.y + t, 0, room.y + t + 60);
      spill.addColorStop(0, 'rgba(200,235,255,0.16)');
      spill.addColorStop(1, 'rgba(200,235,255,0)');
      ctx.fillStyle = spill;
      ctx.fillRect(room.x + t, room.y + t, room.w - t * 2, 60);
    }
  }
  ctx.restore();
}

export function drawDoorFrames(ctx: CanvasRenderingContext2D, office: Office) {
  ctx.save();
  for (const d of office.doors) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    if (d.orientation === 'h') {
      ctx.fillRect(d.x, d.y + d.h / 2 - 1, d.w, 2);
      ctx.fillStyle = 'rgba(201,162,39,0.55)';
      ctx.fillRect(d.x, d.y + d.h / 2 - 1.5, 4, 3);
      ctx.fillRect(d.x + d.w - 4, d.y + d.h / 2 - 1.5, 4, 3);
    }
  }
  ctx.restore();
}

/* ------------------------------ furniture ------------------------------- */

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function drawFurniture(ctx: CanvasRenderingContext2D, item: FurnitureItem) {
  const size = furnitureSize(item);
  const { x, y, w, h } = { x: item.x, y: item.y, w: size.w, h: size.h };
  const seed = hashId(item.id);

  switch (item.type) {
    case 'rug': {
      ctx.save();
      roundRect(ctx, x, y, w, h, 9);
      ctx.fillStyle = item.color || 'rgba(58, 68, 90, 0.5)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 3;
      roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 6);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.lineWidth = 1;
      roundRect(ctx, x + 12, y + 12, w - 24, h - 24, 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      for (let sy = y + 16; sy < y + h - 16; sy += 8) {
        for (let sx = x + 16; sx < x + w - 16; sx += 8) ctx.fillRect(sx, sy, 1.5, 1.5);
      }
      ctx.restore();
      return;
    }
    case 'monitorWall': {
      shadowRect(ctx, x, y, w, h, 3, 0.3);
      roundRect(ctx, x, y, w, h, 4);
      fill(ctx, '#141b24');
      ctx.strokeStyle = 'rgba(120,150,180,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      const bars = [0.4, 0.64, 0.5, 0.82, 0.6];
      bars.forEach((v, i) => {
        const bw = 12;
        const bx = x + 14 + i * (w - 28) / bars.length;
        const bh = (h - 22) * v;
        const g = ctx.createLinearGradient(0, y + h - 8 - bh, 0, y + h - 8);
        g.addColorStop(0, '#57e0ff');
        g.addColorStop(1, '#1e7fa8');
        ctx.fillStyle = g;
        ctx.fillRect(bx, y + h - 8 - bh, bw, bh);
      });
      ctx.fillStyle = 'rgba(87,224,255,0.9)';
      ctx.fillRect(x + w - 34, y + 6, 24, 3);
      return;
    }
    case 'whiteboard':
      shadowRect(ctx, x, y, w, h, 2, 0.35);
      roundRect(ctx, x, y, w, h, 2);
      fill(ctx, '#eef3f7');
      ctx.strokeStyle = '#9aa7b5';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#3f8efc';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x + 8, y + h * 0.45);
      ctx.lineTo(x + w * 0.32, y + h * 0.35);
      ctx.lineTo(x + w * 0.5, y + h * 0.6);
      ctx.stroke();
      ctx.strokeStyle = '#f2655a';
      ctx.beginPath();
      ctx.moveTo(x + w * 0.55, y + h * 0.4);
      ctx.lineTo(x + w * 0.8, y + h * 0.4);
      ctx.stroke();
      return;
    case 'screen':
      roundRect(ctx, x, y, w, h, 3);
      fill(ctx, '#0d1620');
      ctx.fillStyle = 'rgba(87,224,255,0.55)';
      ctx.fillRect(x + 10, y + 4, w - 20, 2);
      return;
    case 'plant': {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(x + w / 2 + 2, y + h - 4, w * 0.42, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
      // pot
      roundRect(ctx, x + w * 0.24, y + h * 0.56, w * 0.52, h * 0.42, 3);
      fill(ctx, PALETTE.pot);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(x + w * 0.24, y + h * 0.56, w * 0.52, 3);
      // leaves
      for (let i = 0; i < 7; i++) {
        const ang = (i / 7) * Math.PI * 2 + (seed % 10) / 5;
        const rx = x + w / 2 + Math.cos(ang) * w * 0.24;
        const ry = y + h * 0.42 + Math.sin(ang) * h * 0.22;
        ctx.fillStyle = i % 2 ? PALETTE.leafA : PALETTE.leafB;
        ctx.beginPath();
        ctx.ellipse(rx, ry, w * 0.2, h * 0.14, ang, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    default:
      break;
  }

  // generic furniture body cast
  shadowRect(ctx, x, y, w, h, 4, 0.24);
  switch (item.type) {
    case 'execDesk': {
      roundRect(ctx, x, y, w, h, 6);
      fill(ctx, PALETTE.execTop);
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 1.5;
      roundRect(ctx, x + 4, y + 4, w - 8, h - 8, 4);
      ctx.stroke();
      // desk items
      ctx.fillStyle = '#0d1620';
      roundRect(ctx, x + w * 0.32, y + 12, 52, 12, 2); ctx.fill();
      roundRect(ctx, x + w * 0.32, y + 34, 52, 12, 2); ctx.fill();
      ctx.fillStyle = 'rgba(87,224,255,0.5)';
      ctx.fillRect(x + w * 0.32 + 3, y + 15, 44, 6);
      ctx.fillRect(x + w * 0.32 + 3, y + 37, 44, 6);
      ctx.fillStyle = '#2a313c';
      roundRect(ctx, x + w * 0.62, y + 26, 46, 22, 3); ctx.fill();
      ctx.fillStyle = '#556170';
      ctx.fillRect(x + w * 0.62 + 6, y + 32, 34, 2);
      ctx.fillRect(x + w * 0.62 + 6, y + 38, 24, 2);
      return;
    }
    case 'receptionDesk': {
      roundRect(ctx, x, y, w, h, 8);
      fill(ctx, '#2f3a4c');
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(0,0,0,0.25)');
      ctx.fillStyle = g;
      roundRect(ctx, x, y, w, h, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(201,162,39,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 14, y + h - 8);
      ctx.lineTo(x + w - 14, y + h - 8);
      ctx.stroke();
      // terminal + plant
      ctx.fillStyle = '#0d1620';
      roundRect(ctx, x + w * 0.12, y + 10, 40, 10, 2); ctx.fill();
      roundRect(ctx, x + w * 0.62, y + 10, 40, 10, 2); ctx.fill();
      ctx.fillStyle = PALETTE.leafB;
      ctx.beginPath(); ctx.arc(x + w * 0.86, y + h * 0.42, 9, 0, Math.PI * 2); ctx.fill();
      return;
    }
    case 'meetingTable': {
      roundRect(ctx, x, y, w, h, Math.min(h / 2, 26));
      const g = ctx.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, shade(PALETTE.woodB, 0.12));
      g.addColorStop(1, PALETTE.woodA);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = PALETTE.woodLine;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      roundRect(ctx, x + 10, y + 6, w - 20, h * 0.3, 12);
      ctx.fill();
      // laptops / papers
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(20,26,34,0.75)';
        roundRect(ctx, x + w * 0.18 + (i % 2) * w * 0.4, y + 18 + Math.floor(i / 2) * (h - 46), 34, 16, 2);
        ctx.fill();
      }
      return;
    }
    case 'sofa': {
      roundRect(ctx, x, y, w, h, 7);
      fill(ctx, PALETTE.fabric);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      roundRect(ctx, x + 3, y + 3, w - 6, h * 0.34, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      for (let i = 0; i < 3; i++) {
        roundRect(ctx, x + 6 + i * ((w - 12) / 3), y + h * 0.36, (w - 12) / 3 - 4, h * 0.52, 4);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.09)';
      ctx.lineWidth = 1;
      roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 7);
      ctx.stroke();
      return;
    }
    case 'coffeeTable': {
      roundRect(ctx, x, y, w, h, 6);
      fill(ctx, 'rgba(150,200,220,0.35)');
      ctx.strokeStyle = 'rgba(220,240,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(ctx, x + w * 0.2, y + h * 0.25, w * 0.3, h * 0.3, 2);
      ctx.fill();
      return;
    }
    case 'cabinet': {
      roundRect(ctx, x, y, w, h, 3);
      fill(ctx, '#5b6577');
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x + 4, y + 6 + i * ((h - 10) / 3), w - 8, 2);
        ctx.fillStyle = '#8f9aa8';
        ctx.fillRect(x + w / 2 - 7, y + 10 + i * ((h - 10) / 3), 14, 2);
      }
      return;
    }
    case 'bookshelf': {
      roundRect(ctx, x, y, w, h, 3);
      fill(ctx, '#4a3a2c');
      const colors = ['#c9a227', '#3f8efc', '#f2655a', '#4fb286', '#9b6bf2', '#e0e6ef'];
      let bx = x + 4;
      let i = 0;
      while (bx < x + w - 6) {
        const bw = 4 + ((seed + i * 7) % 5);
        ctx.fillStyle = colors[(seed + i) % colors.length];
        const bh = h - 10 - ((seed + i * 3) % 6);
        ctx.fillRect(bx, y + 5 + (h - 10 - bh), bw, bh);
        bx += bw + 2;
        i++;
      }
      return;
    }
    case 'waterCooler': {
      roundRect(ctx, x + 4, y + h * 0.4, w - 8, h * 0.6, 3);
      fill(ctx, '#c8d2dd');
      ctx.fillStyle = 'rgba(140,200,235,0.85)';
      roundRect(ctx, x + 7, y + 2, w - 14, h * 0.44, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(x + 9, y + 5, 4, h * 0.3);
      return;
    }
    case 'coffeeMachine': {
      roundRect(ctx, x, y, w, h, 3);
      fill(ctx, '#39414f');
      ctx.fillStyle = '#12161d';
      ctx.fillRect(x + 4, y + 4, w - 8, h * 0.45);
      ctx.fillStyle = '#e85d4a';
      ctx.fillRect(x + 7, y + h * 0.62, 4, 3);
      ctx.fillStyle = '#4fb286';
      ctx.fillRect(x + 13, y + h * 0.62, 4, 3);
      return;
    }
    case 'printer': {
      roundRect(ctx, x, y, w, h, 3);
      fill(ctx, '#5d6878');
      ctx.fillStyle = '#2b323d';
      ctx.fillRect(x + 6, y + 5, w - 12, h * 0.3);
      ctx.fillStyle = '#dfe6ee';
      ctx.fillRect(x + 8, y + h * 0.55, w - 16, h * 0.3);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(x + 8, y + h * 0.62, w - 16, 2);
      return;
    }
    case 'serverRack': {
      roundRect(ctx, x, y, w, h, 4);
      fill(ctx, '#1b212b');
      ctx.strokeStyle = '#39414f';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const ry = y + 8 + i * ((h - 16) / 8);
        ctx.fillStyle = '#2a323d';
        ctx.fillRect(x + 6, ry, w - 12, (h - 16) / 8 - 3);
        ctx.fillStyle = i % 3 === 0 ? '#4fd1ff' : '#43d17c';
        ctx.fillRect(x + w - 14, ry + 3, 4, 3);
      }
      return;
    }
    case 'vendingMachine': {
      roundRect(ctx, x, y, w, h, 3);
      fill(ctx, '#2c3542');
      ctx.fillStyle = 'rgba(150,220,255,0.28)';
      ctx.fillRect(x + 4, y + 4, w - 8, h * 0.62);
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = ['#f2655a', '#f2994a', '#4fb286', '#3f8efc', '#c9a227', '#9b6bf2'][i];
        ctx.fillRect(x + 7 + (i % 3) * 13, y + 8 + Math.floor(i / 3) * 14, 8, 9);
      }
      return;
    }
    default: {
      roundRect(ctx, x, y, w, h, 4);
      fill(ctx, '#5a6474');
    }
  }
}

/* ------------------------------ workstations ----------------------------- */

export function drawChair(ctx: CanvasRenderingContext2D, cx: number, cy: number, style: 'std' | 'exec' = 'std', facing: DirKey = 'down') {
  const w = style === 'exec' ? 34 : 30;
  const h = style === 'exec' ? 30 : 26;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx + 1, cy + 3, w * 0.5, h * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();
  // backrest sits opposite the facing direction
  const back = style === 'exec' ? '#2a313c' : PALETTE.fabricDark;
  ctx.fillStyle = back;
  if (facing === 'down') {
    roundRect(ctx, cx - w / 2, cy - h / 2 - 4, w, 10, 4);
  } else if (facing === 'up') {
    roundRect(ctx, cx - w / 2, cy + h / 2 - 6, w, 10, 4);
  } else if (facing === 'right') {
    roundRect(ctx, cx - w / 2 - 4, cy - h / 2, 10, h, 4);
  } else {
    roundRect(ctx, cx + w / 2 - 6, cy - h / 2, 10, h, 4);
  }
  ctx.fill();
  roundRect(ctx, cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4, 5);
  fill(ctx, style === 'exec' ? '#3a4351' : PALETTE.fabric);
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, cx - w / 2 + 5, cy - h / 2 + 5, w - 10, 5, 3);
  ctx.fill();
  ctx.restore();
}

export function drawStationDesk(ctx: CanvasRenderingContext2D, st: { x: number; y: number; desk: { w: number; h: number }; style?: string }) {
  const { x, y } = st;
  const w = st.desk.w;
  const h = st.desk.h;
  const exec = st.style === 'exec';
  shadowRect(ctx, x, y, w, h, 4, 0.26);
  roundRect(ctx, x, y, w, h, 4);
  fill(ctx, exec ? PALETTE.execTop : PALETTE.deskTop);
  // top edge sheen
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  roundRect(ctx, x + 2, y + 2, w - 4, h * 0.3, 3);
  ctx.fill();
  ctx.strokeStyle = exec ? 'rgba(201,162,39,0.55)' : PALETTE.deskEdge;
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 4);
  ctx.stroke();
  // monitor, facing whichever side the chair is on
  const monW = 50;
  const monH = 12;
  const mx = x + w / 2 - monW / 2;
  const my = st.style === 'exec' ? y + 10 : y + 7;
  ctx.fillStyle = '#0b1119';
  roundRect(ctx, mx, my, monW, monH, 2);
  ctx.fill();
  const scr = ctx.createLinearGradient(mx, my, mx, my + monH);
  scr.addColorStop(0, 'rgba(96,226,255,0.55)');
  scr.addColorStop(1, 'rgba(40,120,180,0.35)');
  ctx.fillStyle = scr;
  ctx.fillRect(mx + 3, my + 3, monW - 6, monH - 6);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillRect(mx + 5, my + 5, monW - 10, 1.5);
  ctx.fillStyle = '#39414f';
  ctx.fillRect(mx + monW / 2 - 3, my + monH, 6, 3);
  // keyboard + mouse + mug
  ctx.fillStyle = '#48525f';
  roundRect(ctx, x + w / 2 - 20, my + monH + 8, 40, 11, 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + w / 2 - 17, my + monH + 10 + i * 3, 34, 1);
  ctx.fillStyle = '#8f9aa8';
  ctx.beginPath();
  ctx.arc(x + w / 2 + 30, my + monH + 13, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0e6ef';
  roundRect(ctx, x + 12, my + monH + 6, 13, 9, 2);
  ctx.fill();
  ctx.fillStyle = '#6b4a30';
  ctx.fillRect(x + 15, my + monH + 4, 7, 2);
}

/* ------------------------------ architecture ----------------------------- */

/** Solid building mass behind the floors so gaps between rooms read as walls. */
export function drawBuildingBase(ctx: CanvasRenderingContext2D, office: Office) {
  if (!office.rooms.length) return;
  const minX = Math.min(...office.rooms.map((r) => r.x));
  const minY = Math.min(...office.rooms.map((r) => r.y));
  const maxX = Math.max(...office.rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...office.rooms.map((r) => r.y + r.h));
  const pad = 14;
  ctx.fillStyle = PALETTE.wallDark;
  ctx.fillRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(minX - pad, minY - pad, maxX - minX + pad * 2, 2);
}

/** Soft ceiling-light pools, drawn over the floors to give the rooms depth. */
export function drawLightPools(ctx: CanvasRenderingContext2D, office: Office) {
  ctx.save();
  for (const room of office.rooms) {
    const cols = Math.max(1, Math.round(room.w / 260));
    const rows = Math.max(1, Math.round(room.h / 220));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const cx = room.x + (room.w / cols) * (i + 0.5);
        const cy = room.y + (room.h / rows) * (j + 0.5);
        const g = ctx.createRadialGradient(cx, cy, 6, cx, cy, Math.min(room.w / cols, room.h / rows) * 0.72);
        g.addColorStop(0, 'rgba(210,232,255,0.10)');
        g.addColorStop(1, 'rgba(210,232,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(room.x, room.y, room.w, room.h);
      }
    }
  }
  ctx.restore();
}

export function drawRoomLabels(ctx: CanvasRenderingContext2D, office: Office, departments: { id: string; name: string; color: string }[]) {
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const room of office.rooms) {
    const dept = departments.find((d) => d.id === room.deptId);
    const text = room.name.toUpperCase();
    ctx.font = '700 12.5px ui-sans-serif, system-ui, sans-serif';
    const tw = ctx.measureText(text).width;
    const w = tw + 26;
    const h = 21;
    // Bottom-row rooms have their first desk tight under the wall, so their
    // sign sits on the south wall instead.
    const bottom = room.y > 860;
    const x = room.x + office.wall + 10;
    const y = bottom ? room.y + room.h - office.wall - h - 7 : room.y + office.wall + 7;
    ctx.fillStyle = 'rgba(8,12,18,0.62)';
    roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.strokeStyle = dept ? `${dept.color}88` : 'rgba(160,180,210,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (dept) {
      ctx.fillStyle = dept.color;
      roundRect(ctx, x + 4, y + 5, 3, h - 10, 1.5);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(230,240,252,0.86)';
    ctx.fillText(text, x + 13, y + h / 2 + 0.5);
  }
  ctx.restore();
}

/* ------------------------------- characters ------------------------------ */
/*
 * Characters are ~38px tall with the origin at the feet. Every sprite is drawn
 * into a cached offscreen canvas at 2x so zooming stays crisp.
 */

export const CHAR_W = 56;
export const CHAR_H = 84;
const SPRITE_SCALE = 2;
/** Characters are drawn small then scaled up so silhouettes read at office zoom. */
const BODY_SCALE = 1.85;

function drawCharacterBody(ctx: CanvasRenderingContext2D, a: Appearance, pose: Pose, dir: DirKey, frame: number) {
  const sitting = pose === 'sit' || pose === 'type' || pose === 'meet';
  const headY = sitting ? -27 : -33;
  const torsoTop = sitting ? -21 : -27;
  const torsoH = sitting ? 15 : 16;
  const shirt = a.shirt;
  const shirtDark = shade(shirt, -0.25);
  const skin = a.skin;
  const skinDark = shade(skin, -0.18);
  const pants = a.pants;

  // ---- legs
  if (!sitting) {
    const swing = pose === 'walk' ? (frame % 2 === 0 ? 3 : -3) : 0;
    ctx.fillStyle = pants;
    roundRect(ctx, -7 + swing * 0.4, -11, 6, 11, 2);
    ctx.fill();
    roundRect(ctx, 1 - swing * 0.4, -11, 6, 11, 2);
    ctx.fill();
    ctx.fillStyle = '#1b1f26';
    roundRect(ctx, -7 + swing * 0.4, -2, 6, 3, 1.5);
    ctx.fill();
    roundRect(ctx, 1 - swing * 0.4, -2, 6, 3, 1.5);
    ctx.fill();
  } else {
    ctx.fillStyle = pants;
    roundRect(ctx, -8, -10, 16, 6, 3);
    ctx.fill();
  }

  // ---- torso
  const bw = 16;
  roundRect(ctx, -bw / 2, torsoTop, bw, torsoH, 4);
  fill(ctx, shirt);
  ctx.fillStyle = shirtDark;
  roundRect(ctx, -bw / 2, torsoTop + torsoH - 5, bw, 5, 3);
  ctx.fill();
  // collar / tie detail
  if (dir !== 'up') {
    ctx.fillStyle = shade(shirt, 0.28);
    ctx.beginPath();
    ctx.moveTo(-4, torsoTop);
    ctx.lineTo(0, torsoTop + 5);
    ctx.lineTo(4, torsoTop);
    ctx.closePath();
    ctx.fill();
    if (a.accessory === 'badge') {
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(2, torsoTop + 7, 4, 3);
    }
  }

  // ---- arms
  const armSwing = pose === 'walk' ? (frame % 2 === 0 ? 2 : -2) : 0;
  const typing = pose === 'type';
  ctx.fillStyle = shirtDark;
  if (dir === 'left' || dir === 'right') {
    roundRect(ctx, 0, torsoTop + 2, 5, torsoH - 1, 2);
    ctx.fill();
    if (typing) {
      ctx.fillStyle = skinDark;
      roundRect(ctx, 1, torsoTop + torsoH - 3, 8, 4, 2);
      ctx.fill();
    }
  } else {
    roundRect(ctx, -bw / 2 - 4, torsoTop + 2 + armSwing, 5, torsoH - 2, 2);
    ctx.fill();
    roundRect(ctx, bw / 2 - 1, torsoTop + 2 - armSwing, 5, torsoH - 2, 2);
    ctx.fill();
    if (typing) {
      ctx.fillStyle = skin;
      roundRect(ctx, -8, torsoTop + torsoH - 2, 16, 5, 2);
      ctx.fill();
    }
    if (pose === 'think') {
      ctx.fillStyle = skin;
      roundRect(ctx, bw / 2 - 2, torsoTop - 3, 5, 8, 2);
      ctx.fill();
    }
  }

  // ---- head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, headY - 4, 8.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  if (dir !== 'up') {
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(0, headY + 1, 6, 4, 0, 0, Math.PI);
    ctx.fill();
  }

  // ---- hair
  const hair = a.hair;
  ctx.fillStyle = hair;
  ctx.beginPath();
  if (a.hairStyle === 'bald') {
    ctx.ellipse(0, headY - 2, 6, 3, 0, Math.PI, Math.PI * 2);
  } else if (dir === 'up') {
    ctx.ellipse(0, headY - 4, 8.8, 9.2, 0, 0, Math.PI * 2);
  } else {
    ctx.ellipse(0, headY - 6, 8.8, 7.4, 0, Math.PI, Math.PI * 2);
    // fringe
    ctx.rect(-8.8, headY - 7, 17.6, 3.2);
  }
  ctx.fill();
  if (a.hairStyle === 'long') {
    ctx.fillStyle = hair;
    roundRect(ctx, -9.4, headY - 5, 3.4, 15, 2);
    ctx.fill();
    roundRect(ctx, 6, headY - 5, 3.4, 15, 2);
    ctx.fill();
  }
  if (a.hairStyle === 'bun') {
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(0, headY - 13, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.hairStyle === 'curly') {
    ctx.fillStyle = hair;
    for (let i = 0; i < 5; i++) {
      const ang = Math.PI + (i / 4) * Math.PI;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * 8, headY - 4 + Math.sin(ang) * 6, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- face
  if (dir === 'down') {
    ctx.fillStyle = '#1b1f26';
    if (pose === 'think') {
      ctx.fillRect(-4.5, headY - 3, 1.6, 2);
      ctx.fillRect(3, headY - 3, 1.6, 2);
    } else {
      ctx.fillRect(-4.5, headY - 4, 1.8, 2.2);
      ctx.fillRect(2.7, headY - 4, 1.8, 2.2);
    }
  } else if (dir === 'left') {
    ctx.fillStyle = '#1b1f26';
    ctx.fillRect(-5.6, headY - 4, 1.8, 2.2);
  } else if (dir === 'right') {
    ctx.fillStyle = '#1b1f26';
    ctx.fillRect(3.8, headY - 4, 1.8, 2.2);
  }

  // ---- accessories
  if (a.accessory === 'glasses' && dir !== 'up') {
    ctx.strokeStyle = 'rgba(30,36,46,0.9)';
    ctx.lineWidth = 1;
    roundRect(ctx, -6.5, headY - 5.5, 5.4, 4, 1.4);
    ctx.stroke();
    roundRect(ctx, 1.1, headY - 5.5, 5.4, 4, 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-1.1, headY - 3.5);
    ctx.lineTo(1.1, headY - 3.5);
    ctx.stroke();
  }
  if (a.accessory === 'headset' && dir !== 'down') {
    ctx.strokeStyle = '#222933';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, headY - 4, 9, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.fillStyle = '#222933';
    ctx.beginPath();
    ctx.ellipse(8.4, headY - 2, 2.6, 3.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (a.accessory === 'earpiece' && dir !== 'down') {
    ctx.fillStyle = '#2f3a4a';
    ctx.beginPath();
    ctx.arc(-8.6, headY - 2, 2.2, 0, Math.PI * 2);
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
  ctx.translate(CHAR_W / 2, CHAR_H - 10);
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
  ctx.drawImage(sprite, x - CHAR_W / 2, y - CHAR_H + 10, CHAR_W, CHAR_H);
  ctx.restore();
}

export function drawCharacterShadow(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 15 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/* -------------------------------- overlays ------------------------------- */

export function drawMonitorGlow(ctx: CanvasRenderingContext2D, st: { x: number; y: number; desk: { w: number; h: number } }, color: string, strength: number) {
  const mx = st.x + st.desk.w / 2;
  const my = st.y + 14;
  const g = ctx.createRadialGradient(mx, my, 2, mx, my, 46);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, strength)) * 0.55;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(mx, my + 4, 52, 34, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawProgressRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, t: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const start = t * 2;
  ctx.beginPath();
  ctx.arc(x, y, radius, start, start + Math.PI * 1.2);
  ctx.stroke();
  ctx.restore();
}

export function drawStatusBadge(ctx: CanvasRenderingContext2D, x: number, y: number, status: string, color: string, t: number) {
  ctx.save();
  const bob = Math.sin(t * 3 + x) * 1.4;
  const cy = y + bob;
  ctx.fillStyle = 'rgba(10,14,20,0.82)';
  roundRect(ctx, x - 7, cy - 7, 14, 14, 7);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = color;
  if (status === 'working') {
    // typing dots
    for (let i = 0; i < 3; i++) {
      const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 4 - i * 0.7));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(x - 3 + i * 3, cy, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (status === 'meeting') {
    ctx.beginPath();
    ctx.arc(x, cy - 1, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 4.5, cy + 2, 9, 1.6);
  } else if (status === 'simulated') {
    ctx.font = 'bold 8px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', x, cy + 0.5);
  } else if (status === 'offline' || status === 'disconnected') {
    ctx.fillRect(x - 3, cy - 0.8, 6, 1.6);
  } else {
    ctx.beginPath();
    ctx.arc(x, cy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawNameTag(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
  ctx.save();
  ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
  const w = ctx.measureText(text).width + 14;
  ctx.fillStyle = 'rgba(9,12,18,0.78)';
  roundRect(ctx, x - w / 2, y - 13, w, 15, 7.5);
  ctx.fill();
  ctx.strokeStyle = `${color}66`;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#e8eef7';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 5);
  ctx.restore();
}

/** The chair each meeting seat needs, drawn under the character. */
export function drawMeetingChairs(ctx: CanvasRenderingContext2D, seats: { x: number; y: number; facing?: string }[]) {
  for (const s of seats) {
    drawChair(ctx, s.x, s.y + 10, 'std', (s.facing as DirKey) || 'down');
  }
}

export function seatGeometry(office: Office) {
  return office.stations.map((st) => ({ ...st, geom: stationGeom(st) }));
}
