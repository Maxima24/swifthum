import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { Rule } from '../types';
import { formatRelativeTime, formatRuleSummary } from '../lib/format';
import { haptic } from '../lib/tg';
import { StateBadge } from './StateBadge';

const ACCENT: Record<Rule['state'], string> = {
  fired: 'before:bg-gradient-to-b before:from-emerald-400 before:to-emerald-500',
  watching: 'before:bg-gradient-to-b before:from-amber-400 before:to-amber-500',
  sleeping: 'before:bg-slate-200',
  paused: 'before:bg-slate-100',
};

export function RuleCard({ rule, index = 0 }: { rule: Rule; index?: number }) {
  const navigate = useNavigate();
  const dimmed = rule.state === 'paused';

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: index * 0.04, duration: 0.28, ease: 'easeOut' }}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        haptic('light');
        navigate(`/rules/${rule.id}`);
      }}
      className={`relative w-full text-left rounded-2xl bg-tg-secondary-bg/90 backdrop-blur p-4 pl-5 space-y-3 ring-1 ring-black/5 shadow-sm shadow-black/[0.02] overflow-hidden
        before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-r-full ${ACCENT[rule.state]} ${
        dimmed ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold leading-snug">{rule.name}</h3>
        <StateBadge state={rule.state} />
      </div>
      <p className="text-sm text-tg-hint leading-snug">{formatRuleSummary(rule)}</p>
      <div className="flex items-center justify-between text-xs text-tg-hint">
        <span>{rule.firedCount > 0 ? `Fired ${rule.firedCount}×` : 'Never fired'}</span>
        <span>Checked {formatRelativeTime(rule.lastEvaluatedAt)}</span>
      </div>
    </motion.button>
  );
}
