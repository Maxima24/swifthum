import { cn } from './cn';
import { Icon } from '../components/Icon';
import type { ViewMode } from '../hooks/useViewMode';
import { haptic } from '../lib/tg';

/** Compact list/grid switcher. Same track styling as Segmented, icon-only. */
export function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const opts: { value: ViewMode; icon: 'list-view' | 'grid-view'; label: string }[] = [
    { value: 'list', icon: 'list-view', label: 'List view' },
    { value: 'grid', icon: 'grid-view', label: 'Grid view' },
  ];
  return (
    <div className="inline-flex gap-1 rounded-xl bg-surface-muted border border-border p-1">
      {opts.map((o) => {
        const active = o.value === mode;
        return (
          <button
            key={o.value}
            aria-label={o.label}
            aria-pressed={active}
            onClick={() => {
              haptic('light');
              onChange(o.value);
            }}
            className={cn(
              'inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors duration-150',
              active
                ? 'bg-surface text-text-primary border border-border shadow-[var(--shadow-soft)]'
                : 'text-text-secondary border border-transparent hover:text-text-primary',
            )}
          >
            <Icon name={o.icon} size={16} />
          </button>
        );
      })}
    </div>
  );
}
