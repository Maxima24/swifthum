import { motion } from 'framer-motion';
import type { RuleState } from '../types';
import { Icon, type IconName } from './Icon';

const STYLES: Record<
  RuleState,
  { label: string; className: string; pulse?: boolean; icon: IconName }
> = {
  sleeping: {
    label: 'Sleeping',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    icon: 'sleep',
  },
  watching: {
    label: 'Watching',
    className:
      'bg-amber-50 text-amber-700 ring-1 ring-amber-200 animate-pulse-glow',
    pulse: true,
    icon: 'sun',
  },
  fired: {
    label: 'Fired',
    className:
      'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    icon: 'zap',
  },
  paused: {
    label: 'Paused',
    className: 'bg-slate-100 text-slate-400 ring-1 ring-slate-200',
    icon: 'pause',
  },
};

export function StateBadge({ state }: { state: RuleState }) {
  const { label, className, pulse, icon } = STYLES[state];
  return (
    <motion.span
      animate={pulse ? { opacity: [1, 0.7, 1] } : undefined}
      transition={pulse ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${className}`}
    >
      <Icon name={icon} size={11} />
      {label}
    </motion.span>
  );
}
