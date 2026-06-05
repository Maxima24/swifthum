import { Logger } from '@nestjs/common';
import type { PriceMapMinor } from './swiftyex.port';
import { COINGECKO_IDS } from './coingecko-prices';

/**
 * CoinMarketCap price source — the Watcher's fallback when CoinGecko is throttled.
 * Returns all three assets' NGN prices in one keyed call (`convert=NGN`), which is
 * more reliable and simpler than composing a crypto-USD source with an FX rate.
 *
 * Requires a key (CMC has no keyless tier) — without one this returns null and the
 * orchestrator drops to static prices.
 */

const CMC_URL = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';
const TIMEOUT_MS = 5000;

// Reuse the canonical asset set; CMC keys its response by ticker symbol (BTC/ETH/USDT).
const SYMBOLS = Object.keys(COINGECKO_IDS) as Array<keyof PriceMapMinor>;

interface CmcQuote {
  quote?: { NGN?: { price?: number } };
}

export interface CmcPricesOptions {
  apiKey?: string;
  logger?: Logger;
}

export async function fetchCmcPrices(opts: CmcPricesOptions = {}): Promise<PriceMapMinor | null> {
  if (!opts.apiKey) {
    opts.logger?.warn('CMC_API_KEY not set — skipping CoinMarketCap fallback');
    return null;
  }

  const url = `${CMC_URL}?symbol=${SYMBOLS.join(',')}&convert=NGN`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json', 'X-CMC_PRO_API_KEY': opts.apiKey },
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`coinmarketcap http ${res.status}`);

    const body = (await res.json()) as { data?: Record<string, CmcQuote | CmcQuote[]> };
    const data = body.data ?? {};

    const prices = {} as PriceMapMinor;
    for (const sym of SYMBOLS) {
      // v1 keys each symbol to an object; v2 (and duplicate tickers) use an array.
      const raw = data[sym];
      const entry = Array.isArray(raw) ? raw[0] : raw;
      const major = entry?.quote?.NGN?.price;
      if (typeof major !== 'number' || !(major > 0)) {
        throw new Error(`coinmarketcap: missing NGN price for ${sym}`);
      }
      prices[sym] = BigInt(Math.round(major * 100));
    }
    return prices;
  } catch (err) {
    opts.logger?.warn(`coinmarketcap unavailable (${(err as Error).message})`);
    return null;
  }
}
