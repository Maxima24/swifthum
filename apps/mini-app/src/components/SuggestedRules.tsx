import { useNavigate } from 'react-router-dom';
import { useSuggestedRules } from '../hooks/suggestions';
import { useCreateRule } from '../hooks/rules';
import { formatRuleSummary } from '../lib/format';
import { haptic } from '../lib/tg';
import type { Rule } from '../types';
import { Icon } from './Icon';
import { Button } from '../ui';

export function SuggestedRules() {
  const { data, isLoading } = useSuggestedRules();
  const create = useCreateRule();
  const navigate = useNavigate();

  if (isLoading || !data || data.length === 0) return null;

  return (
    <section>
      <div className="flex items-center gap-1.5 px-1 mb-2">
        <Icon name="sparkles" size={14} className="text-text-tertiary" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
          Suggested for you
        </h2>
      </div>

      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pb-1 snap-x snap-mandatory">
        {data.map((s) => {
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
            <div
              key={s.id}
              className="snap-start shrink-0 w-[82%] sm:w-72 rounded-2xl bg-surface border border-border shadow-[var(--shadow-soft)] p-4 flex flex-col"
            >
              <p className="text-[14px] font-semibold text-text-primary leading-snug">
                {s.reason}
              </p>
              <p className="text-[12px] text-text-secondary leading-snug mt-1.5 flex-1">
                {formatRuleSummary(previewRule)}
              </p>
              <Button
                className="mt-3"
                variant="secondary"
                block
                icon="plus"
                disabled={create.isPending}
                onClick={async () => {
                  haptic('success');
                  await create.mutateAsync({
                    name: s.rule.name,
                    when: s.rule.when,
                    then: s.rule.then,
                  });
                  navigate('/rules');
                }}
              >
                {create.isPending ? 'Adding…' : 'Add rule'}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
