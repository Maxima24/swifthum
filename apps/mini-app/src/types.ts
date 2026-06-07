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
  notificationsEnabled?: boolean;
}

export interface UserPreferences {
  notificationsEnabled: boolean;
}

export interface PaymentIntent {
  intentId: string;
  token: string;
  amountMinor: number;
  currency: 'NGN';
  expiresAt: string;
  riskScore: number;
}

export interface IntentStatus {
  status: 'pending' | 'completed' | 'refunded' | 'expired';
  amountMinor: number;
  currency: 'NGN';
  expiresAt: string;
  counterparty?: { displayName: string };
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

// ─── Gift Links ──────────────────────────────────────────────────

export type GiftState = 'UNCLAIMED' | 'CLAIMED' | 'EXPIRED' | 'RECLAIMED';

/** Response of POST /gifts — a freshly created, shareable gift. */
export interface Gift {
  giftId: string;
  claimCode: string;
  deepLink: string; // https://t.me/<bot>?start=gift_<claimCode>
  amountMinor: number;
  currency: 'NGN';
  message?: string;
  state: GiftState;
  ttlExpiresAt: string;
  createdAt: string;
}

/** An item in GET /gifts — the caller's sent gifts with their state. */
export interface GiftListItem {
  id: string;
  amountMinor: number;
  currency: 'NGN';
  message?: string;
  state: GiftState;
  claimCode: string;
  deepLink: string;
  ttlExpiresAt: string;
  createdAt: string;
  claimedAt?: string;
  claimedBy?: { displayName: string };
}

export interface CreateGiftInput {
  amountMinor: number;
  message?: string;
}

// ─── SwiftyEx account / portfolio ────────────────────────────────

export interface SwiftyexAccountStatus {
  linked: boolean;
  label?: string;
  linkedAt?: string;
}

export interface SwiftyexHolding {
  asset: Asset;
  qtyBase: number; // 8-decimal base units (backend serializes bigint → number)
}
