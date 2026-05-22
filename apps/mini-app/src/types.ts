export type Asset = 'USDT' | 'BTC' | 'ETH';
export type Operator = 'lt' | 'gt' | 'crosses_above' | 'crosses_below';
export type Action = 'buy' | 'sell' | 'alert';
export type RuleState = 'sleeping' | 'watching' | 'fired' | 'paused';

export interface RuleCondition {
  asset: Asset;
  op: Operator;
  priceMinor: number;
}

export interface RuleAction {
  action: Action;
  amountMinor?: number;
  currency?: 'NGN' | Asset;
}

export interface Rule {
  id: string;
  name: string;
  when: RuleCondition;
  then: RuleAction;
  state: RuleState;
  createdAt: string;
  lastEvaluatedAt?: string;
  firedCount: number;
}

export interface Execution {
  id: string;
  ruleId: string;
  firedAt: string;
  priceAtFireMinor: number;
  outcome: 'success' | 'failed' | 'simulated';
  detail?: string;
}

export interface PriceMap {
  USDT?: number;
  BTC?: number;
  ETH?: number;
}
