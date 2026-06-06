import type { RuleState } from '../types';
import { Badge } from '../ui';
import type { IconName } from './Icon';

const STYLES: Record<
  RuleState,
  { label: string; tone: 'accent' | 'success' | 'warning' | 'muted'; icon: IconName }
> = {
  sleeping: { label: 'Sleeping', tone: 'muted', icon: 'sleep' },
  watching: { label: 'Watching', tone: 'warning', icon: 'activity' },
  fired: { label: 'Fired', tone: 'success', icon: 'zap' },
  paused: { label: 'Paused', tone: 'muted', icon: 'pause' },
};

export function StateBadge({ state }: { state: RuleState }) {
  const { label, tone, icon } = STYLES[state];
  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}
