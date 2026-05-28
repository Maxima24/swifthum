import { isInsideTelegram } from './tg';

export type ThemePref = 'system' | 'light' | 'dark';

/**
 * Applies the user's theme preference to the document root.
 * - 'system' + in Telegram → no data-theme attr (Telegram SDK vars take over)
 * - 'system' + browser → follow prefers-color-scheme media query
 * - 'light' / 'dark' → explicit data-theme attribute
 */
export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') {
    if (isInsideTelegram()) {
      root.removeAttribute('data-theme');
      return;
    }
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    return;
  }
  root.setAttribute('data-theme', pref);
}

/**
 * Watches the OS dark-mode media query and re-applies the theme when it
 * changes (only relevant when pref = 'system' outside Telegram).
 */
export function watchSystemTheme(getPref: () => ThemePref): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => {
    if (getPref() === 'system') applyTheme('system');
  };
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
