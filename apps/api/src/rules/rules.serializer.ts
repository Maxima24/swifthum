import type { Rule as PrismaRule, RuleExecution as PrismaExecution } from '@prisma/client';
import type { Action, Operator } from './rules.dto';
import type { Asset } from '../common/assets';

export interface ApiRule {
  id: string;
  name: string;
  when: { asset: Asset; op: Operator; priceMinor: bigint };
  then: { action: Action; amountMinor?: bigint; currency?: 'NGN' | Asset };
  state: 'sleeping' | 'watching' | 'fired' | 'paused';
  createdAt: string;
  lastEvaluatedAt?: string;
  firedCount: number;
}

export interface ApiExecution {
  id: string;
  ruleId: string;
  firedAt: string;
  priceAtFireMinor: bigint;
  outcome: 'success' | 'failed' | 'simulated';
  detail?: string;
}

export function toApiRule(r: PrismaRule): ApiRule {
  const then: ApiRule['then'] = { action: r.thenAction as Action };
  if (r.thenAmountMinor !== null && r.thenAmountMinor !== undefined) {
    then.amountMinor = r.thenAmountMinor;
  }
  if (r.thenCurrency) {
    then.currency = r.thenCurrency as 'NGN' | Asset;
  }
  return {
    id: r.id,
    name: r.name,
    when: {
      asset: r.whenAsset as Asset,
      op: r.whenOp as Operator,
      priceMinor: r.whenPriceMinor,
    },
    then,
    state: r.state as ApiRule['state'],
    createdAt: r.createdAt.toISOString(),
    lastEvaluatedAt: r.lastEvaluatedAt?.toISOString(),
    firedCount: r.firedCount,
  };
}

export function toApiExecution(e: PrismaExecution): ApiExecution {
  return {
    id: e.id,
    ruleId: e.ruleId,
    firedAt: e.firedAt.toISOString(),
    priceAtFireMinor: e.priceAtFireMinor,
    outcome: e.outcome as ApiExecution['outcome'],
    detail: e.detail ?? undefined,
  };
}
