// ─── The Watcher (rules) ─────────────────────────────────────────

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

// ─── Payments (ultrasonic) ───────────────────────────────────────

export interface Wallet {
  balanceMinor: number;
  currency: 'NGN';
}

export interface PaymentIntent {
  intentId: string;
  token: string;
  amountMinor: number;
  currency: 'NGN';
  expiresAt: string;
  riskScore: number;
}

export interface RedemptionResult {
  status: 'ok';
  intentId: string;
  amountMinor: number;
  currency: 'NGN';
  sender: { displayName: string };
}

export type TransferDirection = 'sent' | 'received';

export interface Transaction {
  id: string;
  direction: TransferDirection;
  amountMinor: number;
  currency: 'NGN';
  counterparty: { displayName: string };
  settledAt: string;
}
