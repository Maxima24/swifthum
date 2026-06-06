import { useSyncExternalStore } from 'react';

/**
 * Rules layout preference — 'list' (single column) or 'grid' (responsive
 * 1/2/3 columns). Persisted to localStorage, shared via subscribe/notify so
 * the header toggle and the list re-render together.
 */
export type ViewMode = 'list' | 'grid';

const STORAGE_KEY = 'swifthum:rules-view';
const listeners = new Set<() => void>();

function read(): ViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'list' || v === 'grid') return v;
  } catch {
    /* storage unavailable */
  }
  return 'list';
}

function getSnapshot(): ViewMode {
  return read();
}

export function setViewMode(mode: ViewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useViewMode(): {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
} {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { mode, setMode: setViewMode };
}
