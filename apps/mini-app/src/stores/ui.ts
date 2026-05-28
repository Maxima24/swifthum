import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemePref } from '../lib/theme';

interface UiState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  theme: ThemePref;
  setTheme: (theme: ThemePref) => void;

  // Notifications: track which fired-rule IDs the user has already seen
  ackedRuleIds: string[];
  ackRule: (id: string) => void;
  ackAll: (ids: string[]) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      theme: 'system',
      setTheme: (theme) => set({ theme }),

      ackedRuleIds: [],
      ackRule: (id) =>
        set((s) => ({
          ackedRuleIds: s.ackedRuleIds.includes(id) ? s.ackedRuleIds : [...s.ackedRuleIds, id],
        })),
      ackAll: (ids) =>
        set((s) => ({
          ackedRuleIds: Array.from(new Set([...s.ackedRuleIds, ...ids])),
        })),
    }),
    { name: 'swifthum-ui' },
  ),
);
