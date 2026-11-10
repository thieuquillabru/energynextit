import type { FurnitureItem, Office, Room, Station } from '../types';

export type Dir = 'up' | 'down' | 'left' | 'right';

/** Footprint of every furniture type. Must match what sprites.ts draws. */
export const FURNITURE_SIZE: Record<string, { w: number; h: number; solid: boolean }> = {
  desk: { w: 124, h: 56, solid: true },
  execDesk: { w: 170, h: 84, solid: true },
  receptionDesk: { w: 220, h: 70, solid: true },
  coffeeTable: { w: 90, h: 50, solid: false },
  meetingTable: { w: 260, h: 120, solid: true },
  sofa: { w: 130, h: 54, solid: true },
  plant: { w: 34, h: 34, solid: true },
  cabinet: { w: 74, h: 40, solid: true },
  bookshelf: { w: 96, h: 36, solid: true },
  whiteboard: { w: 140, h: 14, solid: true },
  screen: { w: 120, h: 12, solid: true },
  rug: { w: 200, h: 140, solid: false },
  waterCooler: { w: 28, h: 28, solid: true },
  coffeeMachine: { w: 32, h: 26, solid: true },
  printer: { w: 56, h: 40, solid: true },
  serverRack: { w: 62, h: 92, solid: true },
  vendingMachine: { w: 54, h: 40, solid: true },
  monitorWall: { w: 160, h: 46, solid: true },
  tableRound: { w: 90, h: 90, solid: true },
};

export function furnitureSize(item: FurnitureItem) {
  const base = FURNITURE_SIZE[item.type] || { w: 60, h: 40, solid: true };
  return {
    w: item.w || (item.small ? Math.round(base.w * 0.7) : base.w),
    h: item.h || (item.small ? Math.round(base.h * 0.7) : base.h),
    solid: item.solid !== undefined ? item.solid : base.solid,
  };
}

export function stationGeom(st: Station) {
  const { x, y } = st;
  const w = st.desk?.w || 124;
  const h = st.desk?.h || 56;
  const desk = { x, y, w, h };
  let seat: { x: number; y: number };
  let stand: { x: number; y: number };
  let facing: Dir;
  if (st.orientation === 'down') {
    seat = { x: x + w / 2, y: y + h + 14 };
    stand = { x: x + w / 2, y: y + h + 34 };
    facing = 'up';
  } else if (st.orientation === 'left') {
    seat = { x: x - 14, y: y + h / 2 };
    stand = { x: x - 34, y: y + h / 2 };
    facing = 'right';
  } else if (st.orientation === 'right') {
    seat = { x: x + w + 14, y: y + h / 2 };
    stand = { x: x + w + 34, y: y + h / 2 };
    facing = 'left';
  } else {
    // The employee sits north of the desk and looks down at the monitor, so we
    // see their face rather than the back of their head.
    seat = { x: x + w / 2, y: y - 16 };
    stand = { x: x + w / 2, y: y - 36 };
    facing = 'down';
  }
  return { desk, seat, stand, facing };
}

export function roomById(office: Office, id: string | null | undefined): Room | undefined {
  if (!id) return undefined;
  return office.rooms.find((r) => r.id === id);
}

export function roomAt(office: Office, x: number, y: number): Room | undefined {
  return office.rooms.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
}

export function roomCenter(room: Room) {
  return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
}

/** Best-effort interior point used for "go to this room" behaviour. */
export function roomWaypoint(office: Office, room: Room) {
  const pad = office.wall + 26;
  const stations = office.stations.filter((s) => s.roomId === room.id);
  if (stations.length) {
    const g = stationGeom(stations[Math.floor(stations.length / 2)]);
    return { x: g.stand.x, y: g.stand.y + 40 };
  }
  return { x: room.x + pad, y: room.y + pad };
}

/* ------------------------------- navigation ----------------------------- */

export const CELL = 10;

type RectLike = { x: number; y: number; w: number; h: number };

function inflate(r: RectLike, by: number) {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

export class NavGrid {
  cols: number;
  rows: number;
  walk: Uint8Array;
  cell = CELL;
  world: { w: number; h: number };

  constructor(world: { w: number; h: number }, floors: RectLike[], blockers: RectLike[]) {
    this.world = world;
    this.cols = Math.ceil(world.w / CELL);
    this.rows = Math.ceil(world.h / CELL);
    this.walk = new Uint8Array(this.cols * this.rows);

    for (let gy = 0; gy < this.rows; gy++) {
      for (let gx = 0; gx < this.cols; gx++) {
        const cx = gx * CELL + CELL / 2;
        const cy = gy * CELL + CELL / 2;
        const onFloor = floors.some((r) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h);
        const blocked = blockers.some((r) => cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h);
        this.walk[gy * this.cols + gx] = onFloor && !blocked ? 1 : 0;
      }
    }
  }

  idx(gx: number, gy: number) {
    return gy * this.cols + gx;
  }

  isFreeWorld(x: number, y: number) {
    const gx = Math.floor(x / CELL);
    const gy = Math.floor(y / CELL);
    if (gx < 0 || gy < 0 || gx >= this.cols || gy >= this.rows) return false;
    return this.walk[this.idx(gx, gy)] === 1;
  }

  nearestFree(x: number, y: number, maxR = 60) {
    if (this.isFreeWorld(x, y)) return { x, y };
    for (let r = CELL; r <= maxR; r += CELL) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const nx = x + Math.cos(ang) * r;
        const ny = y + Math.sin(ang) * r;
        if (this.isFreeWorld(nx, ny)) return { x: nx, y: ny };
      }
    }
    return null;
  }

  findPath(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
    const start = this.nearestFree(from.x, from.y);
    const goal = this.nearestFree(to.x, to.y);
    if (!start || !goal) return [];
    const sx = Math.floor(start.x / CELL);
    const sy = Math.floor(start.y / CELL);
    const gx = Math.floor(goal.x / CELL);
    const gy = Math.floor(goal.y / CELL);
    if (sx === gx && sy === gy) return [goal];

    const total = this.cols * this.rows;
    const gScore = new Float32Array(total).fill(Infinity);
    const fScore = new Float32Array(total).fill(Infinity);
    const came = new Int32Array(total).fill(-1);
    const closed = new Uint8Array(total);
    const open: number[] = [];

    const h = (x: number, y: number) => {
      const dx = Math.abs(x - gx);
      const dy = Math.abs(y - gy);
      return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };

    const startIdx = this.idx(sx, sy);
    gScore[startIdx] = 0;
    fScore[startIdx] = h(sx, sy);
    open.push(startIdx);

    const neighbors = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ];

    let guard = 0;
    while (open.length && guard++ < 20000) {
      // small N: linear scan keeps the implementation dependency-free
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if (fScore[open[i]] < fScore[open[best]]) best = i;
      }
      const current = open.splice(best, 1)[0];
      if (current === this.idx(gx, gy)) {
        const cells = [current];
        let c = current;
        while (came[c] !== -1) {
          c = came[c];
          cells.push(c);
        }
        cells.reverse();
        const pts = cells.map((i) => ({
          x: (i % this.cols) * CELL + CELL / 2,
          y: Math.floor(i / this.cols) * CELL + CELL / 2,
        }));
        pts[pts.length - 1] = goal;
        return this.smooth(pts);
      }
      closed[current] = 1;
      const cx = current % this.cols;
      const cy = Math.floor(current / this.cols);
      for (const [dx, dy, cost] of neighbors) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const ni = this.idx(nx, ny);
        if (this.walk[ni] !== 1 || closed[ni]) continue;
        if (dx !== 0 && dy !== 0) {
          // no corner cutting
          if (this.walk[this.idx(cx + dx, cy)] !== 1 || this.walk[this.idx(cx, cy + dy)] !== 1) continue;
        }
        const tentative = gScore[current] + cost;
        if (tentative < gScore[ni]) {
          came[ni] = current;
          gScore[ni] = tentative;
          fScore[ni] = tentative + h(nx, ny);
          open.push(ni);
        }
      }
    }
    return this.smooth([start, goal]);
  }

  lineFree(a: { x: number; y: number }, b: { x: number; y: number }) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(dist / (CELL * 0.5));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.isFreeWorld(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  smooth(points: { x: number; y: number }[]) {
    if (points.length <= 2) return points;
    const out = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      for (; j > i + 1; j--) {
        if (this.lineFree(points[i], points[j])) break;
      }
      out.push(points[j]);
      i = j;
    }
    return out;
  }
}

export function buildNav(office: Office): NavGrid {
  const floors: RectLike[] = [];
  const blockers: RectLike[] = [];
  const wall = office.wall;

  for (const room of office.rooms) {
    floors.push({
      x: room.x + wall,
      y: room.y + wall,
      w: room.w - wall * 2,
      h: room.h - wall * 2,
    });
  }
  for (const c of office.corridors) floors.push(c);
  for (const d of office.doors) floors.push(d);

  for (const f of office.furniture) {
    const size = furnitureSize(f);
    if (!size.solid) continue;
    blockers.push(inflate({ x: f.x, y: f.y, w: size.w, h: size.h }, 2));
  }
  for (const st of office.stations) {
    const g = stationGeom(st);
    blockers.push(inflate(g.desk, 2));
  }
  return new NavGrid(office.world, floors, blockers);
}

/** Nav is expensive to build; cache it per office revision. */
let navCache: { key: string; nav: NavGrid } | null = null;
export function getNav(office: Office) {
  const key = JSON.stringify([
    office.world,
    office.wall,
    office.rooms.map((r) => [r.id, r.x, r.y, r.w, r.h]),
    office.corridors.map((c) => [c.x, c.y, c.w, c.h]),
    office.doors.map((d) => [d.x, d.y, d.w, d.h]),
    office.furniture.map((f) => [f.type, f.x, f.y, f.w, f.h, f.solid]),
    office.stations.map((s) => [s.id, s.x, s.y, s.orientation]),
  ]);
  if (navCache && navCache.key === key) return navCache.nav;
  const nav = buildNav(office);
  navCache = { key, nav };
  return nav;
}
