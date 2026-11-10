import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CompanyProvider, useCompany } from './lib/store';
import { api } from './lib/api';
import { OfficeScene } from './engine/OfficeScene';
import { BootScreen, Minimap, SideNav, Toasts, TopBar, ViewControls } from './ui/shell';
import { ConnectNotice, DepartmentsPanel, ProjectsPanel, SettingsPanel } from './ui/panels-org';
import { ActivityPanel, DashboardPanel, DirectoryPanel, TaskComposerModal, TasksPanel } from './ui/panels-core';
import { EmployeePanel } from './ui/EmployeePanel';
import { MeetingComposer, MeetingPanel } from './ui/Meeting';
import { EditorPanel } from './ui/EditorPanel';
import { Onboarding } from './ui/Onboarding';
import { IconClose } from './ui/icons';
import type { PanelId } from './types';

export default function App() {
  return (
    <CompanyProvider>
      <Shell />
    </CompanyProvider>
  );
}

const PANEL_TITLES: Record<string, string> = {
  dashboard: 'CEO dashboard',
  directory: 'Employee directory',
  tasks: 'Task manager',
  departments: 'Departments',
  projects: 'Projects',
  activity: 'Company activity',
  settings: 'Connections & settings',
};

function Shell() {
  const {
    snap, loading, bootError, refresh, panel, setPanel, selectedId, setSelectedId,
    editor, setEditor, setZoomLabel, notify,
  } = useCompany();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OfficeScene | null>(null);
  const [scene, setScene] = useState<OfficeScene | null>(null);
  const [selection, setSelection] = useState<{ kind: 'furniture' | 'station' | 'room'; id: string } | null>(null);
  const [chatTab, setChatTab] = useState(false);
  const [composer, setComposer] = useState(false);
  const [meetingDraft, setMeetingDraft] = useState<string[] | null>(null);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const camZoom = useRef(0.7);
  const saveTimer = useRef<number | null>(null);

  /* --------------------------- scene construction -------------------------- */

  // `Shell` renders nothing until the first snapshot arrives, so the canvas ref is
  // still empty when this effect first runs. Re-run when the data lands, and bail
  // out if a scene already exists (the effect must never build a second one).
  const booted = Boolean(snap);
  useEffect(() => {
    if (sceneRef.current || !canvasRef.current) return;
    const instance = new OfficeScene(canvasRef.current, {
      onSelectEmployee: (id) => { setSelectedId(id); setPanel(null); setChatTab(false); },
      onDoubleClickEmployee: (id) => { setSelectedId(id); setPanel(null); setChatTab(true); },
      onSelectEntity: setSelection,
      onHover: () => undefined,
      onCamera: (cam) => { camZoom.current = cam.zoom; },
      onLayoutEdited: (_office, note) => {
        if (note !== 'commit') return;
        if (saveTimer.current) window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          const office = sceneRef.current?.data?.office;
          if (!office) return;
          api.put('/api/office', {
            rooms: office.rooms,
            corridors: office.corridors,
            doors: office.doors,
            furniture: office.furniture,
            stations: office.stations,
          }).catch((err) => notify('err', `Could not save the layout: ${err.message}`));
        }, 250);
      },
    });
    sceneRef.current = instance;
    setScene(instance);
    instance.start();

    const ro = new ResizeObserver(() => instance.resize());
    if (stageRef.current) ro.observe(stageRef.current);

    const zoomTimer = window.setInterval(() => setZoomLabel(camZoom.current), 250);

    return () => {
      ro.disconnect();
      window.clearInterval(zoomTimer);
      instance.destroy();
      sceneRef.current = null;
    };
  }, [booted, notify, setPanel, setSelectedId, setZoomLabel]);

  useEffect(() => {
    if (snap && sceneRef.current) sceneRef.current.setData(snap);
  }, [snap]);

  useEffect(() => { sceneRef.current?.setSelected(selectedId); }, [selectedId]);
  useEffect(() => { sceneRef.current?.setEditor(editor); }, [editor]);

  /* ------------------------------ onboarding ------------------------------ */

  useEffect(() => {
    if (snap?.settings.firstRun) setOnboarding(true);
  }, [snap?.settings.firstRun]);

  /* ------------------------------- shortcuts ------------------------------ */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.key === 'Escape') {
        if (meetingId) { setMeetingId(null); return; }
        if (editor) { setEditor(false); return; }
        if (selectedId) { setSelectedId(null); return; }
        if (panel) setPanel(null);
      }
      if (e.key === '+' || e.key === '=') sceneRef.current?.zoomAt(1.15);
      if (e.key === '-') sceneRef.current?.zoomAt(0.87);
      if (e.key.toLowerCase() === 'f') {
        if (selectedId) sceneRef.current?.focusEmployee(selectedId);
        else sceneRef.current?.fitToOffice();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor, meetingId, panel, selectedId, setEditor, setPanel, setSelectedId]);

  const focusEmployee = useCallback((id: string) => {
    setSelectedId(id);
    setPanel(null);
    sceneRef.current?.focusEmployee(id);
  }, [setPanel, setSelectedId]);

  const startChat = useCallback((id: string) => {
    setSelectedId(id);
    setPanel(null);
    setChatTab(true);
    sceneRef.current?.focusEmployee(id);
  }, [setPanel, setSelectedId]);

  if (loading && !snap) {
    return <BootScreen error={bootError} onRetry={() => refresh()} />;
  }
  if (bootError && !snap) {
    return <BootScreen error={bootError} onRetry={() => refresh()} />;
  }
  if (!snap) return null;

  const openPanel = (id: PanelId) => {
    setPanel(id);
    if (id) { setSelectedId(null); setChatTab(false); }
  };

  const activePanel = panel && !selectedId && !meetingId ? panel : null;

  return (
    <div className="app">
      <div className="stage" ref={stageRef}>
        <canvas ref={canvasRef} />
      </div>
      <div className="vignette" />

      <TopBar
        onNewTask={() => setComposer(true)}
        onMeeting={() => setMeetingDraft([])}
      />

      <SideNav />

      <ConnectNotice />

      {activePanel && (
        <aside className="panel">
          <div className="panel-head">
            <div style={{ flex: 1 }}>
              <h2>{PANEL_TITLES[activePanel]}</h2>
              <div className="sub">{snap.settings.companyName}</div>
            </div>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close panel"><IconClose size={15} /></button>
          </div>
          {activePanel === 'dashboard' && <DashboardPanel onFocusEmployee={focusEmployee} />}
          {activePanel === 'directory' && <DirectoryPanel onFocusEmployee={focusEmployee} />}
          {activePanel === 'tasks' && <TasksPanel onFocusEmployee={focusEmployee} />}
          {activePanel === 'departments' && (
            <DepartmentsPanel
              onFocusDepartment={(id) => sceneRef.current?.focusDepartment(id)}
              onFocusEmployee={focusEmployee}
            />
          )}
          {activePanel === 'projects' && <ProjectsPanel onFocusEmployee={focusEmployee} />}
          {activePanel === 'activity' && <ActivityPanel onFocusEmployee={focusEmployee} />}
          {activePanel === 'settings' && <SettingsPanel />}
        </aside>
      )}

      {selectedId && !meetingId && (
        <EmployeePanel
          employeeId={selectedId}
          initialTab={chatTab ? 'chat' : 'profile'}
          onClose={() => { setSelectedId(null); setChatTab(false); }}
          onFocus={(id) => sceneRef.current?.focusEmployee(id)}
          onMeeting={(ids) => setMeetingDraft(ids)}
          onAgentReply={(id, text) => sceneRef.current?.notify(id, text, 8)}
        />
      )}

      {meetingId && <MeetingPanel meetingId={meetingId} onClose={() => setMeetingId(null)} />}

      {editor && !meetingId && (
        <EditorPanel
          scene={scene}
          selection={selection}
          onClose={() => setEditor(false)}
        />
      )}

      <ViewControls
        editor={editor}
        api={{
          zoomIn: () => sceneRef.current?.zoomAt(1.15),
          zoomOut: () => sceneRef.current?.zoomAt(0.87),
          fit: () => sceneRef.current?.fitToOffice(),
          reset: () => { sceneRef.current?.fitToOffice(); },
          focusSelected: () => (selectedId
            ? sceneRef.current?.focusEmployee(selectedId)
            : sceneRef.current?.fitToOffice()),
          toggleEditor: () => { setEditor(!editor); if (!editor) { setPanel(null); setSelectedId(null); } },
        }}
      />

      <Minimap
        scene={scene}
        hidden={Boolean(selectedId || panel || meetingId || editor)}
        onNavigate={(p) => {
          sceneRef.current?.setCamera({ ...(sceneRef.current?.cam || { zoom: 0.8 }), x: p.x, y: p.y } as any, true);
        }}
      />

      {composer && <TaskComposerModal onClose={() => setComposer(false)} onDone={() => setComposer(false)} />}

      {meetingDraft !== null && (
        <MeetingComposer
          preselect={meetingDraft}
          onClose={() => setMeetingDraft(null)}
        />
      )}

      {/* auto-open a meeting started from anywhere */}
      <MeetingOpener onOpen={setMeetingId} />

      {onboarding && <Onboarding onClose={() => setOnboarding(false)} />}

      <Toasts />
    </div>
  );
}

/** Opens the newest active meeting when the user starts one. */
function MeetingOpener({ onOpen }: { onOpen: (id: string) => void }) {
  const { snap } = useCompany();
  const last = useRef<string | null>(null);
  useEffect(() => {
    const active = snap?.meetings.find((m) => m.status === 'active');
    const newest = snap?.meetings[0];
    const candidate = active || newest;
    if (!candidate) return;
    if (last.current !== candidate.id && candidate.status === 'active') {
      last.current = candidate.id;
      onOpen(candidate.id);
    }
  }, [snap?.meetings, onOpen]);
  return null;
}
