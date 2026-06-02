import type { Asset } from '../common/assets';

/**
 * DI token for the active SwiftyEx implementation. A factory in SwiftyexModule
 * binds this to either the sandbox or the live client based on SWIFTYEX_MODE.
 * Nothing outside the adapter should know which is bound.
 */
export const SWIFTYEX_CLIENT = Symbol('SWIFTYEX_CLIENT');

export type OrderSide = 'buy' | 'sell';

/**
 * `simulated` is a first-class status (the sandbox emits it) so consumers map
 * order results to execution outcomes uniformly — no one inspects which adapter
 * is active. `pending` is reserved for a future async live fill.
 */
export type OrderStatus = 'success' | 'failed' | 'simulated' | 'pending';

export type PriceMapMinor = { USDT: bigint; BTC: bigint; ETH: bigint };

export interface OrderRequest {
  side: OrderSide;
  asset: Asset;
  amountMinor: bigint; // NGN minor units (kobo) to spend on buy / notional on sell
  currency: 'NGN' | Asset;
  userId: string;
}

export interface OrderResult {
  orderId: string;
  status: OrderStatus;
  side: OrderSide;
  asset: Asset;
  amountMinor: bigint;
  filledPriceMinor?: bigint; // NGN minor units per whole asset unit
  filledQtyBase?: bigint; // asset base units (8 dp), see QTY_SCALE
  errorMessage?: string;
}

export interface Holding {
  asset: Asset;
  qtyBase: bigint;
}

/** Account status as exposed to clients — never includes the secret credential. */
export interface AccountStatus {
  linked: boolean;
  label?: string;
  linkedAt?: string;
}

/**
 * The complete SwiftyEx boundary. The sandbox implements all of it (so the app
 * runs end-to-end pre-keys); the live client implements the same surface against
 * the real HTTP API. Per-user authentication is resolved *inside* the adapter
 * from `userId` — callers never handle credentials.
 */
export interface SwiftyexPort {
  // market data — no per-user auth (live uses the app-level key)
  currentPrices(): Promise<PriceMapMinor>;

  // trading — per-user auth resolved internally via req.userId / userId
  placeOrder(req: OrderRequest): Promise<OrderResult>;
  getOrder(userId: string, orderId: string): Promise<OrderResult | null>;

  // portfolio
  getHoldings(userId: string): Promise<Holding[]>;

  // account linking
  linkAccount(userId: string, credential: string): Promise<AccountStatus>;
  unlinkAccount(userId: string): Promise<void>;
  getAccount(userId: string): Promise<AccountStatus>;
}

/** Integer fill math: base units = amountMinor * 10^8 / priceMinor. */
export function computeFilledQtyBase(amountMinor: bigint, priceMinor: bigint): bigint {
  if (priceMinor <= 0n) return 0n;
  // QTY_SCALE inlined to avoid a circular import with common/assets at module load
  return (amountMinor * 100_000_000n) / priceMinor;
}
