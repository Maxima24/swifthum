import { useSyncExternalStore } from 'react';
import {
  cycleTheme,
  getResolvedTheme,
  getThemePref,
  subscribeTheme,
  type ResolvedTheme,
  type ThemePref,
} from '../lib/theme';

/** Reactive view of the current theme preference + resolved value. */
export function useTheme(): {
  pref: ThemePref;
  resolved: ResolvedTheme;
  cycle: () => void;
} {
  const pref = useSyncExternalStore(subscribeTheme, getThemePref, getThemePref);
  const resolved = useSyncExternalStore(
    subscribeTheme,
    getResolvedTheme,
    getResolvedTheme,
  );
  return { pref, resolved, cycle: cycleTheme };
}
