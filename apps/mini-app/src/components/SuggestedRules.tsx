import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSuggestedRules } from '../hooks/suggestions';
import { useCreateRule } from '../hooks/rules';
import { formatRuleSummary } from '../lib/format';
import { haptic } from '../lib/tg';
import type { Rule } from '../types';
import { Icon } from './Icon';

export function SuggestedRules() {
  const { data, isLoading } = useSuggestedRules();
  const create = useCreateRule();
  const navigate = useNavigate();

  if (isLoading || !data || data.length === 0) return null;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Icon name="sparkles" size={14} className="text-violet-500" />
          <h2 className="text-[11px] font-semibold text-tg-hint uppercase tracking-[0.12em]">
            AI suggestions
          </h2>
        </div>
        <span className="text-[11px] text-tg-hint">From your activity</span>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-2 snap-x snap-mandatory">
        {data.map((s, i) => {
          const previewRule: Rule = {
            id: 'preview_' + s.id,
            name: s.rule.name,
            when: s.rule.when,
            then: s.rule.then,
            state: 'sleeping',
            createdAt: '',
            firedCount: 0,
          };
          return (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06 }}
              className="snap-start shrink-0 w-72 rounded-2xl bg-gradient-to-br from-violet-500/[0.10] via-tg-secondary-bg to-tg-secondary-bg p-4 space-y-3 ring-1 ring-violet-500/15 relative overflow-hidden"
            >
              {/* Decorative sparkle */}
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.15, 1] }}
                transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                className="absolute top-3 right-3 text-violet-400"
              >
                <Icon name="sparkles" size={14} />
              </motion.div>

              <p className="text-sm leading-snug pr-5">{s.reason}</p>
              <p className="text-xs text-tg-hint font-medium leading-snug">
                {formatRuleSummary(previewRule)}
              </p>
              <button
                onClick={async () => {
                  haptic('success');
                  await create.mutateAsync({
                    name: s.rule.name,
                    when: s.rule.when,
                    then: s.rule.then,
                  });
                  navigate('/rules');
                }}
                disabled={create.isPending}
                className="w-full rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white py-2 text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform shadow-md shadow-violet-500/25"
              >
                {create.isPending ? 'Adding…' : 'Add this rule'}
              </button>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
