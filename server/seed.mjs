/**
 * Default company + office floorplan seed.
 *
 * The office is stored as plain data (rooms, doors, furniture, stations) so that
 * the renderer, the pathfinder and the layout editor all share one source of truth.
 * Every room is authored on a 1800x1240 world, with two horizontal corridors
 * linking the three building bands.
 */

export const WORLD = { w: 1800, h: 1320 };
export const WALL = 14;

const R = (id, name, x, y, w, h, floor, deptId = null, kind = 'office') => ({
  id, name, x, y, w, h, floor, deptId, kind,
});

export const DEPARTMENTS = [
  { id: 'exec', name: 'Executive', color: '#c9a227', icon: 'crown', managerId: null, description: 'Company leadership, strategy and final sign-off.' },
  { id: 'dev', name: 'Software Development', color: '#3f8efc', icon: 'code', managerId: null, description: 'Builds and maintains the company products.' },
  { id: 'marketing', name: 'Marketing', color: '#f2655a', icon: 'megaphone', managerId: null, description: 'Brand, growth, campaigns and communications.' },
  { id: 'research', name: 'Research & Analysis', color: '#9b6bf2', icon: 'flask', managerId: null, description: 'Deep research, competitive and market analysis.' },
  { id: 'admin', name: 'Administration', color: '#4fb286', icon: 'clipboard', managerId: null, description: 'Processes, documentation and coordination.' },
  { id: 'data', name: 'Data Management', color: '#37b6c9', icon: 'database', managerId: null, description: 'Data pipelines, metrics and reporting.' },
  { id: 'creative', name: 'Creative', color: '#f2994a', icon: 'palette', managerId: null, description: 'Design, copywriting and visual identity.' },
  { id: 'ops', name: 'General Operations', color: '#7b8794', icon: 'gear', managerId: null, description: 'Facilities, tooling and day-to-day operations.' },
];

const ROOMS = [
  R('room-ceo', 'CEO Office', 40, 40, 480, 300, 'wood', 'exec', 'ceo'),
  R('room-reception', 'Reception', 560, 40, 360, 300, 'tile', 'ops', 'reception'),
  R('room-meeting', 'Meeting Room', 960, 40, 460, 300, 'wood', null, 'meeting'),
  R('room-lounge', 'Lounge', 1460, 40, 300, 300, 'carpet', 'ops', 'lounge'),
  R('room-dev', 'Software Development', 40, 420, 580, 400, 'carpet', 'dev'),
  R('room-data', 'Data Management', 660, 420, 420, 400, 'carpet', 'data'),
  R('room-research', 'Research & Analysis', 1120, 420, 640, 400, 'carpet', 'research'),
  R('room-marketing', 'Marketing', 40, 900, 440, 380, 'carpet', 'marketing'),
  R('room-admin', 'Administration', 520, 900, 360, 380, 'carpet', 'admin'),
  R('room-creative', 'Creative', 920, 900, 380, 380, 'carpet', 'creative'),
  R('room-ops', 'General Operations', 1340, 900, 420, 380, 'carpet', 'ops'),
];

const CORRIDORS = [
  { id: 'cor-1', x: 24, y: 340, w: 1752, h: 80 },
  { id: 'cor-2', x: 24, y: 820, w: 1752, h: 80 },
  { id: 'cor-3', x: 1660, y: 340, w: 80, h: 560 },
  { id: 'cor-4', x: 24, y: 340, w: 80, h: 560 },
];

const DOOR_H = WALL + 6;

/** door on the north wall of a room */
const doorN = (room, offset = 0, w = 92) => ({
  id: `door-${room.id}-n`,
  roomId: room.id,
  x: room.x + room.w / 2 - w / 2 + offset,
  y: room.y - 3,
  w,
  h: DOOR_H,
  orientation: 'h',
});
/** door on the south wall */
const doorS = (room, offset = 0, w = 92) => ({
  id: `door-${room.id}-s`,
  roomId: room.id,
  x: room.x + room.w / 2 - w / 2 + offset,
  y: room.y + room.h - DOOR_H + 3,
  w,
  h: DOOR_H,
  orientation: 'h',
});

const DOORS = [
  doorS(ROOMS[0], 120),
  doorS(ROOMS[1], -80),
  doorS(ROOMS[2]),
  doorS(ROOMS[3], 0, 88),
  doorN(ROOMS[4]), doorS(ROOMS[4], -180),
  doorN(ROOMS[5]), doorS(ROOMS[5], 110),
  doorN(ROOMS[6]), doorS(ROOMS[6], -210),
  doorN(ROOMS[7], -110),
  doorN(ROOMS[8], 90),
  doorN(ROOMS[9], 0),
  doorN(ROOMS[10], -120),
];

let fseq = 0;
const F = (type, x, y, opts = {}) => ({
  id: opts.id || `f-${type}-${++fseq}`,
  type, x, y,
  rotation: opts.rotation || 0,
  solid: opts.solid !== false,
  ...opts,
});

/** Decorative + functional furniture. Sizes live in the client renderer. */
function furniture() {
  const out = [];
  // --- Reception
  out.push(F('receptionDesk', 620, 150, { solid: true }));
  out.push(F('sofa', 596, 250));
  out.push(F('coffeeTable', 760, 258, { solid: false }));
  out.push(F('plant', 700, 60));
  out.push(F('plant', 848, 62));
  out.push(F('waterCooler', 850, 250));
  out.push(F('rug', 700, 232, { solid: false, w: 220, h: 92, color: 'rgba(74,84,104,0.4)' }));

  // --- CEO office (overview screen, executive desk, 2 exec workstations)
  out.push(F('execDesk', 210, 180));
  out.push(F('monitorWall', 210, 58));
  out.push(F('bookshelf', 330, 60));
  out.push(F('bookshelf', 340, 104));
  out.push(F('cabinet', 60, 282));
  out.push(F('coffeeTable', 400, 196, { solid: false }));
  out.push(F('plant', 452, 282));
  out.push(F('rug', 176, 138, { solid: false, w: 258, h: 176, color: 'rgba(96,66,44,0.5)' }));

  // --- Meeting room
  out.push(F('meetingTable', 1010, 120, { w: 260, h: 120 }));
  out.push(F('screen', 1060, 58));
  out.push(F('whiteboard', 1250, 58));
  out.push(F('plant', 980, 290));
  out.push(F('plant', 1370, 288));

  // --- Lounge
  out.push(F('sofa', 1490, 94));
  out.push(F('sofa', 1490, 210));
  out.push(F('coffeeTable', 1650, 146, { solid: false }));
  out.push(F('plant', 1700, 60));
  out.push(F('vendingMachine', 1688, 250));
  out.push(F('rug', 1482, 108, { solid: false, w: 236, h: 150, color: 'rgba(54,68,92,0.5)' }));

  // --- Department extras
  const room = (id) => ROOMS.find((r) => r.id === id);
  ['room-dev', 'room-data', 'room-research', 'room-marketing', 'room-admin', 'room-creative', 'room-ops'].forEach((id) => {
    const r = room(id);
    out.push(F('plant', r.x + r.w - 52, r.y + r.h - 52));
  });
  out.push(F('plant', 556, 440));
  out.push(F('whiteboard', 300, 432));
  out.push(F('whiteboard', 700, 432));
  out.push(F('whiteboard', 1200, 432));
  out.push(F('serverRack', 1000, 700));
  out.push(F('serverRack', 1000, 600));
  out.push(F('serverRack', 1000, 500));
  out.push(F('printer', 420, 1232));
  out.push(F('cabinet', 730, 1240));
  out.push(F('bookshelf', 1090, 1238));
  out.push(F('coffeeMachine', 1440, 1240));
  out.push(F('waterCooler', 302, 858));
  out.push(F('cabinet', 1180, 1230));
  out.push(F('plant', 860, 858));
  out.push(F('plant', 1740, 858));
  out.push(F('printer', 800, 1220));
  return out;
}

const STATION_DESK = { w: 124, h: 56 };
let sseq = 0;
/** x,y = desk top-left. 'up' => employee sits north of desk. */
const ST = (roomId, x, y, orientation = 'up') => ({
  id: `st-${++sseq}`,
  roomId, x, y, orientation,
  desk: { ...STATION_DESK },
  employeeId: null,
});

function stations() {
  const out = [];
  // Desk rows sit low enough that a seated character's head clears the top wall
  // (a seated sprite reaches ~67px above its seat, and the seat is 16px above
  // the desk), so the first row starts at least 100px below the room's top.
  // Software Development: 3 x 2
  [520, 694].forEach((y) => [80, 250, 420].forEach((x) => out.push(ST('room-dev', x, y, 'up'))));
  // Data Management: 2 x 2
  [520, 694].forEach((y) => [700, 872].forEach((x) => out.push(ST('room-data', x, y, 'up'))));
  // Research & Analysis: 3 x 2
  [520, 694].forEach((y) => [1164, 1334, 1504].forEach((x) => out.push(ST('room-research', x, y, 'up'))));
  // Marketing: 2 x 2
  [1000, 1160].forEach((y) => [80, 250].forEach((x) => out.push(ST('room-marketing', x, y, 'up'))));
  // Administration: 2 x 2
  [1000, 1160].forEach((y) => [560, 730].forEach((x) => out.push(ST('room-admin', x, y, 'up'))));
  // Creative: 2 x 2
  [1000, 1160].forEach((y) => [960, 1130].forEach((x) => out.push(ST('room-creative', x, y, 'up'))));
  // General Operations: 2 + 1
  [1380, 1550].forEach((x) => out.push(ST('room-ops', x, 1000, 'up')));
  out.push(ST('room-ops', 1450, 1160, 'up'));
  // Executive suite: 2 executive workstations
  [96, 196].forEach((y) => out.push({ ...ST('room-ceo', 66, y, 'up'), style: 'exec' }));
  return out;
}

export const MEETING_SEATS = (() => {
  const table = { x: 1010, y: 120, w: 260, h: 120 };
  const seats = [];
  [40, 130, 220].forEach((dx) => seats.push({ x: table.x + dx, y: table.y - 34, facing: 'south' }));
  [40, 130, 220].forEach((dx) => seats.push({ x: table.x + dx, y: table.y + table.h + 34, facing: 'north' }));
  seats.push({ x: table.x - 34, y: table.y + 60, facing: 'east' });
  seats.push({ x: table.x + table.w + 34, y: table.y + 60, facing: 'west' });
  return seats;
})();

/**
 * Desk rows for v2 layouts. Stores created before v2 keep their geometry, so a
 * boot migration snaps department rows to these values.
 */
export const DESK_ROWS_V2 = {
  'room-dev': [520, 694],
  'room-data': [520, 694],
  'room-research': [520, 694],
  'room-marketing': [1000, 1160],
  'room-admin': [1000, 1160],
  'room-creative': [1000, 1160],
  'room-ops': [1000, 1160],
};

/** Rooms that were too shallow for a seated character to clear the top wall. */
export const GROWN_ROOMS = ['room-marketing', 'room-admin', 'room-creative', 'room-ops'];

export const LAYOUT_VERSION = 2;

export function migrateLayout(office) {
  if (!office || (office.layoutVersion ?? 1) >= LAYOUT_VERSION) return false;

  // The four lower rooms gain height, and their decor moves with them, so that
  // the first desk row can sit far enough below the wall for a seated sprite.
  for (const id of GROWN_ROOMS) {
    const room = office.rooms.find((r) => r.id === id);
    if (!room || room.h >= 380) continue;
    room.h = 380;
    for (const f of office.furniture) {
      if (f.y >= room.y + 240 && f.x >= room.x && f.x <= room.x + room.w) f.y += 80;
    }
  }
  office.world.h = Math.max(office.world.h, 1320);

  let changed = true;
  for (const [roomId, rows] of Object.entries(DESK_ROWS_V2)) {
    const sts = office.stations.filter((s) => s.roomId === roomId);
    const ys = [...new Set(sts.map((s) => s.y))].sort((a, b) => a - b);
    ys.forEach((y, i) => {
      const target = rows[i];
      if (target === undefined || target === y) return;
      for (const s of sts) if (s.y === y) { s.y = target; changed = true; }
    });
  }
  office.layoutVersion = LAYOUT_VERSION;
  return true;
}

export const LOUNGE_SPOTS = [
  { x: 1560, y: 150 }, { x: 1660, y: 118 }, { x: 1660, y: 214 }, { x: 1712, y: 140 },
];

const APPEARANCES = [
  { skin: '#e8b98f', hair: '#3a2b22', hairStyle: 'short', shirt: '#3f8efc', pants: '#2b3444', accessory: 'glasses' },
  { skin: '#c98d63', hair: '#201a16', hairStyle: 'bun', shirt: '#f2655a', pants: '#37323e', accessory: null },
  { skin: '#f2cba4', hair: '#a9662f', hairStyle: 'curly', shirt: '#4fb286', pants: '#2f3a36', accessory: 'headset' },
  { skin: '#8a5a3b', hair: '#171310', hairStyle: 'bald', shirt: '#f2994a', pants: '#2d2f36', accessory: 'glasses' },
  { skin: '#f0d0b0', hair: '#6b4a2f', hairStyle: 'long', shirt: '#9b6bf2', pants: '#33303d', accessory: null },
  { skin: '#d9a273', hair: '#2b2118', hairStyle: 'short', shirt: '#37b6c9', pants: '#2a3438', accessory: null },
  { skin: '#eec49b', hair: '#c9a227', hairStyle: 'bun', shirt: '#c9a227', pants: '#3a332a', accessory: 'earpiece' },
  { skin: '#b87e57', hair: '#241c17', hairStyle: 'short', shirt: '#7b8794', pants: '#2f3339', accessory: null },
];

/**
 * Placeholder employees. They are DEMO PLACEHOLDERS ONLY: `simulated: true`
 * is surfaced in every panel, and they are not connected to any Arena agent.
 * Replace them with real agent references from the Connections panel.
 */
const DEMO_PEOPLE = [
  { name: 'Nova', title: 'Lead Developer', role: 'Developer', dept: 'dev', station: 0, room: 'room-dev' },
  { name: 'Atlas', title: 'Backend Engineer', role: 'Developer', dept: 'dev', station: 1, room: 'room-dev' },
  { name: 'Iris', title: 'Data Analyst', role: 'Analyst', dept: 'data', station: 6, room: 'room-data' },
  { name: 'Sage', title: 'Research Lead', role: 'Researcher', dept: 'research', station: 10, room: 'room-research' },
  { name: 'Lumen', title: 'Brand Strategist', role: 'Marketing Specialist', dept: 'marketing', station: 16, room: 'room-marketing' },
  { name: 'Muse', title: 'Product Designer', role: 'Designer', dept: 'creative', station: 24, room: 'room-creative' },
  { name: 'Quill', title: 'Technical Writer', role: 'Writer', dept: 'admin', station: 20, room: 'room-admin' },
  { name: 'Vega', title: 'Operations Manager', role: 'Project Manager', dept: 'ops', station: 28, room: 'room-ops' },
];

export function createInitialState() {
  const now = new Date().toISOString();
  const sts = stations();

  const employees = DEMO_PEOPLE.map((p, i) => {
    const st = sts[p.station];
    st.employeeId = `emp-${i + 1}`;
    return {
      id: `emp-${i + 1}`,
      name: p.name,
      title: p.title,
      role: p.role,
      departmentId: p.dept,
      stationId: st.id,
      roomId: st.roomId,
      appearance: APPEARANCES[i % APPEARANCES.length],
      agent: {
        // No Arena AI agent is attached yet. `ref` stays null until the CEO
        // connects a real, accessible agent through the Connections panel.
        ref: null,
        endpointId: null,
        model: null,
        instructions: null,
        source: 'template',
      },
      simulated: true,
      connected: false,
      createdAt: now,
    };
  });

  return {
    version: 1,
    createdAt: now,
    settings: {
      companyName: 'Arena Virtual Company',
      ceoName: 'CEO',
      firstRun: true,
      simulationBannerDismissed: false,
      soundEnabled: false,
      zoom: 0.62,
    },
    office: {
      world: WORLD,
      layoutVersion: LAYOUT_VERSION,
      wall: WALL,
      rooms: ROOMS,
      corridors: CORRIDORS,
      doors: DOORS,
      furniture: furniture(),
      stations: sts,
      meetingSeats: MEETING_SEATS,
      loungeSpots: LOUNGE_SPOTS,
    },
    departments: DEPARTMENTS.map((d) => ({ ...d })),
    endpoints: [
      {
        id: 'sim',
        label: 'Local simulation (not an Arena agent)',
        kind: 'simulation',
        baseUrl: '',
        model: 'simulation',
        hasKey: false,
        status: 'ready',
        note: 'Generates deterministic placeholder replies locally so you can explore the office. Never presented as Arena AI output.',
        createdAt: now,
      },
    ],
    employees,
    tasks: [],
    projects: [],
    meetings: [],
    conversations: {},
    activity: [
      { id: 'a0', at: now, kind: 'system', text: 'Office initialised with 8 demo placeholders. Connect a real endpoint to bring in your Arena AI agents.' },
    ],
  };
}
