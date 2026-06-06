/**
 * Theme source-of-truth.
 *
 * Resolves the active theme in priority order:
 *   1. explicit user choice (localStorage) — 'light' | 'dark'
 *   2. Telegram colorScheme, when running inside Telegram
 *   3. OS `prefers-color-scheme`
 *
 * The resolved theme is written to `<html data-theme="…">`, which drives every
 * token in tailwind.css. A tiny subscribe/notify so React can re-render the
 * toggle without a context provider.
 */

export type ThemePref = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'swifthum:theme';
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

function systemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function telegramTheme(): ResolvedTheme | null {
  try {
    const scheme = (window as any).Telegram?.WebApp?.colorScheme;
    if (scheme === 'light' || scheme === 'dark') return scheme;
  } catch {
    /* not in Telegram */
  }
  return null;
}

export function resolveTheme(pref: ThemePref = readPref()): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  return telegramTheme() ?? systemTheme();
}

export function getThemePref(): ThemePref {
  return readPref();
}

export function getResolvedTheme(): ResolvedTheme {
  return resolveTheme();
}

function apply(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* storage unavailable */
  }
  apply(resolveTheme(pref));
  listeners.forEach((l) => l());
}

/** Cycle for the header toggle: light → dark → system → light. */
export function cycleTheme() {
  const order: ThemePref[] = ['light', 'dark', 'system'];
  const next = order[(order.indexOf(readPref()) + 1) % order.length];
  setThemePref(next);
}

export function subscribeTheme(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Call once at startup, before first paint. Wires OS + Telegram changes. */
export function initTheme() {
  apply(resolveTheme());

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (readPref() === 'system') {
        apply(resolveTheme());
        listeners.forEach((l) => l());
      }
    };
    mq.addEventListener?.('change', onChange);
  }

  // Telegram fires this when the user flips their client theme.
  try {
    (window as any).Telegram?.WebApp?.onEvent?.('themeChanged', () => {
      if (readPref() === 'system') {
        apply(resolveTheme());
        listeners.forEach((l) => l());
      }
    });
  } catch {
    /* not in Telegram */
  }
}
