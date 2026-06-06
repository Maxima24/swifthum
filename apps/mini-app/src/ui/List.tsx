import type { ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from '../components/Icon';

/**
 * iOS-Settings-style grouped list. Rows live inside ONE bordered container with
 * hairline dividers inset past the icon — not floating separate cards.
 */
export function ListGroup({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {title && (
        <h2 className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
          {title}
        </h2>
      )}
      <div className="rounded-2xl bg-surface border border-border overflow-hidden shadow-[var(--shadow-soft)] divide-y divide-border">
        {children}
      </div>
    </section>
  );
}

type Tone = 'accent' | 'success' | 'warning' | 'danger' | 'muted';

const TONE_TILE: Record<Tone, string> = {
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  muted: 'bg-surface-muted text-text-secondary',
};

export function ListRow({
  icon,
  iconTone = 'muted',
  label,
  subtitle,
  trailing,
  chevron,
  onClick,
  disabled,
}: {
  icon?: IconName;
  iconTone?: Tone;
  label: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const interactive = !!onClick;
  const Tag = interactive ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      disabled={interactive ? disabled : undefined}
      className={cn(
        'w-full flex items-center gap-3 px-4 py-3 text-left',
        interactive &&
          'transition-colors duration-150 hover:bg-surface-muted active:bg-surface-muted disabled:opacity-50',
      )}
    >
      {icon && (
        <span
          className={cn(
            'shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
            TONE_TILE[iconTone],
          )}
        >
          <Icon name={icon} size={18} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-text-primary truncate">
          {label}
        </span>
        {subtitle && (
          <span className="block text-[13px] text-text-secondary leading-snug mt-0.5">
            {subtitle}
          </span>
        )}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
      {chevron && (
        <Icon name="chevron-right" size={18} className="shrink-0 text-text-tertiary" />
      )}
    </Tag>
  );
}
