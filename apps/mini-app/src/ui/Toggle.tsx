import { cn } from './cn';

/** Accessible switch. Accent track when on; functional 150ms transition only. */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-150 disabled:opacity-50',
        checked ? 'bg-accent' : 'bg-border-strong',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-surface shadow-[var(--shadow-soft)] transition-transform duration-150',
          checked ? 'translate-x-[26px]' : 'translate-x-[4px]',
        )}
      />
    </button>
  );
}
