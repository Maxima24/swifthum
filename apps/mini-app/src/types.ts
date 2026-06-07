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

/** GET /users/lookup?username= — resolve a @handle to a SwiftHum user. */
export interface UserLookupResult {
  found: boolean;
  displayName?: string;
  username?: string;
}

/** POST /transfers — direct wallet → wallet send to a @username. */
export interface SendToUserResult {
  status: 'ok';
  transferId: string;
  amountMinor: number;
  currency: 'NGN';
  recipient: { displayName: string };
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

// ─── Verifiable Receipts ─────────────────────────────────────────

export type ReceiptSourceType = 'payment' | 'gift' | 'escrow';

/** An item in GET /receipts — the caller's receipts with shareable links. */
export interface ReceiptListItem {
  id: string;
  sourceType: ReceiptSourceType;
  direction: TransferDirection;
  amountMinor: number;
  currency: string;
  counterparty: { displayName: string };
  url: string; // https://<miniapp>/r/<id>?token=<token>
  token: string;
  createdAt: string;
}

/** Response of GET /receipts/verify?token=… (public). */
export interface ReceiptVerifyResult {
  valid: boolean;
  reason?: string;
  receipt?: {
    id: string;
    sourceType: ReceiptSourceType;
    amountMinor: number;
    asset: string;
    from: string;
    to: string;
    createdAt: string;
  };
}

// ─── P2P Escrow ──────────────────────────────────────────────────

export type EscrowState =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'PAID_MARKED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED'
  | 'RESOLVED_RELEASED'
  | 'RESOLVED_REFUNDED';

export type EscrowRole = 'buyer' | 'seller' | 'observer';

/** Response of POST /escrows — a freshly created, funded escrow. */
export interface EscrowCreated {
  escrowId: string;
  joinCode: string;
  deepLink: string;
  amountMinor: number;
  currency: string;
  terms?: string;
  state: EscrowState;
  ttlExpiresAt: string;
  createdAt: string;
}

/** Viewer-relative escrow summary (list items, action responses). */
export interface EscrowSummary {
  id: string;
  role: EscrowRole;
  state: EscrowState;
  amountMinor: number;
  currency: string;
  terms?: string;
  counterparty?: { displayName: string };
  ttlExpiresAt: string;
  createdAt: string;
  deepLink?: string; // present for the creator while still PROPOSED
}

export interface EscrowEventItem {
  type: string;
  actorId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface EscrowDetail extends EscrowSummary {
  events: EscrowEventItem[];
}

export interface CreateEscrowInput {
  amountMinor: number;
  terms?: string;
}

export type EscrowAction =
  | 'accept'
  | 'decline'
  | 'cancel'
  | 'mark-paid'
  | 'release'
  | 'dispute';

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
