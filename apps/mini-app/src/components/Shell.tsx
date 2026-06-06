import type { ReactNode } from 'react';
import { useSidebar } from '../hooks/useSidebar';
import { cn } from '../ui';

/**
 * Responsive layout shell. Owns the single horizontal screen padding
 * (px-5 mobile / px-8 desktop) so every route is consistent and the sticky
 * Header's negative margins line up.
 *
 * - Phone (< sm): single centered column, max 480px.
 * - Tablet (sm–lg): centered column widens to use the screen (2xl → 3xl) so it
 *   doesn't float in a narrow strip with huge side margins.
 * - Desktop (>= lg): fills the whole area to the right of the fixed sidebar —
 *   offset matches the sidebar's width (256px expanded / 64px collapsed) and
 *   animates with it — with comfortable 32px edge padding.
 * Bottom padding clears the fixed TabBar + safe-area below lg.
 */
export function Shell({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        'min-h-dvh transition-[padding] duration-200 ease-out',
        collapsed ? 'lg:pl-16' : 'lg:pl-64',
      )}
    >
      <div className="mx-auto w-full max-w-[480px] sm:max-w-2xl md:max-w-3xl px-5 sm:px-6 lg:mx-0 lg:max-w-none lg:px-8 pb-[calc(72px+env(safe-area-inset-bottom))] lg:pb-16">
        {children}
      </div>
    </div>
  );
}
