import { cn } from './cn';
import { Icon, type IconName } from '../components/Icon';

/**
 * Segmented control on a `surface-muted` track. The active segment is a solid
 * `surface` pill with a hairline border — a simple background swap, no sliding
 * layout animation (keeps it calm and reduced-motion-safe).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: IconName }[];
}) {
  return (
    <div
      role="tablist"
      className="grid gap-1 rounded-xl bg-surface-muted border border-border p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors duration-150',
              active
                ? 'bg-surface text-text-primary border border-border shadow-[var(--shadow-soft)]'
                : 'text-text-secondary border border-transparent hover:text-text-primary',
            )}
          >
            {o.icon && <Icon name={o.icon} size={15} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
