import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react';
import { cn } from './cn';
import { Icon } from '../components/Icon';

/** Labelled form group. Caption-sized label above the control. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-text-secondary mb-2">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-text-tertiary mt-1.5">{hint}</span>}
    </label>
  );
}

const CONTROL =
  'w-full h-12 rounded-xl bg-surface-muted border border-border px-4 text-[15px] text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-accent focus:bg-surface';

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(CONTROL, className)} />;
}

/** Large centered numeric input — used for amount entry. */
export function AmountInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cn(
        'font-display w-full rounded-2xl bg-surface-muted border border-border px-4 py-6 text-4xl font-bold tracking-[-0.02em] text-center tnum text-text-primary outline-none transition-colors focus:border-accent focus:bg-surface',
        className,
      )}
    />
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className,
  ...rest
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'>) {
  return (
    <div className="relative">
      <select
        {...rest}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className={cn(CONTROL, 'appearance-none pr-10 cursor-pointer', className)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-right"
        size={16}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rotate-90 text-text-tertiary"
      />
    </div>
  );
}
