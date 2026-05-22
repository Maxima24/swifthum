import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { Rule } from '../types';
import { formatRelativeTime, formatRuleSummary } from '../lib/format';
import { haptic } from '../lib/tg';
import { StateBadge } from './StateBadge';

export function RuleCard({ rule, index = 0 }: { rule: Rule; index?: number }) {
  const navigate = useNavigate();
  const dimmed = rule.state === 'paused';

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ delay: index * 0.04, duration: 0.25, ease: 'easeOut' }}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        haptic('light');
        navigate(`/rules/${rule.id}`);
      }}
      className={`w-full text-left rounded-2xl bg-tg-secondary-bg p-4 space-y-3 ${
        dimmed ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium leading-snug">{rule.name}</h3>
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
