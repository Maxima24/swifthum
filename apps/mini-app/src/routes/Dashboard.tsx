import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { RuleCard } from '../components/RuleCard';
import { EmptyState } from '../components/EmptyState';
import { SuggestedRules } from '../components/SuggestedRules';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
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
    <div className="flex flex-col px-5 pb-28">
      <Header
        eyebrow="The Watcher"
        title="Your rules"
        subtitle={
          usdt && (
            <span className="inline-flex items-center gap-1">
              <Icon name="trending-up" size={12} className="text-emerald-500" />
              USDT{' '}
              <span className="text-tg-text font-semibold tabular-nums">
                {formatPriceMinor(usdt)}
              </span>
            </span>
          )
        }
        right={
          <button
            onClick={goNew}
            aria-label="New rule"
            className="inline-flex items-center gap-1 rounded-full bg-gradient-to-br from-brand-from to-brand-to text-white px-3 py-1.5 text-xs font-semibold shadow-sm shadow-brand-from/30 active:scale-95 transition-transform"
          >
            <Icon name="plus" size={14} strokeWidth={2.5} />
            New
          </button>
        }
      />

      <div className="flex flex-col gap-5 pt-4">
        <SuggestedRules />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl bg-tg-secondary-bg/60 animate-pulse"
              />
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <EmptyState
            icon="rules"
            title="No rules yet"
            description="Create your first rule and let it watch SwiftyEx for you."
            action={
              <button
                onClick={goNew}
                className="rounded-xl bg-gradient-to-br from-brand-from to-brand-to text-white px-6 py-3 font-semibold shadow-lg shadow-brand-from/30 active:scale-[0.98] transition-transform"
              >
                Create rule
              </button>
            }
          />
        ) : (
          <ul className="flex flex-col gap-2.5">
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
    </div>
  );
}
