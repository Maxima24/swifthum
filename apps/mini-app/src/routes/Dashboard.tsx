import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { RuleCard } from '../components/RuleCard';
import { EmptyState } from '../components/EmptyState';
import { SuggestedRules } from '../components/SuggestedRules';
import { useRules } from '../hooks/rules';
import { usePrices } from '../hooks/prices';
import { useMainButton } from '../hooks/useMainButton';
import { haptic } from '../lib/tg';
import { formatPriceMinor } from '../lib/format';
import type { RuleState } from '../types';

const ORDER: Record<RuleState, number> = {
  fired: 0,
  watching: 1,
  sleeping: 2,
  paused: 3,
};

export function Dashboard() {
  const navigate = useNavigate();
  const { data: rules = [], isLoading } = useRules();
  const { data: prices } = usePrices();

  const goNew = () => {
    haptic('medium');
    navigate('/rules/new');
  };

  useMainButton({ text: '+ New rule', onClick: goNew });

  const sorted = [...rules].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const usdt = prices?.USDT;

  return (
    <div className="flex flex-col gap-6 p-5 pt-10 pb-32">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <div className="flex items-center justify-between">
          <p className="text-tg-hint text-xs uppercase tracking-wider">The Watcher</p>
          <button
            onClick={() => {
              haptic('light');
              navigate('/settings');
            }}
            className="text-tg-hint text-xs underline-offset-2 hover:underline"
          >
            Settings
          </button>
        </div>
        <h1 className="text-2xl font-semibold">Your rules</h1>
        {usdt && (
          <p className="text-sm text-tg-hint">
            USDT is at{' '}
            <span className="text-tg-text font-medium">{formatPriceMinor(usdt)}</span>
          </p>
        )}
      </motion.header>

      <SuggestedRules />

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-tg-secondary-bg animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState
          title="No rules yet"
          description="Create your first rule to start auto-trading on SwiftyEx."
          action={
            <button
              onClick={goNew}
              className="rounded-xl bg-tg-button text-tg-button-text px-6 py-3 font-medium"
            >
              + Create rule
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {sorted.map((r, i) => (
              <li key={r.id}>
                <RuleCard rule={r} index={i} />
              </li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}
