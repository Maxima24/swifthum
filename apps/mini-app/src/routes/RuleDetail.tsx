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

export function RuleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: rule, isLoading } = useRule(id);
  const { data: executions = [] } = useRuleExecutions(id);
  const pause = usePauseRule();
  const resume = useResumeRule();
  const del = useDeleteRule();

  useBackButton(useCallback(() => navigate(-1), [navigate]));

  if (isLoading) {
    return (
      <div className="p-5 pt-10 space-y-4">
        <div className="h-8 w-3/5 rounded bg-tg-secondary-bg animate-pulse" />
        <div className="h-4 w-4/5 rounded bg-tg-secondary-bg animate-pulse" />
        <div className="h-28 rounded-2xl bg-tg-secondary-bg animate-pulse" />
      </div>
    );
  }

  if (!rule) {
    return (
      <div className="p-6 pt-12">
        <p className="text-tg-hint">Rule not found.</p>
        <button onClick={() => navigate('/')} className="mt-4 text-tg-link underline">
          Back to dashboard
        </button>
      </div>
    );
  }

  const togglePause = async () => {
    haptic('light');
    if (rule.state === 'paused') await resume.mutateAsync(rule.id);
    else await pause.mutateAsync(rule.id);
  };

  const remove = async () => {
    haptic('error');
    await del.mutateAsync(rule.id);
    navigate('/');
  };

  return (
    <div className="flex flex-col gap-6 p-5 pt-10 pb-32">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold leading-tight">{rule.name}</h1>
          <StateBadge state={rule.state} />
        </div>
        <p className="text-sm text-tg-hint leading-snug">{formatRuleSummary(rule)}</p>
      </motion.header>

      <section className="grid grid-cols-2 gap-3">
        <Stat label="Fired" value={`${rule.firedCount}×`} />
        <Stat label="Last checked" value={formatRelativeTime(rule.lastEvaluatedAt)} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-tg-hint uppercase tracking-wider">History</h2>
        {executions.length === 0 ? (
          <p className="text-sm text-tg-hint">Hasn't fired yet.</p>
        ) : (
          <ul className="space-y-2">
            {executions.map((e, i) => (
              <motion.li
                key={e.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-xl bg-tg-secondary-bg p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm">{formatRelativeTime(e.firedAt)}</p>
                  <p className="text-xs text-tg-hint">@ {formatPriceMinor(e.priceAtFireMinor)}</p>
                </div>
                <span className="text-xs text-emerald-700">{e.outcome}</span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 pt-4">
        <button
          onClick={togglePause}
          disabled={pause.isPending || resume.isPending}
          className="w-full rounded-xl bg-tg-secondary-bg py-3 font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {rule.state === 'paused' ? 'Resume rule' : 'Pause rule'}
        </button>
        <button
          onClick={remove}
          disabled={del.isPending}
          className="w-full rounded-xl bg-red-50 text-red-700 py-3 font-medium active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {del.isPending ? 'Deleting…' : 'Delete rule'}
        </button>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-tg-secondary-bg p-3">
      <p className="text-xs text-tg-hint uppercase tracking-wider">{label}</p>
      <p className="text-base font-medium mt-1">{value}</p>
    </div>
  );
}
