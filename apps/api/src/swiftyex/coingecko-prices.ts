import { Logger } from '@nestjs/common';
import type { PriceMapMinor } from './swiftyex.port';

/**
 * Shared CoinGecko price feed for the Watcher. Both the sandbox and live SwiftyEx
 * clients use this so real market prices reach the rule engine regardless of
 * SWIFTYEX_MODE (the live exchange's own price endpoint isn't published yet).
 *
 * Returns NGN minor units (kobo). An optional CoinGecko *demo* API key
 * (COINGECKO_API_KEY) is sent as `x-cg-demo-api-key`, which materially raises the
 * free rate limit and reliability — without it the public endpoint is easily
 * rate-limited (429) from a shared server IP, which silently drops us to the
 * static fallback and freezes the Watcher on wrong numbers.
 */

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 2;

export const COINGECKO_IDS: Record<keyof PriceMapMinor, string> = {
  USDT: 'tether',
  BTC: 'bitcoin',
  ETH: 'ethereum',
};

/** Last-resort values if CoinGecko is unreachable. Deliberately conservative. */
export const FALLBACK_PRICES: PriceMapMinor = {
  USDT: 1620_00n,
  BTC: 95_000_000_00n,
  ETH: 5_200_000_00n,
};

export interface PriceFetchResult {
  prices: PriceMapMinor;
  source: 'coingecko' | 'fallback';
}

export interface FetchPricesOptions {
  apiKey?: string;
  logger?: Logger;
}

export async function fetchCoingeckoPrices(
  opts: FetchPricesOptions = {},
): Promise<PriceFetchResult> {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `${COINGECKO_BASE}/simple/price?ids=${ids}&vs_currencies=ngn`;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (opts.apiKey) headers['x-cg-demo-api-key'] = opts.apiKey;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal, headers });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`coingecko http ${res.status}`);

      const body = (await res.json()) as Record<string, { ngn?: number }>;
      const prices: PriceMapMinor = { ...FALLBACK_PRICES };
      let got = 0;
      for (const [asset, geckoId] of Object.entries(COINGECKO_IDS)) {
        const major = body[geckoId]?.ngn;
        if (typeof major === 'number' && major > 0) {
          prices[asset as keyof PriceMapMinor] = BigInt(Math.round(major * 100));
          got++;
        }
      }
      if (got === 0) throw new Error('coingecko returned no usable NGN prices');
      return { prices, source: 'coingecko' };
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt < MAX_ATTEMPTS) {
        opts.logger?.warn(`coingecko attempt ${attempt} failed (${msg}); retrying`);
      } else {
        opts.logger?.warn(`coingecko unavailable (${msg}); trying fallback source`);
      }
    }
  }
  return { prices: { ...FALLBACK_PRICES }, source: 'fallback' };
}
