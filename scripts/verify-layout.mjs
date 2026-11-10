/**
 * Floorplan sanity check: every workstation seat, meeting seat and lounge spot
 * must be reachable on foot from the reception area. Also reports overlapping
 * furniture that would trap a character.
 */
import { buildNav, stationGeom, furnitureSize } from '/tmp/layout.mjs';
import { createInitialState } from '../server/seed.mjs';

const state = createInitialState();
const office = state.office;
const nav = buildNav(office);

const start = { x: 740, y: 120 }; // reception
if (!nav.isFreeWorld(start.x, start.y)) {
  console.log('✗ reception spawn point is not walkable');
}

let bad = 0;
for (const st of office.stations) {
  const g = stationGeom(st);
  const p = nav.findPath(start, g.seat);
  const ok = p.length > 0 && nav.isFreeWorld(g.seat.x, g.seat.y);
  if (!ok) { console.log(`✗ station ${st.id} (${st.roomId}) seat unreachable at ${Math.round(g.seat.x)},${Math.round(g.seat.y)}`); bad++; }
}
office.meetingSeats.forEach((s, i) => {
  const p = nav.findPath(start, { x: s.x, y: s.y + 10 });
  if (!p.length) { console.log(`✗ meeting seat ${i} unreachable`); bad++; }
});
office.loungeSpots.forEach((s, i) => {
  const p = nav.findPath(start, s);
  if (!p.length) { console.log(`✗ lounge spot ${i} unreachable`); bad++; }
});

// fixtures inside walls / outside rooms
for (const f of office.furniture) {
  const size = furnitureSize(f);
  const inside = office.rooms.some((r) =>
    f.x >= r.x - 2 && f.y >= r.y - 2 &&
    f.x + size.w <= r.x + r.w + 2 && f.y + size.h <= r.y + r.h + 2)
    || office.corridors.some((c) =>
      f.x >= c.x && f.y >= c.y && f.x + size.w <= c.x + c.w && f.y + size.h <= c.y + c.h);
  if (!inside) { console.log(`! furniture ${f.type} (${f.id}) at ${f.x},${f.y} escapes every room`); }
}

// stations must not sit under solid furniture
for (const st of office.stations) {
  const g = stationGeom(st);
  for (const f of office.furniture) {
    if (!furnitureSize(f).solid) continue;
    const size = furnitureSize(f);
    const overlap = g.desk.x < f.x + size.w && g.desk.x + g.desk.w > f.x &&
      g.desk.y < f.y + size.h && g.desk.y + g.desk.h > f.y;
    if (overlap) { console.log(`! station ${st.id} overlaps ${f.type} ${f.id}`); bad++; }
  }
}

const walkable = nav.walk.reduce((a, b) => a + b, 0);
console.log(`grid ${nav.cols}x${nav.rows}, walkable cells ${walkable}`);
console.log(bad === 0 ? '✓ all seats reachable' : `✗ ${bad} problems`);
