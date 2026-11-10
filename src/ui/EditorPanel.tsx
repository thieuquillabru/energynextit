import React, { useState } from 'react';
import { useCompany } from '../lib/store';
import { furnitureSize } from '../engine/layout';
import type { OfficeScene } from '../engine/OfficeScene';
import { IconClose, IconPlus, IconTrash, IconWarning } from './icons';

const LIBRARY: { group: string; types: { type: string; label: string }[] }[] = [
  {
    group: 'Seating & desks',
    types: [
      { type: 'desk', label: 'Desk' },
      { type: 'execDesk', label: 'Exec desk' },
      { type: 'receptionDesk', label: 'Reception' },
      { type: 'meetingTable', label: 'Table' },
      { type: 'tableRound', label: 'Round table' },
      { type: 'coffeeTable', label: 'Coffee table' },
    ],
  },
  {
    group: 'Comfort',
    types: [
      { type: 'sofa', label: 'Sofa' },
      { type: 'plant', label: 'Plant' },
      { type: 'waterCooler', label: 'Water' },
      { type: 'coffeeMachine', label: 'Coffee' },
      { type: 'vendingMachine', label: 'Vending' },
      { type: 'rug', label: 'Rug' },
    ],
  },
  {
    group: 'Work & storage',
    types: [
      { type: 'cabinet', label: 'Cabinet' },
      { type: 'bookshelf', label: 'Shelf' },
      { type: 'serverRack', label: 'Server' },
      { type: 'printer', label: 'Printer' },
      { type: 'whiteboard', label: 'Board' },
      { type: 'screen', label: 'Screen' },
      { type: 'monitorWall', label: 'Dash wall' },
    ],
  },
];

export function EditorPanel({
  scene, selection, onClose,
}: {
  scene: OfficeScene | null;
  selection: { kind: 'furniture' | 'station' | 'room'; id: string } | null;
  onClose: () => void;
}) {
  const { snap, act, notify } = useCompany();
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDept, setNewRoomDept] = useState('');
  if (!snap) return null;

  const furniture = selection?.kind === 'furniture'
    ? snap.office.furniture.find((f) => f.id === selection.id) : null;
  const station = selection?.kind === 'station'
    ? snap.office.stations.find((s) => s.id === selection.id) : null;
  const room = selection?.kind === 'room'
    ? snap.office.rooms.find((r) => r.id === selection.id) : null;

  const commit = () => scene?.emitLayoutCommit();

  const save = async () => {
    if (!scene || !snap) return;
    const office = scene.data?.office || snap.office;
    const res = await act(() => fetch('/api/office', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rooms: office.rooms,
        corridors: office.corridors,
        doors: office.doors,
        furniture: office.furniture,
        stations: office.stations,
      }),
    }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json()).error || 'Save failed');
      return r.json();
    }), { ok: 'Layout saved.' });
    if (res) onClose();
  };

  return (
    <div className="editor-toolbar">
      <div className="inline" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ fontSize: 12.5 }}>Layout editor</strong>
        <button className="icon-btn" style={{ width: 24, height: 24 }} onClick={onClose}><IconClose size={12} /></button>
      </div>
      <div className="hint" style={{ marginBottom: 10 }}>
        Drag furniture, desks and whole rooms. Right-hand panel controls add/remove.
      </div>

      {selection && (
        <div className="card">
          <div className="card-title" style={{ textTransform: 'capitalize' }}>
            {furniture ? furniture.type : station ? `Workstation ${station.id}` : room ? room.name : ''}
          </div>
          <div className="hint mono" style={{ marginTop: 3 }}>{selection.id}</div>

          {furniture && (
            <div className="row" style={{ marginTop: 8 }}>
              <div>
                <label className="label">X</label>
                <input className="input" type="number" value={Math.round(furniture.x)}
                  onChange={(e) => { furniture.x = Number(e.target.value); commit(); }} />
              </div>
              <div>
                <label className="label">Y</label>
                <input className="input" type="number" value={Math.round(furniture.y)}
                  onChange={(e) => { furniture.y = Number(e.target.value); commit(); }} />
              </div>
            </div>
          )}

          {station && (
            <div style={{ marginTop: 8 }}>
              <label className="label">Employee</label>
              <select
                className="select"
                value={station.employeeId || ''}
                onChange={(e) => act(() => fetch(`/api/employees/${e.target.value}`, {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stationId: station.id }),
                }), { ok: 'Workstation assigned.' })}
              >
                <option value="">— empty desk —</option>
                {snap.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
          )}

          {room && (
            <div style={{ marginTop: 8 }}>
              <div className="field">
                <label className="label">Room name</label>
                <input className="input" value={room.name}
                  onChange={(e) => scene?.updateRoom(room.id, { name: e.target.value })} />
              </div>
              <div className="field">
                <label className="label">Department</label>
                <select className="select" value={room.deptId || ''}
                  onChange={(e) => scene?.updateRoom(room.id, { deptId: e.target.value || null })}>
                  <option value="">— none —</option>
                  {snap.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="row tight">
                <div><label className="label">Width</label>
                  <input className="input" type="number" value={room.w}
                    onChange={(e) => scene?.updateRoom(room.id, { w: Number(e.target.value) })} /></div>
                <div><label className="label">Height</label>
                  <input className="input" type="number" value={room.h}
                    onChange={(e) => scene?.updateRoom(room.id, { h: Number(e.target.value) })} /></div>
              </div>
              <div className="hint">The room's door and desks are kept inside the new bounds.</div>
            </div>
          )}

          <div className="wrap" style={{ marginTop: 9 }}>
            <button className="btn sm ghost" onClick={() => { scene?.nudge(0, -5); }}>↑</button>
            <button className="btn sm ghost" onClick={() => { scene?.nudge(0, 5); }}>↓</button>
            <button className="btn sm ghost" onClick={() => { scene?.nudge(-5, 0); }}>←</button>
            <button className="btn sm ghost" onClick={() => { scene?.nudge(5, 0); }}>→</button>
            <button className="btn sm danger" onClick={() => scene?.removeSelectedEntity()}>
              <IconTrash size={11} /> Delete
            </button>
          </div>
          {room && (
            <button
              className="btn sm danger"
              style={{ marginTop: 6, width: '100%' }}
              onClick={() => {
                if (!scene?.data) return;
                scene.data.office.rooms = scene.data.office.rooms.filter((r) => r.id !== room.id);
                scene.data.office.stations = scene.data.office.stations.filter((s) => s.roomId !== room.id);
                scene.emitLayoutCommit();
                notify('info', 'Room deleted. Save to persist.');
              }}
            ><IconTrash size={11} /> Delete room</button>
          )}
        </div>
      )}

      <div className="section-title">Add furniture</div>
      {LIBRARY.map((group) => (
        <div key={group.group} style={{ marginBottom: 8 }}>
          <div className="label">{group.group}</div>
          <div className="type-row">
            {group.types.map((t) => (
              <button key={t.type} className="type-btn" onClick={() => scene?.addFurniture(t.type)}>{t.label}</button>
            ))}
          </div>
        </div>
      ))}

      <div className="section-title">Add workstation</div>
      <button className="btn sm" style={{ width: '100%' }} onClick={() => scene?.addStation()}>
        <IconPlus size={11} /> New desk in the centre room
      </button>

      <div className="section-title">Add room</div>
      <input className="input" placeholder="Room name" value={newRoomName} onChange={(e) => setNewRoomName(e.target.value)} />
      <select className="select" style={{ marginTop: 6 }} value={newRoomDept} onChange={(e) => setNewRoomDept(e.target.value)}>
        <option value="">— no department —</option>
        {snap.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
      <button
        className="btn sm"
        style={{ width: '100%', marginTop: 6 }}
        disabled={!newRoomName.trim()}
        onClick={() => { scene?.addRoom(newRoomName, newRoomDept || null); setNewRoomName(''); }}
      ><IconPlus size={11} /> Create room</button>

      <div className="notice warn" style={{ marginTop: 10, marginBottom: 0 }}>
        <IconWarning size={12} /> Changes are live in the office and saved to disk when you press Save.
      </div>
      <div className="row" style={{ marginTop: 9 }}>
        <button className="btn ghost" onClick={onClose}>Discard</button>
        <button className="btn primary" onClick={save}>Save layout</button>
      </div>
    </div>
  );
}
