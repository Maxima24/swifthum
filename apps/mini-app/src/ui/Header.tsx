import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from './cn';
import { Icon } from '../components/Icon';
import { haptic } from '../lib/tg';

interface Props {
  /** Hero title for top-level screens, e.g. "Your rules". */
  title: string;
  subtitle?: ReactNode;
  /** Renders a back chevron + smaller title (sub-screen variant). */
  back?: boolean;
  onBack?: () => void;
  /** Right-aligned action (e.g. New button). */
  right?: ReactNode;
}

/**
 * The ONE header. Top-level screens get a large hero title; sub-screens get a
 * back chevron + a sub-screen-sized title. No per-screen app bars, no glass.
 * Solid `bg` so content scrolling underneath stays legible.
 */
export function Header({ title, subtitle, back, onBack, right }: Props) {
  const navigate = useNavigate();
  const handleBack = () => {
    haptic('light');
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <header
      className={cn(
        'sticky top-0 z-20 -mx-5 px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 bg-bg border-b border-border',
        // Top-level headers are desktop-only — on mobile the brand bar + in-body
        // actions replace them. Sub-screen (back) headers show on every size.
        !back && 'hidden lg:block',
      )}
    >
      <div className="flex items-end justify-between gap-3 min-h-[60px] pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          {back && (
            <button
              onClick={handleBack}
              aria-label="Back"
              className="-ml-2 mr-0.5 p-2 rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary active:scale-[0.97]"
            >
              <Icon name="chevron-left" size={22} />
            </button>
          )}
          <div className="min-w-0">
            <h1
              className={cn(
                'font-display truncate font-bold tracking-[-0.02em] text-text-primary',
                back ? 'text-[23px]' : 'text-[30px] leading-tight',
              )}
            >
              {title}
            </h1>
            {subtitle && (
              <div className="text-[13px] text-text-secondary mt-0.5">{subtitle}</div>
            )}
          </div>
        </div>
        {right && <div className="shrink-0 pb-0.5">{right}</div>}
      </div>
    </header>
  );
}
