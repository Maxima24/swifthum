import { useNavigate } from 'react-router-dom';
import { RuleCard } from '../components/RuleCard';
import { SuggestedRules } from '../components/SuggestedRules';
import { Icon, type IconName } from '../components/Icon';
import { useRules } from '../hooks/rules';
import { usePrices } from '../hooks/prices';
import { useMainButton } from '../hooks/useMainButton';
import { useViewMode } from '../hooks/useViewMode';
import { haptic } from '../lib/tg';
import { formatPriceMinor } from '../lib/format';
import type { Rule, RuleState } from '../types';
import { Header, Button, ViewToggle, EmptyState, Skeleton } from '../ui';

// Grid: 2-up on phones, 3 columns on large desktop. List: single column.
const CONTAINER = {
  list: 'flex flex-col gap-3',
  grid: 'grid grid-cols-2 xl:grid-cols-3 gap-3',
} as const;

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
  const { mode, setMode } = useViewMode();

  const goNew = () => {
    haptic('medium');
    navigate('/rules/new');
  };

  useMainButton({ text: '+ New rule', onClick: goNew });

  const sorted = [...rules].sort((a, b) => ORDER[a.state] - ORDER[b.state]);
  const stats = summarize(rules);
  const usdt = prices?.USDT;

  return (
    <>
      <Header
        title="Your rules"
        subtitle={
          usdt && (
            <span className="inline-flex items-center gap-1 tnum">
              <Icon name="trending-up" size={13} className="text-success" />
              USDT
              <span className="font-semibold text-text-primary">{formatPriceMinor(usdt)}</span>
            </span>
          )
        }
        right={
          <Button icon="plus" onClick={goNew}>
            New
          </Button>
        }
      />

      <div className="flex flex-col gap-8 pt-5">
        <section className="grid grid-cols-3 gap-3">
          <StatTile
            icon="activity"
            tone="warning"
            label="Watching"
            value={stats.watching}
            loading={isLoading}
          />
          <StatTile
            icon="zap"
            tone="success"
            label="Fired"
            value={stats.fired}
            loading={isLoading}
          />
          <StatTile
            icon="rules"
            tone="accent"
            label="Total"
            value={stats.total}
            loading={isLoading}
          />
        </section>

        <SuggestedRules />

        <section>
          <div className="flex items-center gap-3 mb-3 px-1">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary mr-auto">
              {isLoading ? 'Your rules' : `Your rules · ${stats.total}`}
            </h2>
            {sorted.length > 0 && <ViewToggle mode={mode} onChange={setMode} />}
            {/* The top-level Header (with New) is desktop-only, so surface New
                here on mobile. */}
            <span className="lg:hidden">
              <Button icon="plus" onClick={goNew}>
                New
              </Button>
            </span>
          </div>

          {isLoading ? (
            <div className={CONTAINER[mode]}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[104px]" />
              ))}
            </div>
          ) : sorted.length === 0 ? (
            <EmptyState
              icon="rules"
              title="No rules yet"
              description="Create your first rule and let it watch SwiftyEx for you."
              action={
                <Button size="lg" icon="plus" onClick={goNew}>
                  Create rule
                </Button>
              }
            />
          ) : (
            <ul className={CONTAINER[mode]}>
              {sorted.map((r) => (
                <li key={r.id} className="min-w-0">
                  <RuleCard rule={r} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function summarize(rules: Rule[]) {
  return {
    total: rules.length,
    watching: rules.filter((r) => r.state === 'watching').length,
    fired: rules.reduce((n, r) => n + r.firedCount, 0),
  };
}

function StatTile({
  icon,
  tone,
  label,
  value,
  loading,
}: {
  icon: IconName;
  tone: 'accent' | 'success' | 'warning';
  label: string;
  value: number;
  loading?: boolean;
}) {
  const TONE: Record<'accent' | 'success' | 'warning', string> = {
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
  };
  return (
    <div className="rounded-2xl bg-surface border border-border shadow-[var(--shadow-soft)] p-4 flex flex-col">
      <div className="flex items-center justify-between">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center ${TONE[tone]}`}>
          <Icon name={icon} size={18} />
        </span>
      </div>
      {loading ? (
        <Skeleton className="h-9 w-10 mt-3" />
      ) : (
        <p className="font-display text-[34px] sm:text-[40px] font-bold leading-none tracking-[-0.02em] tnum text-text-primary mt-3">
          {value}
        </p>
      )}
      <p className="text-[11px] text-text-tertiary font-bold uppercase tracking-[0.1em] mt-2">
        {label}
      </p>
    </div>
  );
}
