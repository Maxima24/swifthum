import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { haptic } from '../lib/tg';

interface Props {
  eyebrow?: string;
  title: string;
  right?: ReactNode;
  subtitle?: ReactNode;
  back?: boolean;
  onBack?: () => void;
}

export function Header({ eyebrow, title, right, subtitle, back, onBack }: Props) {
  const navigate = useNavigate();
  const handleBack = () => {
    haptic('light');
    if (onBack) onBack();
    else navigate(-1);
  };

  return (
    <header className="sticky top-0 z-20 -mx-5 px-5 pt-3 pb-2 bg-tg-bg/92 backdrop-blur-xl border-b border-black/[0.04] lg:-mx-8 lg:px-8">
      <div className="flex items-center justify-between gap-3 min-h-[40px]">
        <div className="flex items-center gap-1 min-w-0">
          {back && (
            <button
              onClick={handleBack}
              aria-label="Back"
              className="-ml-2 p-2 rounded-lg text-tg-hint hover:text-tg-text hover:bg-tg-secondary-bg/60 active:scale-95 transition-all"
            >
              <Icon name="chevron-left" size={20} />
            </button>
          )}
          <div className="min-w-0 leading-tight">
            {eyebrow && (
              <p className="text-tg-hint text-[10px] uppercase tracking-[0.12em] font-semibold mb-0.5">
                {eyebrow}
              </p>
            )}
            <h1 className="text-[17px] font-semibold truncate">{title}</h1>
            {subtitle && (
              <div className="text-[12px] text-tg-hint mt-0.5">{subtitle}</div>
            )}
          </div>
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
