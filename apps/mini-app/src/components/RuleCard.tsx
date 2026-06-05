import { useNavigate } from 'react-router-dom';
import type { Rule } from '../types';
import { formatRelativeTime, formatRuleSummary } from '../lib/format';
import { haptic } from '../lib/tg';
import { StateBadge } from './StateBadge';
import { Icon } from './Icon';
import { cn } from '../ui';

export function RuleCard({ rule }: { rule: Rule }) {
  const navigate = useNavigate();
  const dimmed = rule.state === 'paused';

  return (
    <button
      onClick={() => {
        haptic('light');
        navigate(`/rules/${rule.id}`);
      }}
      className={cn(
        'group relative overflow-hidden flex h-full w-full flex-col text-left rounded-2xl bg-surface border border-border shadow-[var(--shadow-soft)] p-4',
        'transition-colors duration-150 hover:border-border-strong active:scale-[0.99]',
        dimmed && 'opacity-60',
      )}
    >
      {/* Faint brand watermark, bleeding off the bottom-right corner. */}
      <img
        src="/mascot.png"
        alt=""
        aria-hidden="true"
        className="card-watermark pointer-events-none absolute -right-4 -bottom-5 w-24 h-auto select-none"
        draggable={false}
      />

      <div className="relative flex h-full flex-col">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-text-primary leading-snug min-w-0 line-clamp-2">
            {rule.name}
          </h3>
          <span className="shrink-0">
            <StateBadge state={rule.state} />
          </span>
        </div>

        <p className="text-[13px] text-text-secondary leading-snug line-clamp-2">
          {formatRuleSummary(rule)}
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-auto pt-3 text-[12px] text-text-tertiary">
          <span className="inline-flex items-center gap-1">
            <Icon name="zap" size={12} />
            {rule.firedCount > 0 ? `Fired ${rule.firedCount}×` : 'Never fired'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="clock" size={12} />
            {formatRelativeTime(rule.lastEvaluatedAt)}
          </span>
        </div>
      </div>
    </button>
  );
}
