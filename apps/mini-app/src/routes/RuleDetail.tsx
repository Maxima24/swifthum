import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  useDeleteRule,
  usePauseRule,
  useResumeRule,
  useRule,
  useRuleExecutions,
} from '../hooks/rules';
import { formatPriceMinor, formatRelativeTime, formatRuleSummary } from '../lib/format';
import { StateBadge } from '../components/StateBadge';
import { haptic } from '../lib/tg';
import { useBackButton } from '../hooks/useBackButton';
import { Header } from '../components/Header';
import { Icon } from '../components/Icon';
import { toast } from '../lib/toast';

export function RuleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: rule, isLoading } = useRule(id);
  const { data: executions = [] } = useRuleExecutions(id);
  const pause = usePauseRule();
  const resume = useResumeRule();
  const del = useDeleteRule();

  const goBack = useCallback(() => navigate('/rules'), [navigate]);
  useBackButton(goBack);

  if (isLoading) {
    return (
      <div className="flex flex-col pb-10">
        <Header back onBack={goBack} eyebrow="Rule" title="Loading…" />
        <div className="space-y-3 pt-5">
          <div className="h-4 w-4/5 rounded bg-tg-secondary-bg animate-pulse" />
          <div className="h-28 rounded-2xl bg-tg-secondary-bg animate-pulse" />
        </div>
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="flex flex-col pb-10">
        <Header back onBack={goBack} eyebrow="Rule" title="Not found" />
        <p className="text-tg-hint pt-5">This rule no longer exists.</p>
      </div>
    );
  }

  const togglePause = async () => {
    haptic('light');
    try {
      if (rule.state === 'paused') {
        await resume.mutateAsync(rule.id);
        toast.success('Rule resumed', rule.name);
      } else {
        await pause.mutateAsync(rule.id);
        toast.info('Rule paused', rule.name);
      }
    } catch (e: any) {
      toast.error('Action failed', String(e?.message ?? e));
    }
  };

  const remove = async () => {
    haptic('error');
    try {
      await del.mutateAsync(rule.id);
      toast.info('Rule deleted', rule.name);
      navigate('/rules');
    } catch (e: any) {
      toast.error('Could not delete', String(e?.message ?? e));
    }
  };

  return (
    <div className="flex flex-col pb-28 lg:pb-12">
      <Header
        back
        onBack={goBack}
        eyebrow="Rule"
        title={rule.name}
        right={<StateBadge state={rule.state} />}
        subtitle={<span className="text-[12px] leading-snug">{formatRuleSummary(rule)}</span>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-4 lg:gap-6 lg:pt-6">
        {/* Main column: stats + history */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          <section className="grid grid-cols-2 gap-3">
            <Stat icon="zap" label="Fired" value={`${rule.firedCount}×`} />
            <Stat
              icon="trending-up"
              label="Last checked"
              value={formatRelativeTime(rule.lastEvaluatedAt)}
            />
          </section>

          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em] px-1">
              History
            </h2>
            {executions.length === 0 ? (
              <p className="text-sm text-tg-hint rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-4">
                Hasn't fired yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {executions.map((e, i) => (
                  <motion.li
                    key={e.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Icon name="check" size={16} />
                      </div>
                      <div>
                        <p className="text-sm">{formatRelativeTime(e.firedAt)}</p>
                        <p className="text-xs text-tg-hint">
                          @ {formatPriceMinor(e.priceAtFireMinor)}
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] text-emerald-700 font-medium">{e.outcome}</span>
                  </motion.li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Side column on desktop: actions */}
        <aside className="space-y-2 lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em] px-1 lg:block hidden">
            Actions
          </h2>
          <button
            onClick={togglePause}
            disabled={pause.isPending || resume.isPending}
            className="w-full rounded-xl bg-tg-secondary-bg ring-1 ring-black/5 py-3 font-semibold active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Icon name={rule.state === 'paused' ? 'play' : 'pause'} size={16} />
            {rule.state === 'paused' ? 'Resume rule' : 'Pause rule'}
          </button>
          <button
            onClick={remove}
            disabled={del.isPending}
            className="w-full rounded-xl bg-red-50 text-red-700 py-3 font-semibold active:scale-[0.98] transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Icon name="trash" size={16} />
            {del.isPending ? 'Deleting…' : 'Delete rule'}
          </button>
        </aside>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: 'zap' | 'trending-up';
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-tg-secondary-bg ring-1 ring-black/5 p-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-brand-from/10 text-brand-from flex items-center justify-center">
        <Icon name={icon} size={18} />
      </div>
      <div>
        <p className="text-[10px] text-tg-hint uppercase tracking-[0.12em] font-medium">{label}</p>
        <p className="text-sm font-semibold mt-0.5">{value}</p>
      </div>
    </div>
  );
}
