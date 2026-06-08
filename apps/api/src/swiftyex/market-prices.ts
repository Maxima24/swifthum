import { Logger } from '@nestjs/common';
import type { PriceMapMinor } from './swiftyex.port';
import { fetchCoingeckoPrices, FALLBACK_PRICES } from './coingecko-prices';
import { fetchCmcPrices } from './cmc-prices';
import { fetchSwiftyexRates } from './swiftyex-rates';

/**
 * The Watcher's market-data feed. Tries sources in order of fidelity and stops at
 * the first that yields live prices:
 *   0. swiftyex  — the real SwiftyEx /miniapp/rates (when SWIFTYEX_MINIAPP_BASE_URL set)
 *   1. coingecko — NGN direct (optional free demo key)
 *   2. cmc       — CoinMarketCap NGN direct (requires CMC_API_KEY)
 *   3. static    — last-resort constants (only if every network source is down)
 * Each layer is independent, so one provider's outage doesn't freeze the rules.
 */

export interface MarketPricesOptions {
  swiftyexRatesUrl?: string;
  coingeckoKey?: string;
  cmcKey?: string;
  logger?: Logger;
}

export interface MarketPricesResult {
  prices: PriceMapMinor;
  source: 'swiftyex' | 'coingecko' | 'cmc' | 'static';
}

export async function getMarketPrices(
  opts: MarketPricesOptions = {},
): Promise<MarketPricesResult> {
  // SwiftyEx /miniapp/rates currently prices only USDT (usdnaira). Overlay whatever
  // it provides on top of the base feed, which supplies the remaining assets.
  const sx = opts.swiftyexRatesUrl
    ? await fetchSwiftyexRates(opts.swiftyexRatesUrl, opts.logger)
    : null;

  const base = await getBasePrices(opts);

  if (sx && Object.keys(sx).length > 0) {
    opts.logger?.log(`prices: SwiftyEx overlay [${Object.keys(sx).join(',')}] on ${base.source}`);
    return { prices: { ...base.prices, ...sx }, source: 'swiftyex' };
  }
  return base;
}

/** CoinGecko → CoinMarketCap → static — the non-SwiftyEx base feed. */
async function getBasePrices(opts: MarketPricesOptions): Promise<MarketPricesResult> {
  const cg = await fetchCoingeckoPrices({ apiKey: opts.coingeckoKey, logger: opts.logger });
  if (cg.source === 'coingecko') return { prices: cg.prices, source: 'coingecko' };

  // CoinGecko failed — try CoinMarketCap (NGN direct) before giving up.
  const cmc = await fetchCmcPrices({ apiKey: opts.cmcKey, logger: opts.logger });
  if (cmc) {
    opts.logger?.warn('prices via CoinMarketCap');
    return { prices: cmc, source: 'cmc' };
  }

  opts.logger?.warn('ALL live price sources failed; using STATIC fallback prices');
  return { prices: { ...FALLBACK_PRICES }, source: 'static' };
}
