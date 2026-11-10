/**
 * Headless preview renderer.
 *
 * Not part of the app: it draws the office and a character sheet to PNG files so
 * the visual result can be reviewed without a browser. Uses the exact same sprite
 * functions as the live canvas renderer.
 */
import {
  drawChair, drawDoorFrames, drawFurniture, drawMeetingChairs, drawStationDesk,
  drawWalls, drawWindows, paintFloor, blitCharacter, drawCharacterShadow, drawStatusBadge,
  drawBuildingBase, drawLightPools, drawRoomLabels, PALETTE,
} from '../src/engine/sprites';
import { stationGeom } from '../src/engine/layout';

const SCALE = 1.6;

export function renderOffice(canvas, state) {
  const office = state.office;
  const c = canvas;
  c.width = Math.round(office.world.w * SCALE);
  c.height = Math.round(office.world.h * SCALE);
  const ctx = c.getContext('2d');
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = PALETTE.void;
  ctx.fillRect(0, 0, office.world.w, office.world.h);

  drawBuildingBase(ctx, office);
  for (const cor of office.corridors) {
    paintFloor(ctx, { id: cor.id, name: '', x: cor.x, y: cor.y, w: cor.w, h: cor.h, floor: 'concrete', deptId: null });
  }
  for (const room of office.rooms) paintFloor(ctx, room);
  drawLightPools(ctx, office);

  for (const room of office.rooms) {
    const dept = state.departments.find((d) => d.id === room.deptId);
    if (dept) {
      ctx.fillStyle = `${dept.color}33`;
      ctx.fillRect(room.x + office.wall, room.y + office.wall, room.w - office.wall * 2, 6);
      ctx.fillStyle = dept.color;
      ctx.fillRect(room.x + office.wall, room.y + office.wall, 46, 3);
    }
  }

  for (const f of office.furniture) if (f.type === 'rug') drawFurniture(ctx, f);
  drawWalls(ctx, office);
  drawWindows(ctx, office);
  drawDoorFrames(ctx, office);
  drawRoomLabels(ctx, office, state.departments);

  const drawables = [];
  for (const f of office.furniture) {
    if (f.type === 'rug') continue;
    drawables.push({ y: f.y + (f.h || 30), draw: () => drawFurniture(ctx, f) });
  }
  for (const st of office.stations) {
    const g = stationGeom(st);
    drawables.push({ y: g.seat.y + 10, draw: () => drawChair(ctx, g.seat.x, g.seat.y + 8, st.style === 'exec' ? 'exec' : 'std', g.facing) });
    drawables.push({ y: g.desk.y + g.desk.h, draw: () => drawStationDesk(ctx, st) });
  }
  office.meetingSeats.forEach((seat) => {
    drawables.push({ y: seat.y + 4, draw: () => drawChair(ctx, seat.x, seat.y + 10, 'std', seat.facing || 'down') });
  });
  for (const spot of office.loungeSpots) {
    drawables.push({ y: spot.y + 4, draw: () => drawChair(ctx, spot.x, spot.y + 10, 'std', 'down') });
  }

  // characters: half seated (working), a few walking around the corridors
  const wander = [
    { x: 700, y: 380, pose: 'walk', dir: 'right' },
    { x: 1200, y: 858, pose: 'walk', dir: 'left' },
    { x: 540, y: 200, pose: 'idle', dir: 'down' },
  ];
  state.employees.forEach((emp, i) => {
    const st = office.stations.find((s) => s.id === emp.stationId);
    if (!st) return;
    const g = stationGeom(st);
    const walking = wander[i - 2];
    if (walking) {
      drawables.push({
        y: walking.y,
        draw: () => {
          drawCharacterShadow(ctx, walking.x, walking.y);
          blitCharacter(ctx, emp.appearance, walking.pose, walking.dir, 1, walking.x, walking.y);
        },
      });
      return;
    }
    drawables.push({
      y: g.seat.y,
      draw: () => {
        drawCharacterShadow(ctx, g.seat.x, g.seat.y);
        blitCharacter(ctx, emp.appearance, 'type', g.facing, 0, g.seat.x, g.seat.y);
      },
    });
  });

  drawables.sort((a, b) => a.y - b.y).forEach((d) => d.draw());
  drawRoomLabels(ctx, office, state.departments);

  // a selected-employee style badge for flavour
  const first = state.employees[0];
  const st0 = office.stations.find((s) => s.id === first?.stationId);
  if (st0) {
    const g = stationGeom(st0);
    drawStatusBadge(ctx, g.seat.x + 20, g.seat.y - 76, 'working', '#4fd1ff', 1.2);
  }
}

export function renderCharacters(canvas) {
  const people = [
    { skin: '#e8b98f', hair: '#3a2b22', hairStyle: 'short', shirt: '#3f8efc', pants: '#2b3444', accessory: 'glasses' },
    { skin: '#c98d63', hair: '#201a16', hairStyle: 'bun', shirt: '#f2655a', pants: '#37323e', accessory: null },
    { skin: '#f2cba4', hair: '#a9662f', hairStyle: 'curly', shirt: '#4fb286', pants: '#2f3a36', accessory: 'headset' },
    { skin: '#8a5a3b', hair: '#171310', hairStyle: 'bald', shirt: '#f2994a', pants: '#2d2f36', accessory: 'glasses' },
    { skin: '#f0d0b0', hair: '#6b4a2f', hairStyle: 'long', shirt: '#9b6bf2', pants: '#33303d', accessory: null },
    { skin: '#d9a273', hair: '#2b2118', hairStyle: 'short', shirt: '#37b6c9', pants: '#2a3438', accessory: 'earpiece' },
  ];
  const poses = [['sit', 'down'], ['type', 'down'], ['walk', 'right'], ['walk', 'left'], ['idle', 'up'], ['think', 'down']];
  const cell = 96;
  canvas.width = cell * people.length;
  canvas.height = cell * poses.length;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#232b38';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  people.forEach((p, col) => {
    poses.forEach(([pose, dir], row) => {
      const x = col * cell + cell / 2;
      const y = row * cell + cell - 8;
      ctx.fillStyle = (row + col) % 2 ? '#28313f' : '#232b38';
      ctx.fillRect(col * cell, row * cell, cell, cell);
      drawCharacterShadow(ctx, x, y);
      if (pose === 'sit' || pose === 'type') drawChair(ctx, x, y - 6, 'std', 'down');
      blitCharacter(ctx, p, pose, dir, pose === 'walk' ? 1 : 0, x, y);
    });
  });
  return canvas;
}
