import { motion } from 'framer-motion';
import type { RuleState } from '../types';

const STYLES: Record<RuleState, { label: string; className: string; pulse?: boolean }> = {
  sleeping: { label: 'Sleeping', className: 'bg-gray-200 text-gray-700' },
  watching: {
    label: 'Watching',
    className: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300/50',
    pulse: true,
  },
  fired: { label: 'Fired', className: 'bg-emerald-100 text-emerald-800' },
  paused: { label: 'Paused', className: 'bg-gray-100 text-gray-500' },
};

export function StateBadge({ state }: { state: RuleState }) {
  const { label, className, pulse } = STYLES[state];
  return (
    <motion.span
      animate={pulse ? { opacity: [1, 0.55, 1] } : undefined}
      transition={pulse ? { duration: 1.8, repeat: Infinity, ease: 'easeInOut' } : undefined}
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </motion.span>
  );
}
