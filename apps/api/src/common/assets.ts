/**
 * Single source of truth for the tradeable asset set. Everything that needs to
 * know "what assets exist" (rules validation, AI prompts, prices, the SwiftyEx
 * adapter) imports from here — do not re-declare the union anywhere else.
 */
export type Asset = 'USDT' | 'BTC' | 'ETH';

export const ASSETS: readonly Asset[] = ['USDT', 'BTC', 'ETH'] as const;

/** Mutable copy for APIs (e.g. class-validator `@IsIn`) that want a plain array. */
export const ASSET_VALUES: Asset[] = [...ASSETS];

export function isAsset(value: unknown): value is Asset {
  return typeof value === 'string' && (ASSETS as readonly string[]).includes(value);
}

/**
 * Crypto quantities are integer "base units" at 8 decimal places (like sats for
 * BTC). Keeps the no-floats discipline: 1 whole unit = 100_000_000 base units.
 */
export const QTY_DECIMALS = 8;
export const QTY_SCALE = 100_000_000n;
