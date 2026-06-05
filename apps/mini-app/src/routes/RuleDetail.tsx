import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { usePriceSeries } from '../hooks/usePriceSeries';
import { Icon } from '../components/Icon';
import { PriceChart } from '../components/PriceChart';
import type { Execution, Rule } from '../types';
import {
  Header,
  Card,
  Button,
  ListGroup,
  ListRow,
  Skeleton,
  EmptyState,
} from '../ui';

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
      <>
        <Header back onBack={goBack} title="Rule" />
        <div className="flex flex-col gap-3 pt-5">
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-20" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </div>
      </>
    );
  }

  if (!rule) {
    return (
      <>
        <Header back onBack={goBack} title="Rule" />
        <EmptyState
          icon="alert"
          title="Rule not found"
          description="This rule no longer exists."
          action={
            <Button variant="secondary" onClick={goBack}>
              Back to rules
            </Button>
          }
        />
      </>
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
    navigate('/rules');
  };

  return (
    <>
      <Header back onBack={goBack} title={rule.name} right={<StateBadge state={rule.state} />} />

      <div className="flex flex-col gap-8 pt-5">
        <Card>
          <p className="text-[15px] font-medium leading-snug text-text-primary">
            {formatRuleSummary(rule)}
          </p>
        </Card>

        <Card>
          <RuleChart rule={rule} executions={executions} />
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Stat icon="zap" label="Fired" value={`${rule.firedCount}×`} />
          <Stat
            icon="clock"
            label="Last checked"
            value={formatRelativeTime(rule.lastEvaluatedAt)}
          />
        </div>

        {executions.length === 0 ? (
          <div>
            <h2 className="px-1 mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
              History
            </h2>
            <Card>
              <p className="text-sm text-text-secondary">Hasn't fired yet.</p>
            </Card>
          </div>
        ) : (
          <ListGroup title="History">
            {executions.map((e) => (
              <ListRow
                key={e.id}
                icon="check"
                iconTone="success"
                label={formatRelativeTime(e.firedAt)}
                subtitle={`@ ${formatPriceMinor(e.priceAtFireMinor)}`}
                trailing={
                  <span className="text-[12px] font-semibold text-success capitalize">
                    {e.outcome}
                  </span>
                }
              />
            ))}
          </ListGroup>
        )}

        <div className="flex flex-col gap-3">
          <Button
            variant="secondary"
            block
            icon={rule.state === 'paused' ? 'play' : 'pause'}
            disabled={pause.isPending || resume.isPending}
            onClick={togglePause}
          >
            {rule.state === 'paused' ? 'Resume rule' : 'Pause rule'}
          </Button>
          <Button
            variant="danger"
            block
            icon="trash"
            disabled={del.isPending}
            onClick={remove}
          >
            {del.isPending ? 'Deleting…' : 'Delete rule'}
          </Button>
        </div>
      </div>
    </>
  );
}

function RuleChart({ rule, executions }: { rule: Rule; executions: Execution[] }) {
  const { points, latest } = usePriceSeries(rule.when.asset);
  return (
    <PriceChart
      points={points}
      threshold={rule.when.priceMinor}
      op={rule.when.op}
      executions={executions}
      live={latest != null}
    />
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: 'zap' | 'clock';
  label: string;
  value: string;
}) {
  return (
    <Card padded={false} className="p-4 flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
        <Icon name={icon} size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-text-tertiary uppercase tracking-[0.1em] font-bold">
          {label}
        </p>
        <p className="font-display text-[17px] font-bold text-text-primary mt-0.5 truncate">{value}</p>
      </div>
    </Card>
  );
}
