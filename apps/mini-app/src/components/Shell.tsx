import type { ReactNode } from 'react';
import { useUi } from '../stores/ui';

/**
 * Responsive layout shell:
 * - Mobile (< lg): narrow column, max-w-[460px], 20px horizontal padding.
 * - Desktop (>= lg): sidebar fixed left (collapsible 64/256px), content
 *   fills the rest up to max-w-6xl with 40px horizontal padding.
 *
 * Padding lives HERE (not in routes) so headers can bleed edge-to-edge
 * with a consistent `-mx-*` negative margin.
 */
export function Shell({ children }: { children: ReactNode }) {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  return (
    <div
      className={`min-h-dvh transition-[padding] duration-300 ease-out ${
        collapsed ? 'lg:pl-16' : 'lg:pl-64'
      }`}
    >
      <div className="mx-auto w-full max-w-[460px] px-5 lg:max-w-6xl lg:px-10">{children}</div>
    </div>
  );
}
