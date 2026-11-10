import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { IntegrationInfo, PanelId, Snapshot } from '../types';

type ToastKind = 'ok' | 'err' | 'info';
type Toast = { id: number; kind: ToastKind; text: string };

type Ctx = {
  snap: Snapshot | null;
  info: IntegrationInfo | null;
  loading: boolean;
  bootError: string | null;
  toasts: Toast[];
  notify: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
  refresh: () => Promise<void>;
  panel: PanelId;
  setPanel: (p: PanelId) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  editor: boolean;
  setEditor: (v: boolean) => void;
  zoomLabel: number;
  setZoomLabel: (z: number) => void;
  act: <T,>(fn: () => Promise<T>, opts?: { ok?: string; silent?: boolean }) => Promise<T | null>;
  busy: string | null;
  toggles: {
    chat: boolean; setChat: (v: boolean) => void;
  };
};

const CompanyCtx = createContext<Ctx | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [info, setInfo] = useState<IntegrationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [panel, setPanel] = useState<PanelId>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editor, setEditor] = useState(false);
  const [zoomLabel, setZoomLabel] = useState(0.7);
  const [busy, setBusy] = useState<string | null>(null);
  const [chat, setChat] = useState(false);
  const toastSeq = useRef(0);
  const refreshing = useRef(false);

  const notify = useCallback((kind: ToastKind, text: string) => {
    const id = ++toastSeq.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    const ms = kind === 'err' ? 9000 : 4500;
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const data = await api.get<Snapshot>('/api/state');
      setSnap(data);
      setBootError(null);
    } catch (err) {
      setBootError(err instanceof Error ? err.message : 'Cannot reach the office server.');
    } finally {
      refreshing.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    api.get<IntegrationInfo>('/api/integration-info').then(setInfo).catch(() => undefined);
    const timer = setInterval(() => {
      // Skip while the user is dragging something in the office: a refresh would
      // swap the layout object mid-gesture.
      if (document.visibilityState !== 'visible') return;
      if (document.body.dataset.officeDragging === '1') return;
      refresh();
    }, 1800);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = useCallback(async <T,>(fn: () => Promise<T>, opts?: { ok?: string; silent?: boolean }) => {
    setBusy('action');
    try {
      const result = await fn();
      if (opts?.ok) notify('ok', opts.ok);
      await refresh();
      return result;
    } catch (err) {
      const message = err instanceof ApiError
        ? err.message
        : err instanceof Error ? err.message : 'Something went wrong';
      if (!opts?.silent) notify('err', message);
      return null;
    } finally {
      setBusy(null);
    }
  }, [notify, refresh]);

  const value = useMemo<Ctx>(() => ({
    snap, info, loading, bootError, toasts, notify, dismissToast, refresh,
    panel, setPanel, selectedId, setSelectedId, editor, setEditor,
    zoomLabel, setZoomLabel, act, busy, toggles: { chat, setChat },
  }), [snap, info, loading, bootError, toasts, notify, dismissToast, refresh,
    panel, selectedId, editor, zoomLabel, act, busy, chat]);

  return <CompanyCtx.Provider value={value}>{children}</CompanyCtx.Provider>;
}

export function useCompany() {
  const ctx = useContext(CompanyCtx);
  if (!ctx) throw new Error('useCompany must be used inside CompanyProvider');
  return ctx;
}
