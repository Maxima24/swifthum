import type { ReactNode } from 'react';

/**
 * Responsive layout shell:
 * - Mobile (< lg): narrow column centered, max-w-[460px], TabBar at bottom.
 * - Desktop (>= lg): sidebar fixed left (w-64), content area to its right.
 */
export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh lg:pl-64">
      <div className="mx-auto w-full max-w-[460px] lg:max-w-2xl lg:px-8">
        {children}
      </div>
    </div>
  );
}
