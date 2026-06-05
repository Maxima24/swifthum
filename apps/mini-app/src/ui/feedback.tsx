import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from '../components/Icon';

/** Skeleton block — mirrors real layout so the data swap doesn't jump. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-xl bg-surface-muted', className)} />
  );
}

/** Single centered spinner — the calm default for indeterminate waits. */
export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-border border-t-accent"
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}

type BadgeTone = 'accent' | 'success' | 'warning' | 'danger' | 'muted';

const BADGE_TONE: Record<BadgeTone, string> = {
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-surface-muted text-text-secondary',
};

/** Small status pill. Semantic tone, no ring/glow. */
export function Badge({
  tone = 'muted',
  icon,
  children,
}: {
  tone?: BadgeTone;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        BADGE_TONE[tone],
      )}
    >
      {icon && <Icon name={icon} size={11} />}
      {children}
    </span>
  );
}

/** Designed empty state: icon tile + one primary line + one muted line. */
export function EmptyState({
  icon = 'sparkles',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16">
      <div className="w-14 h-14 rounded-2xl bg-surface-muted text-text-secondary flex items-center justify-center mb-4">
        <Icon name={icon} size={26} />
      </div>
      <h2 className="font-display text-[19px] font-bold tracking-[-0.01em] text-text-primary">
        {title}
      </h2>
      {description && (
        <p className="text-sm text-text-secondary max-w-xs leading-relaxed mt-1.5">
          {description}
        </p>
      )}
      {action && <div className="pt-5">{action}</div>}
    </div>
  );
}
