import { useSyncExternalStore } from 'react';

/**
 * Desktop sidebar collapsed/expanded state. Persisted to localStorage and
 * shared via subscribe/notify so the Sidebar and the Shell (which offsets its
 * content by the sidebar width) stay in sync. Mobile ignores this — the sidebar
 * is hidden below lg regardless.
 */
const STORAGE_KEY = 'swifthum:sidebar-collapsed';
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function getSnapshot(): boolean {
  return read();
}

export function setSidebarCollapsed(collapsed: boolean) {
  try {
    if (collapsed) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSidebar(): {
  collapsed: boolean;
  toggle: () => void;
} {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { collapsed, toggle: () => setSidebarCollapsed(!collapsed) };
}
