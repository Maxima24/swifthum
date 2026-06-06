import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Icon, type IconName } from '../components/Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  iconRight?: IconName;
  block?: boolean;
  children?: ReactNode;
}

/*
 * One solid-accent primary per view. Everything else is secondary (outlined),
 * ghost (transparent), or danger. Press = scale 0.97 + 150ms ease-out, nothing
 * more. No gradients, no glow shadows.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-on-accent hover:bg-accent-hover disabled:opacity-40',
  secondary:
    'bg-transparent text-text-primary border border-border-strong hover:bg-surface-muted disabled:opacity-40',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface-muted hover:text-text-primary disabled:opacity-40',
  danger:
    'bg-danger-soft text-danger hover:brightness-95 disabled:opacity-40',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-5 text-sm rounded-xl',
  lg: 'h-[52px] px-6 text-[15px] rounded-2xl',
};

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  block,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold tracking-[0.01em]',
        'transition-[background-color,transform,opacity] duration-150 ease-out',
        'active:scale-[0.97] disabled:active:scale-100 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
    >
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === 'lg' ? 18 : 16} />}
    </button>
  );
}
