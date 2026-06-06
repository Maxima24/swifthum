import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * The canonical raised surface. Solid `surface` fill, hairline border, soft
 * elevation. No glass, no glow, no gradient. Radius 16. Default padding 20.
 */
export function Card({
  children,
  className,
  padded = true,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  as?: 'div' | 'section' | 'article';
}) {
  return (
    <Tag
      className={cn(
        'rounded-2xl bg-surface border border-border shadow-[var(--shadow-soft)]',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </Tag>
  );
}
