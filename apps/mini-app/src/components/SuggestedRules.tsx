import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useSuggestedRules } from '../hooks/suggestions';
import { useCreateRule } from '../hooks/rules';
import { formatRuleSummary } from '../lib/format';
import { haptic } from '../lib/tg';
import type { Rule } from '../types';

export function SuggestedRules() {
  const { data, isLoading } = useSuggestedRules();
  const create = useCreateRule();
  const navigate = useNavigate();

  if (isLoading || !data || data.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold text-tg-hint uppercase tracking-wider">
          AI Suggestions
        </h2>
        <span className="text-xs text-tg-hint">Based on your activity</span>
      </div>
      <div className="flex gap-3 overflow-x-auto -mx-5 px-5 pb-2 snap-x snap-mandatory">
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
              className="snap-start shrink-0 w-72 rounded-2xl bg-gradient-to-br from-violet-500/10 to-tg-secondary-bg p-4 space-y-3 ring-1 ring-violet-500/15"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <span className="text-xs font-semibold text-violet-700 uppercase tracking-wider">
                  Suggested
                </span>
              </div>
              <p className="text-sm leading-snug">{s.reason}</p>
              <p className="text-xs text-tg-hint font-medium">{formatRuleSummary(previewRule)}</p>
              <button
                onClick={async () => {
                  haptic('success');
                  await create.mutateAsync({
                    name: s.rule.name,
                    when: s.rule.when,
                    then: s.rule.then,
                  });
                  navigate('/');
                }}
                disabled={create.isPending}
                className="w-full rounded-xl bg-tg-button text-tg-button-text py-2 text-sm font-medium disabled:opacity-50"
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
