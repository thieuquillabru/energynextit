import type {
  Appearance, Department, Employee, FurnitureItem, Meeting, Office, Snapshot, Station, Task,
} from '../types';
import {
  furnitureSize, getNav, roomAt, roomById, roomCenter, stationGeom, CELL, type NavGrid,
} from './layout';
import {
  blitCharacter, drawChair, drawCharacterShadow, drawDoorFrames, drawFurniture,
  drawMonitorGlow, drawNameTag, drawStatusBadge, drawStationDesk,
  drawBuildingBase, drawLightPools, drawRoomLabels, drawWalls, drawWindows, paintFloor,
  PALETTE, roundRect,
  type DirKey, type Pose,
} from './sprites';

export type Camera = { x: number; y: number; zoom: number };

type Mode = 'desk' | 'walk-to-desk' | 'walk-to-meeting' | 'meeting' | 'wander' | 'walk-to-wander' | 'offline';

type Actor = {
  id: string;
  appearance: Appearance;
  name: string;
  x: number;
  y: number;
  dir: DirKey;
  pose: Pose;
  frame: number;
  frameT: number;
  speed: number;
  mode: Mode;
  path: { x: number; y: number }[];
  pathIndex: number;
  seat: { x: number; y: number } | null;
  seatFacing: DirKey;
  status: Employee['status'];
  departmentColor: string;
  wanderTimer: number;
  bubble: { text: string; until: number } | null;
  spawnT: number;
  opacity: number;
};

export type SceneCallbacks = {
  onSelectEmployee?: (id: string) => void;
  onSelectEntity?: (sel: { kind: 'furniture' | 'station' | 'room'; id: string } | null) => void;
  onCamera?: (cam: Camera) => void;
  onDoubleClickEmployee?: (id: string) => void;
  onHover?: (id: string | null) => void;
  onLayoutEdited?: (office: Office, note: string) => void;
};

const STATUS_COLOR: Record<string, string> = {
  working: '#4fd1ff',
  meeting: '#c9a227',
  idle: '#4fb286',
  simulated: '#f2994a',
  offline: '#8a93a0',
  disconnected: '#f2655a',
};

const FLOOR_SCALE = 1.5;

export class OfficeScene {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cb: SceneCallbacks;
  data: Snapshot | null = null;
  actors = new Map<string, Actor>();
  cam: Camera = { x: 900, y: 620, zoom: 0.7 };
  camTarget: Camera = { x: 900, y: 620, zoom: 0.7 };
  selectedId: string | null = null;
  hoverId: string | null = null;
  editor = false;
  editorSelection: { kind: 'furniture' | 'station' | 'room'; id: string } | null = null;
  staticLayer: HTMLCanvasElement | null = null;
  staticKey = '';
  nav: NavGrid | null = null;
  dpr = 1;
  width = 0;
  height = 0;
  running = false;
  lastT = 0;
  time = 0;
  dragging: {
    mode: 'pan' | 'entity';
    startX: number; startY: number; camX: number; camY: number;
    moved: boolean;
    entity?: { kind: 'furniture' | 'station' | 'room'; id: string; offsetX: number; offsetY: number; original: Office };
  } | null = null;
  fitOnNextData = true;

  constructor(canvas: HTMLCanvasElement, cb: SceneCallbacks = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.cb = cb;
    this.bindEvents();
    this.resize();
  }

  /* ------------------------------- lifecycle ------------------------------ */

  setData(data: Snapshot) {
    const prev = this.data;
    this.data = data;
    if (data.office) {
      this.nav = getNav(data.office);
      const key = this.staticLayerKey(data.office, data.departments);
      if (key !== this.staticKey) {
        this.staticKey = key;
        this.buildStaticLayer();
      }
    }
    this.syncActors(prev, data);
    if (this.fitOnNextData) {
      this.fitOnNextData = false;
      this.fitToOffice(false);
    }
    this.camTarget.x = Math.min(Math.max(this.camTarget.x, 0), data.office.world.w);
    this.camTarget.y = Math.min(Math.max(this.camTarget.y, 0), data.office.world.h);
  }

  staticLayerKey(office: Office, departments: Department[]) {
    return JSON.stringify([
      office.rooms.map((r) => [r.id, r.x, r.y, r.w, r.h, r.floor, r.deptId, r.name]),
      office.corridors,
      office.doors,
      office.furniture.filter((f) => f.type === 'rug').map((f) => [f.id, f.x, f.y, f.w, f.h, f.color]),
      office.wall,
      office.world,
      departments.map((d) => [d.id, d.color]),
    ]);
  }

  buildStaticLayer() {
    if (!this.data) return;
    const { office, departments } = this.data;
    const c = document.createElement('canvas');
    c.width = Math.ceil(office.world.w * FLOOR_SCALE);
    c.height = Math.ceil(office.world.h * FLOOR_SCALE);
    const ctx = c.getContext('2d')!;
    ctx.scale(FLOOR_SCALE, FLOOR_SCALE);

    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, office.world.w, office.world.h);

    drawBuildingBase(ctx, office);

    // corridors are poured concrete; rooms have their own materials
    for (const cor of office.corridors) {
      paintFloor(ctx, { id: cor.id, name: '', x: cor.x, y: cor.y, w: cor.w, h: cor.h, floor: 'concrete', deptId: null });
    }
    for (const room of office.rooms) paintFloor(ctx, room);
    drawLightPools(ctx, office);

    // department accent strips along the top inner wall
    for (const room of office.rooms) {
      const dept = departments.find((d) => d.id === room.deptId);
      if (dept) {
        ctx.fillStyle = `${dept.color}33`;
        ctx.fillRect(room.x + office.wall, room.y + office.wall, room.w - office.wall * 2, 6);
        ctx.fillStyle = dept.color;
        ctx.fillRect(room.x + office.wall, room.y + office.wall, 46, 3);
      }
    }

    // rugs sit under everything else
    for (const f of office.furniture) if (f.type === 'rug') drawFurniture(ctx, f);

    drawWalls(ctx, office);
    drawWindows(ctx, office);
    drawDoorFrames(ctx, office);

    this.staticLayer = c;
  }

  /* --------------------------------- actors ------------------------------- */

  syncActors(prev: Snapshot | null, data: Snapshot) {
    const seen = new Set<string>();
    const office = data.office;
    for (const emp of data.employees) {
      seen.add(emp.id);
      const dept = data.departments.find((d) => d.id === emp.departmentId);
      const station = office.stations.find((s) => s.id === emp.stationId) || null;
      const geom = station ? stationGeom(station) : null;
      const meeting = data.meetings.find((m) => m.status === 'active' && m.participantIds.includes(emp.id));
      const seatIdx = meeting ? meeting.seatMap[emp.id] ?? 0 : -1;
      const meetingSeat = meeting ? office.meetingSeats[seatIdx] : undefined;

      let actor = this.actors.get(emp.id);
      if (!actor) {
        const spawn = geom ? geom.seat : { x: 790, y: 250 };
        actor = {
          id: emp.id,
          appearance: emp.appearance,
          name: emp.name,
          x: spawn.x,
          y: spawn.y,
          dir: 'down',
          pose: 'sit',
          frame: 0,
          frameT: 0,
          speed: 46,
          mode: 'desk',
          path: [],
          pathIndex: 0,
          seat: geom ? geom.seat : null,
          seatFacing: geom ? geom.facing : 'down',
          status: emp.status,
          departmentColor: dept?.color || '#7b8794',
          wanderTimer: 12 + Math.random() * 25,
          bubble: null,
          spawnT: this.time,
          opacity: 1,
        };
        this.actors.set(emp.id, actor);
      }

      const statusChanged = actor.status !== emp.status;
      actor.appearance = emp.appearance;
      actor.name = emp.name;
      actor.status = emp.status;
      actor.departmentColor = dept?.color || '#7b8794';
      actor.seat = geom ? geom.seat : null;
      actor.seatFacing = geom ? geom.facing : 'down';

      if (meetingSeat) {
        if (statusChanged || actor.mode !== 'meeting') {
          this.walkTo(actor, { x: meetingSeat.x, y: meetingSeat.y + 10 }, 'walk-to-meeting');
        }
      } else if (emp.status === 'working') {
        // A real task is in flight: be at the desk, whatever the character was doing.
        if (actor.mode !== 'desk' && actor.mode !== 'walk-to-desk') this.goToDesk(actor);
      } else if (emp.status === 'idle' || emp.status === 'simulated') {
        if (actor.mode === 'offline' || actor.mode === 'meeting' || actor.mode === 'walk-to-meeting') {
          this.goToDesk(actor);
        } else if (statusChanged && actor.seat &&
          (Math.abs(actor.x - actor.seat.x) > 24 || Math.abs(actor.y - actor.seat.y) > 24)) {
          this.goToDesk(actor);
        }
      } else if (emp.status === 'offline' || emp.status === 'disconnected') {
        actor.mode = 'offline';
        actor.path = [];
      }
    }

    for (const id of [...this.actors.keys()]) if (!seen.has(id)) this.actors.delete(id);
  }

  goToDesk(actor: Actor) {
    if (!actor.seat) {
      actor.mode = 'offline';
      return;
    }
    const here = { x: actor.x, y: actor.y };
    const target = { x: actor.seat.x, y: actor.seat.y };
    if (Math.hypot(here.x - target.x, here.y - target.y) < 8) {
      actor.mode = 'desk';
      actor.pose = 'sit';
      actor.path = [];
      return;
    }
    this.walkTo(actor, target, 'walk-to-desk');
  }

  walkTo(actor: Actor, target: { x: number; y: number }, mode: Mode) {
    if (!this.nav) return;
    const path = this.nav.findPath({ x: actor.x, y: actor.y }, target);
    actor.path = path.length ? path : [target];
    actor.pathIndex = 0;
    actor.mode = mode;
    actor.pose = 'walk';
  }

  notify(id: string, text: string, seconds = 7) {
    const a = this.actors.get(id);
    if (!a) return;
    a.bubble = { text: text.length > 90 ? `${text.slice(0, 88)}…` : text, until: this.time + seconds };
  }

  /* -------------------------------- updates ------------------------------- */

  update(dt: number) {
    if (!this.data) return;
    this.time += dt;
    const nav = this.nav;

    // camera easing
    const k = 1 - Math.pow(0.0015, dt);
    this.cam.x += (this.camTarget.x - this.cam.x) * k;
    this.cam.y += (this.camTarget.y - this.cam.y) * k;
    this.cam.zoom += (this.camTarget.zoom - this.cam.zoom) * k;
    if (Math.abs(this.cam.zoom - this.camTarget.zoom) < 0.0005) this.cam.zoom = this.camTarget.zoom;
    this.cb.onCamera?.({ ...this.cam });

    for (const actor of this.actors.values()) {
      actor.frameT += dt;
      if (actor.mode === 'walk-to-desk' || actor.mode === 'walk-to-meeting' || actor.mode === 'walk-to-wander') {
        this.stepAlongPath(actor, dt, nav);
      } else if (actor.mode === 'desk' || actor.mode === 'meeting') {
        actor.pose = actor.mode === 'meeting'
          ? 'meet'
          : actor.status === 'working' ? 'type' : 'sit';
        actor.dir = actor.mode === 'meeting' ? 'down' : actor.seatFacing;
        // idle agents occasionally stretch their legs (purely visual, never a task signal)
        if (actor.mode === 'desk' && actor.status !== 'working' && actor.status !== 'offline') {
          actor.wanderTimer -= dt;
          if (actor.wanderTimer <= 0) {
            actor.wanderTimer = 35 + Math.random() * 45;
            if (Math.random() < 0.4) this.wander(actor);
          }
        }
      } else if (actor.mode === 'wander') {
        actor.pose = Math.random() < 0.001 ? 'think' : 'idle';
        actor.wanderTimer -= dt;
        if (actor.wanderTimer <= 0) this.goToDesk(actor);
      }
      if (actor.mode === 'offline') actor.pose = 'idle';

      // animation frames
      if (actor.pose === 'walk' && actor.frameT > 0.16) {
        actor.frameT = 0;
        actor.frame = (actor.frame + 1) % 2;
      }
      if (actor.pose === 'type' && actor.frameT > 0.24) {
        actor.frameT = 0;
        actor.frame = (actor.frame + 1) % 2;
      }
      if (actor.bubble && this.time > actor.bubble.until) actor.bubble = null;
      const wantOpacity = this.selectedId === actor.id ? 1 : 1;
      actor.opacity += (wantOpacity - actor.opacity) * 0.2;
    }
  }

  stepAlongPath(actor: Actor, dt: number, nav: NavGrid | null) {
    if (!actor.path.length || actor.pathIndex >= actor.path.length) {
      this.arrive(actor);
      return;
    }
    const target = actor.path[actor.pathIndex];
    const dx = target.x - actor.x;
    const dy = target.y - actor.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2.5) {
      actor.x = target.x;
      actor.y = target.y;
      actor.pathIndex++;
      if (actor.pathIndex >= actor.path.length) this.arrive(actor);
      return;
    }
    const step = Math.min(dist, actor.speed * dt);
    actor.x += (dx / dist) * step;
    actor.y += (dy / dist) * step;
    actor.dir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up');
    actor.pose = 'walk';
    void nav;
  }

  arrive(actor: Actor) {
    actor.path = [];
    if (actor.mode === 'walk-to-meeting') {
      actor.mode = 'meeting';
      actor.pose = 'meet';
      return;
    }
    if (actor.mode === 'walk-to-wander') {
      actor.mode = 'wander';
      actor.wanderTimer = 6 + Math.random() * 8;
      actor.dir = 'down';
      return;
    }
    actor.mode = 'desk';
    actor.pose = 'sit';
    if (actor.seat) {
      actor.x = actor.seat.x;
      actor.y = actor.seat.y;
      actor.dir = actor.seatFacing;
    }
  }

  wander(actor: Actor) {
    if (!this.data || !this.nav) return;
    const spots = [
      ...this.data.office.loungeSpots,
      { x: 806, y: 250 },
      { x: 700, y: 380 },
      { x: 1200, y: 860 },
    ];
    const spot = spots[Math.floor(Math.random() * spots.length)];
    const nav = this.nav.nearestFree(spot.x, spot.y + 18);
    if (!nav) return;
    this.walkTo(actor, nav, 'walk-to-wander');
  }

  /* -------------------------------- camera -------------------------------- */

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(320, rect.width);
    this.height = Math.max(240, rect.height);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }

  screenToWorld(sx: number, sy: number) {
    return {
      x: (sx - this.width / 2) / this.cam.zoom + this.cam.x,
      y: (sy - this.height / 2) / this.cam.zoom + this.cam.y,
    };
  }

  worldToScreen(wx: number, wy: number) {
    return {
      x: (wx - this.cam.x) * this.cam.zoom + this.width / 2,
      y: (wy - this.cam.y) * this.cam.zoom + this.height / 2,
    };
  }

  fitToOffice(animate = true) {
    if (!this.data) return;
    const { world } = this.data.office;
    const zoom = Math.min(this.width / (world.w + 80), this.height / (world.h + 80));
    this.setCamera({ x: world.w / 2, y: world.h / 2, zoom: Math.max(0.18, Math.min(zoom, 1.4)) }, animate);
  }

  setCamera(cam: Camera, animate = true) {
    this.camTarget = { ...cam };
    if (!animate) this.cam = { ...cam };
  }

  zoomAt(factor: number, sx?: number, sy?: number) {
    const before = sx !== undefined && sy !== undefined ? this.screenToWorld(sx, sy) : null;
    const zoom = Math.max(0.22, Math.min(2.4, this.camTarget.zoom * factor));
    if (before) {
      const cam = { x: this.camTarget.x, y: this.camTarget.y, zoom };
      const after = {
        x: (sx! - this.width / 2) / zoom + cam.x,
        y: (sy! - this.height / 2) / zoom + cam.y,
      };
      cam.x += before.x - after.x;
      cam.y += before.y - after.y;
      this.setCamera(cam, true);
    } else {
      this.setCamera({ ...this.camTarget, zoom }, true);
    }
  }

  focusEmployee(id: string) {
    const a = this.actors.get(id);
    if (!a) return;
    this.setCamera({ x: a.x, y: a.y - 10, zoom: Math.max(this.camTarget.zoom, 1.15) }, true);
  }

  focusRoom(id: string) {
    if (!this.data) return;
    const room = roomById(this.data.office, id);
    if (!room) return;
    const c = roomCenter(room);
    const zoom = Math.min(this.width / (room.w + 120), this.height / (room.h + 120));
    this.setCamera({ x: c.x, y: c.y, zoom: Math.max(0.3, Math.min(zoom, 1.6)) }, true);
  }

  focusDepartment(deptId: string) {
    if (!this.data) return;
    const rooms = this.data.office.rooms.filter((r) => r.deptId === deptId);
    if (!rooms.length) return;
    const minX = Math.min(...rooms.map((r) => r.x));
    const minY = Math.min(...rooms.map((r) => r.y));
    const maxX = Math.max(...rooms.map((r) => r.x + r.w));
    const maxY = Math.max(...rooms.map((r) => r.y + r.h));
    const zoom = Math.min(this.width / (maxX - minX + 120), this.height / (maxY - minY + 120));
    this.setCamera({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, zoom: Math.max(0.3, Math.min(zoom, 1.6)) }, true);
  }

  panBy(dx: number, dy: number) {
    this.camTarget = { ...this.camTarget, x: this.camTarget.x + dx, y: this.camTarget.y + dy };
    this.cam.x += dx;
    this.cam.y += dy;
  }

  /* ------------------------------ interaction ----------------------------- */

  hitTest(wx: number, wy: number) {
    const actors = [...this.actors.values()].sort((a, b) => b.y - a.y);
    for (const a of actors) {
      if (wx > a.x - 22 && wx < a.x + 22 && wy > a.y - 72 && wy < a.y + 10) return { kind: 'employee' as const, id: a.id };
    }
    if (this.data) {
      const stations = this.data.office.stations;
      for (const st of stations) {
        const g = stationGeom(st);
        if (wx >= g.desk.x && wx <= g.desk.x + g.desk.w && wy >= g.desk.y && wy <= g.desk.y + g.desk.h) {
          return { kind: 'station' as const, id: st.id };
        }
      }
      for (const f of [...this.data.office.furniture].reverse()) {
        if (f.type === 'rug') continue;
        const size = furnitureSize(f);
        if (wx >= f.x && wx <= f.x + size.w && wy >= f.y && wy <= f.y + size.h) {
          return { kind: 'furniture' as const, id: f.id };
        }
      }
      const room = roomAt(this.data.office, wx, wy);
      if (room) return { kind: 'room' as const, id: room.id };
    }
    return null;
  }

  bindEvents() {
    const canvas = this.canvas;
    const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    canvas.addEventListener('pointerdown', (e) => {
      const p = local(e);
      canvas.setPointerCapture(e.pointerId);
      this.dragging = {
        mode: 'pan',
        startX: p.x,
        startY: p.y,
        camX: this.camTarget.x,
        camY: this.camTarget.y,
        moved: false,
      };
      if (this.editor) {
        const world = this.screenToWorld(p.x, p.y);
        const hit = this.hitTest(world.x, world.y);
        if (hit && hit.kind !== 'employee') {
          this.dragging.mode = 'entity';
          this.dragging.entity = {
            kind: hit.kind,
            id: hit.id,
            offsetX: world.x,
            offsetY: world.y,
            original: JSON.parse(JSON.stringify(this.data!.office)),
          };
          this.editorSelection = { kind: hit.kind, id: hit.id };
          this.cb.onSelectEntity?.(this.editorSelection);
        }
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const p = local(e);
      const world = this.screenToWorld(p.x, p.y);
      if (this.dragging) {
        const dx = p.x - this.dragging.startX;
        const dy = p.y - this.dragging.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragging.moved = true;
        if (this.dragging.mode === 'pan') {
          this.cam.x = this.dragging.camX - dx / this.cam.zoom;
          this.cam.y = this.dragging.camY - dy / this.cam.zoom;
          this.camTarget.x = this.cam.x;
          this.camTarget.y = this.cam.y;
        } else if (this.dragging.mode === 'entity' && this.dragging.entity && this.data) {
          const ent = this.dragging.entity;
          const snap = (v: number) => Math.round(v / 5) * 5;
          const ddx = snap(world.x - ent.offsetX);
          const ddy = snap(world.y - ent.offsetY);
          const office = this.data.office;
          if (ent.kind === 'furniture') {
            const f = office.furniture.find((x) => x.id === ent.id);
            if (f) { f.x = snap(f.x + ddx); f.y = snap(f.y + ddy); }
            ent.offsetX = world.x; ent.offsetY = world.y;
            this.cb.onLayoutEdited?.(office, 'move-furniture');
          } else if (ent.kind === 'station') {
            const st = office.stations.find((x) => x.id === ent.id);
            if (st) {
              st.x = snap(st.x + ddx);
              st.y = snap(st.y + ddy);
            }
            ent.offsetX = world.x; ent.offsetY = world.y;
            this.cb.onLayoutEdited?.(office, 'move-station');
          } else if (ent.kind === 'room') {
            const room = office.rooms.find((r) => r.id === ent.id);
            if (room) {
              const orig = ent.original;
              const oRoom = orig.rooms.find((r) => r.id === ent.id)!;
              const deltaX = snap(room.x + ddx - oRoom.x) - (room.x - oRoom.x);
              const deltaY = snap(room.y + ddy - oRoom.y) - (room.y - oRoom.y);
              const shift = (r: { x: number; y: number }) => { r.x += deltaX; r.y += deltaY; };
              shift(room);
              orig.furniture.filter((f) => this.pointInRoom(oRoom, f.x, f.y)).forEach((f) => {
                const live = office.furniture.find((x) => x.id === f.id);
                if (live) shift(live);
              });
              orig.stations.filter((s) => s.roomId === room.id).forEach((s) => {
                const live = office.stations.find((x) => x.id === s.id);
                if (live) shift(live);
              });
              orig.doors.filter((d) => d.roomId === room.id).forEach((d) => {
                const live = office.doors.find((x) => x.id === d.id);
                if (live) shift(live);
              });
              // keep the actor sitting in this room in sync
              for (const a of this.actors.values()) {
                a.x += deltaX; a.y += deltaY;
                if (a.seat) a.seat = { x: a.seat.x + deltaX, y: a.seat.y + deltaY };
              }
            }
            ent.offsetX = world.x; ent.offsetY = world.y;
            ent.original = JSON.parse(JSON.stringify(office));
            this.cb.onLayoutEdited?.(office, 'move-room');
          }
          this.nav = getNav(office);
        }
        return;
      }
      const hit = this.hitTest(world.x, world.y);
      const id = hit && hit.kind === 'employee' ? hit.id : null;
      if (id !== this.hoverId) {
        this.hoverId = id;
        this.cb.onHover?.(id);
      }
      canvas.style.cursor = id ? 'pointer' : this.editor ? 'grab' : 'default';
    });

    canvas.addEventListener('pointerup', (e) => {
      const p = local(e);
      const drag = this.dragging;
      this.dragging = null;
      if (!drag) return;
      if (drag.moved) {
        if (drag.mode === 'entity') this.emitLayoutCommit();
        return;
      }
      const world = this.screenToWorld(p.x, p.y);
      const hit = this.hitTest(world.x, world.y);
      if (!hit) {
        if (this.editor) {
          this.editorSelection = null;
          this.cb.onSelectEntity?.(null);
        }
        return;
      }
      if (hit.kind === 'employee') {
        this.selectedId = hit.id;
        this.cb.onSelectEmployee?.(hit.id);
      } else if (hit.kind === 'station') {
        const st = this.data?.office.stations.find((s) => s.id === hit.id);
        if (st?.employeeId && !this.editor) this.cb.onSelectEmployee?.(st.employeeId);
        else if (this.editor) {
          this.editorSelection = { kind: 'station', id: hit.id };
          this.cb.onSelectEntity?.(this.editorSelection);
        }
      } else if (this.editor) {
        this.editorSelection = { kind: hit.kind as 'furniture' | 'room', id: hit.id };
        this.cb.onSelectEntity?.(this.editorSelection);
      } else if (hit.kind === 'room') {
        const room = this.data?.office.rooms.find((r) => r.id === hit.id);
        if (room?.deptId) this.focusDepartment(room.deptId);
      }
    });

    canvas.addEventListener('dblclick', (e) => {
      const r = canvas.getBoundingClientRect();
      const world = this.screenToWorld(e.clientX - r.left, e.clientY - r.top);
      const hit = this.hitTest(world.x, world.y);
      if (hit?.kind === 'employee') {
        this.selectedId = hit.id;
        this.cb.onDoubleClickEmployee?.(hit.id);
      }
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      this.zoomAt(factor, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  emitLayoutCommit() {
    if (!this.data) return;
    this.staticKey = this.staticLayerKey(this.data.office, this.data.departments);
    this.buildStaticLayer();
    this.cb.onLayoutEdited?.(this.data.office, 'commit');
  }

  pointInRoom(room: { x: number; y: number; w: number; h: number }, x: number, y: number) {
    return x >= room.x && x <= room.x + room.w && y >= room.y && y <= room.y + room.h;
  }

  /* -------------------------------- render -------------------------------- */

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      this.update(dt);
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  destroy() {
    this.stop();
  }

  drawables(): { y: number; draw: (ctx: CanvasRenderingContext2D) => void }[] {
    const out: { y: number; draw: (ctx: CanvasRenderingContext2D) => void }[] = [];
    if (!this.data) return out;
    const office = this.data.office;

    for (const f of office.furniture) {
      if (f.type === 'rug') continue;
      out.push({ y: f.y + (f.h || 30), draw: (ctx) => drawFurniture(ctx, f) });
    }

    for (const st of office.stations) {
      const g = stationGeom(st);
      out.push({
        y: g.seat.y + 10,
        draw: (ctx) => drawChair(ctx, g.seat.x, g.seat.y + 8, st.style === 'exec' ? 'exec' : 'std', g.facing),
      });
      out.push({ y: g.desk.y + g.desk.h, draw: (ctx) => drawStationDesk(ctx, st) });
    }

    // meeting chairs always exist; sitting characters sort in front of them
    office.meetingSeats.forEach((seat) => {
      out.push({
        y: seat.y + 4,
        draw: (ctx) => drawChair(ctx, seat.x, seat.y + 10, 'std', (seat.facing as DirKey) || 'down'),
      });
    });
    // lounge seating actors can occupy
    for (const spot of office.loungeSpots) {
      out.push({ y: spot.y + 4, draw: (ctx) => drawChair(ctx, spot.x, spot.y + 10, 'std', 'down') });
    }

    for (const a of this.actors.values()) {
      const sel = this.selectedId === a.id;
      out.push({
        y: a.y,
        draw: (ctx) => {
          if (sel) {
            const pulse = 0.55 + Math.sin(this.time * 3) * 0.2;
            ctx.save();
            ctx.strokeStyle = `rgba(255,215,120,${pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(a.x, a.y + 2, 22, 9, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          drawCharacterShadow(ctx, a.x, a.y);
          blitCharacter(ctx, a.appearance, a.pose, a.dir, a.frame, a.x, a.y, a.mode === 'offline' ? 0.72 : 1);
        },
      });
    }
    return out.sort((p, q) => p.y - q.y);
  }

  render() {
    const ctx = this.ctx;
    const { width, height, dpr, cam } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PALETTE.void;
    ctx.fillRect(0, 0, width, height);
    if (!this.data) return;

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    if (this.staticLayer) {
      ctx.drawImage(this.staticLayer, 0, 0, this.staticLayer.width, this.staticLayer.height,
        0, 0, this.data.office.world.w, this.data.office.world.h);
    }

    // workstation activity: monitor glow + progress bar
    for (const emp of this.data.employees) {
      if (!emp.stationId) continue;
      const st = this.data.office.stations.find((s) => s.id === emp.stationId);
      if (!st) continue;
      const color = STATUS_COLOR[emp.status] || '#8a93a0';
      if (emp.status === 'working') {
        drawMonitorGlow(ctx, st, 'rgba(87,224,255,0.9)', 0.8 + Math.sin(this.time * 4) * 0.2);
        // activity bar above the monitor
        const g = stationGeom(st);
        const bx = g.desk.x + g.desk.w / 2 - 18;
        const by = g.desk.y + g.desk.h - 4;
        ctx.fillStyle = 'rgba(8,14,20,0.75)';
        roundRect(ctx, bx, by, 36, 5, 2.5);
        ctx.fill();
        const w = 12 + Math.abs(Math.sin(this.time * 2)) * 24;
        ctx.fillStyle = color;
        roundRect(ctx, bx + 1, by + 1, w, 3, 1.5);
        ctx.fill();
      } else if (emp.status === 'meeting') {
        drawMonitorGlow(ctx, st, 'rgba(201,162,39,0.35)', 0.3);
      }
    }

    const visible = (x: number, y: number, pad = 90) => {
      const left = cam.x - width / (2 * cam.zoom) - pad;
      const right = cam.x + width / (2 * cam.zoom) + pad;
      const top = cam.y - height / (2 * cam.zoom) - pad;
      const bottom = cam.y + height / (2 * cam.zoom) + pad;
      return x > left && x < right && y > top && y < bottom;
    };

    for (const d of this.drawables()) {
      if (visible(cam.x, d.y, 200)) d.draw(ctx);
    }

    // Labels sit above the furniture so they stay readable.
    drawRoomLabels(ctx, this.data.office, this.data.departments);

    if (this.editor && this.editorSelection) this.renderEditorHighlight(ctx);

    ctx.restore();

    this.renderOverlay();
  }

  renderEditorHighlight(ctx: CanvasRenderingContext2D) {
    if (!this.data || !this.editorSelection) return;
    const sel = this.editorSelection;
    ctx.save();
    ctx.strokeStyle = '#6fd3ff';
    ctx.lineWidth = 1.5 / this.cam.zoom;
    ctx.setLineDash([6 / this.cam.zoom, 4 / this.cam.zoom]);
    if (sel.kind === 'furniture') {
      const f = this.data.office.furniture.find((x) => x.id === sel.id);
      if (f) ctx.strokeRect(f.x, f.y, f.w || 60, f.h || 40);
    } else if (sel.kind === 'station') {
      const s = this.data.office.stations.find((x) => x.id === sel.id);
      if (s) {
        const g = stationGeom(s);
        ctx.strokeRect(g.desk.x, g.desk.y, g.desk.w, g.desk.h);
        ctx.strokeRect(g.seat.x - 16, g.seat.y - 14, 32, 28);
      }
    } else {
      const r = this.data.office.rooms.find((x) => x.id === sel.id);
      if (r) ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();
  }

  /** Screen-space pass: labels, badges, bubbles, sunlight and vignette. */
  renderOverlay() {
    if (!this.data) return;
    const ctx = this.ctx;
    const { width, height, cam } = this;

    for (const a of this.actors.values()) {
      const s = this.worldToScreen(a.x, a.y);
      if (s.x < -80 || s.x > width + 80 || s.y < -80 || s.y > height + 80) continue;
      const isHover = this.hoverId === a.id;
      const isSelected = this.selectedId === a.id;
      const color = STATUS_COLOR[a.mode === 'offline' ? 'offline' : a.status] || '#8a93a0';

      if (cam.zoom > 0.42 || isSelected || isHover) {
        const headY = s.y - 74 * cam.zoom;
        drawStatusBadge(ctx, s.x + 19 * cam.zoom, headY, a.mode === 'offline' ? 'offline' : a.status, color, this.time);
      }
      if (isHover || isSelected) {
        drawNameTag(ctx, s.x, s.y - 82 * cam.zoom, `${a.name} · ${a.status}`, color);
      }
      if (a.bubble) {
        this.drawBubble(ctx, s.x, s.y - 92 * cam.zoom, a.bubble.text, color);
      }
    }

    // soft daylight + vignette
    const g = ctx.createLinearGradient(0, 0, width * 0.6, height);
    g.addColorStop(0, 'rgba(140,190,255,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);

    const vg = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.35, width / 2, height / 2, Math.max(width, height) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, width, height);
  }

  drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
    ctx.save();
    ctx.font = '500 11px ui-sans-serif, system-ui, sans-serif';
    const maxW = 180;
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW) {
        if (line) lines.push(line);
        line = w;
      } else line = test;
    }
    if (line) lines.push(line);
    const lh = 14;
    const w = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + 18;
    const h = lines.length * lh + 12;
    const bx = Math.min(Math.max(8, x - w / 2), this.width - w - 8);
    const by = Math.max(8, y - h);
    ctx.fillStyle = 'rgba(12,17,24,0.94)';
    roundRect(ctx, bx, by, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = `${color}88`;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, by + h);
    ctx.lineTo(x, by + h + 6);
    ctx.lineTo(x + 5, by + h);
    ctx.closePath();
    ctx.fillStyle = 'rgba(12,17,24,0.94)';
    ctx.fill();
    ctx.fillStyle = '#dfe7f1';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + 9, by + 7 + i * lh));
    ctx.restore();
  }

  /* -------------------------------- minimap ------------------------------- */

  drawMinimap(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx || !this.data) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || 220;
    const h = canvas.clientHeight || 150;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const world = this.data.office.world;
    const scale = Math.min(w / world.w, h / world.h) * 0.94;
    const ox = (w - world.w * scale) / 2;
    const oy = (h - world.h * scale) / 2;
    ctx.fillStyle = 'rgba(10,14,20,0.9)';
    ctx.fillRect(0, 0, w, h);

    for (const cor of this.data.office.corridors) {
      ctx.fillStyle = '#1c2330';
      ctx.fillRect(ox + cor.x * scale, oy + cor.y * scale, cor.w * scale, cor.h * scale);
    }
    for (const room of this.data.office.rooms) {
      const dept = this.data.departments.find((d) => d.id === room.deptId);
      ctx.fillStyle = dept ? `${dept.color}55` : 'rgba(120,140,170,0.2)';
      ctx.fillRect(ox + room.x * scale, oy + room.y * scale, room.w * scale, room.h * scale);
      ctx.strokeStyle = dept ? `${dept.color}aa` : 'rgba(160,180,210,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + room.x * scale + 0.5, oy + room.y * scale + 0.5, room.w * scale - 1, room.h * scale - 1);
    }
    for (const a of this.actors.values()) {
      const color = STATUS_COLOR[a.status] || '#8a93a0';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(ox + a.x * scale, oy + a.y * scale, this.selectedId === a.id ? 3 : 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // viewport rect
    const vw = this.width / this.cam.zoom;
    const vh = this.height / this.cam.zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      ox + (this.cam.x - vw / 2) * scale,
      oy + (this.cam.y - vh / 2) * scale,
      vw * scale,
      vh * scale,
    );
  }

  /* ------------------------------ editor helpers -------------------------- */

  addFurniture(type: string) {
    if (!this.data) return null;
    const center = this.screenToWorld(this.width / 2, this.height / 2);
    const room = roomAt(this.data.office, center.x, center.y) || this.data.office.rooms[0];
    const item: FurnitureItem = {
      id: `f-${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      x: Math.round(room.x + room.w / 2),
      y: Math.round(room.y + room.h / 2),
      solid: type !== 'rug' && type !== 'coffeeTable',
    };
    this.data.office.furniture.push(item);
    this.editorSelection = { kind: 'furniture', id: item.id };
    this.cb.onSelectEntity?.(this.editorSelection);
    this.emitLayoutCommit();
    return item;
  }

  removeSelectedEntity() {
    if (!this.data || !this.editorSelection) return;
    const sel = this.editorSelection;
    const office = this.data.office;
    if (sel.kind === 'furniture') {
      office.furniture = office.furniture.filter((f) => f.id !== sel.id);
    } else if (sel.kind === 'station') {
      this.data.employees.forEach((e) => { if (e.stationId === sel.id) e.stationId = null; });
      office.stations = office.stations.filter((s) => s.id !== sel.id);
    }
    this.editorSelection = null;
    this.cb.onSelectEntity?.(null);
    this.emitLayoutCommit();
  }

  addStation() {
    if (!this.data) return;
    const center = this.screenToWorld(this.width / 2, this.height / 2);
    const room = roomAt(this.data.office, center.x, center.y) || this.data.office.rooms[0];
    const st: Station = {
      id: `st-${Math.random().toString(36).slice(2, 8)}`,
      roomId: room.id,
      x: Math.round(room.x + room.w / 2 - 62),
      y: Math.round(room.y + room.h / 2),
      orientation: 'up',
      desk: { w: 124, h: 56 },
      employeeId: null,
    };
    this.data.office.stations.push(st);
    this.editorSelection = { kind: 'station', id: st.id };
    this.cb.onSelectEntity?.(this.editorSelection);
    this.emitLayoutCommit();
  }

  /**
   * Adds a room in a new band under the building, extends the world and the
   * vertical corridors so the new wing is connected to the rest of the office.
   */
  addRoom(name: string, deptId: string | null) {
    if (!this.data) return;
    const office = this.data.office;
    const wall = office.wall;
    const bottom = Math.max(...office.rooms.map((r) => r.y + r.h));
    const corridorY = bottom;
    const roomY = corridorY + 80;
    const roomH = 260;
    const roomW = 420;

    office.world.h = roomY + roomH + 40;
    office.corridors.push({
      id: `cor-${Math.random().toString(36).slice(2, 7)}`,
      x: 24, y: corridorY, w: office.world.w - 48, h: 80,
    });
    // stretch the two edge corridors down to the new band
    for (const cor of office.corridors) {
      if (cor.h > cor.w && cor.y <= 340) cor.h = corridorY + 80 - cor.y;
    }

    const room = {
      id: `room-${Math.random().toString(36).slice(2, 8)}`,
      name,
      x: 80,
      y: roomY,
      w: roomW,
      h: roomH,
      floor: 'carpet' as const,
      deptId,
      kind: 'office',
    };
    office.rooms.push(room);
    office.doors.push({
      id: `door-${room.id}-n`,
      roomId: room.id,
      x: room.x + room.w / 2 - 46,
      y: room.y - 3,
      w: 92,
      h: 20,
      orientation: 'h',
    });
    void wall;
    this.nav = getNav(office);
    this.staticKey = this.staticLayerKey(office, this.data.departments);
    this.buildStaticLayer();
    this.fitToOffice(true);
    this.editorSelection = { kind: 'room', id: room.id };
    this.cb.onSelectEntity?.(this.editorSelection);
    this.emitLayoutCommit();
  }

  updateRoom(id: string, patch: Partial<{ x: number; y: number; w: number; h: number; name: string; deptId: string | null }>) {
    if (!this.data) return;
    const room = this.data.office.rooms.find((r) => r.id === id);
    if (!room) return;
    if (patch.w !== undefined) room.w = Math.max(180, patch.w);
    if (patch.h !== undefined) room.h = Math.max(160, patch.h);
    if (patch.x !== undefined) room.x = Math.max(10, patch.x);
    if (patch.y !== undefined) room.y = Math.max(10, patch.y);
    if (patch.name !== undefined) room.name = patch.name;
    if (patch.deptId !== undefined) room.deptId = patch.deptId;
    // keep the door on the north/south edge it belongs to
    for (const d of this.data.office.doors.filter((x) => x.roomId === id)) {
      if (d.orientation === 'h') {
        d.x = room.x + room.w / 2 - d.w / 2;
        d.y = d.id.endsWith('-s') ? room.y + room.h - d.h + 3 : room.y - 3;
      }
    }
    this.data.office.stations.forEach((s) => { if (s.roomId === id) s.y = Math.min(s.y, room.y + room.h - 70); });
    this.staticKey = this.staticLayerKey(this.data.office, this.data.departments);
    this.buildStaticLayer();
    this.emitLayoutCommit();
  }

  /* ------------------------------- helpers -------------------------------- */

  employeeTask(empId: string): Task | null {
    return this.data?.tasks.find((t) => t.employeeId === empId && t.status === 'running') || null;
  }

  activeMeetingFor(empId: string): Meeting | null {
    return this.data?.meetings.find((m) => m.status === 'active' && m.participantIds.includes(empId)) || null;
  }

  setSelected(id: string | null) {
    this.selectedId = id;
  }

  setEditor(on: boolean) {
    this.editor = on;
    if (!on) {
      this.editorSelection = null;
      this.cb.onSelectEntity?.(null);
    }
  }

  /** Used by the editor panel to nudge the selected entity by keyboard. */
  nudge(dx: number, dy: number) {
    if (!this.data || !this.editorSelection) return;
    const sel = this.editorSelection;
    const office = this.data.office;
    if (sel.kind === 'furniture') {
      const f = office.furniture.find((x) => x.id === sel.id);
      if (f) { f.x += dx; f.y += dy; }
    } else if (sel.kind === 'station') {
      const s = office.stations.find((x) => x.id === sel.id);
      if (s) {
        s.x += dx;
        s.y += dy;
        for (const a of this.actors.values()) {
          const emp = this.data.employees.find((e) => e.stationId === s.id);
          if (emp && a.id === emp.id) {
            const g = stationGeom(s);
            a.seat = g.seat;
            a.x = g.seat.x;
            a.y = g.seat.y;
          }
        }
      }
    } else {
      const r = office.rooms.find((x) => x.id === sel.id);
      if (r) {
        r.x += dx;
        r.y += dy;
        office.stations.filter((s) => s.roomId === r.id).forEach((s) => { s.x += dx; s.y += dy; });
        for (const a of this.actors.values()) {
          const emp = this.data.employees.find((e) => e.stationId === office.stations.find((s) => s.roomId === r.id && s.employeeId === e.id)?.id);
          void emp;
        }
      }
    }
    this.emitLayoutCommit();
  }

  getCellSize() {
    return CELL;
  }
}
