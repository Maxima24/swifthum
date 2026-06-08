import { Logger } from '@nestjs/common';
import type { PriceMapMinor } from './swiftyex.port';

/**
 * Fetch the public SwiftyEx `/miniapp/rates` and map it to the Watcher's
 * `PriceMapMinor` (NGN minor units for USDT/BTC/ETH). The exact response shape is
 * upstream-owned, so the parser is deliberately permissive (array or object;
 * buy/sell/rate/price fields) and **returns null on anything it can't confidently
 * map** — the caller then falls back to CoinGecko, so the Watcher never breaks.
 *
 * On the first successful fetch it logs the raw payload once, so the real shape
 * can be confirmed and this parser tuned if needed.
 */
const TIMEOUT_MS = 3000;
const ASSET_ALIASES: Record<string, keyof PriceMapMinor> = {
  USDT: 'USDT',
  TETHER: 'USDT',
  BTC: 'BTC',
  BITCOIN: 'BTC',
  XBT: 'BTC',
  ETH: 'ETH',
  ETHEREUM: 'ETH',
};

let loggedRawOnce = false;

export async function fetchSwiftyexRates(
  baseUrl: string,
  logger?: Logger,
): Promise<PriceMapMinor | null> {
  const url = baseUrl.replace(/\/$/, '');
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/miniapp/rates`, { signal: controller.signal });
    if (!res.ok) return null;
    const raw: unknown = await res.json();
    if (!loggedRawOnce) {
      loggedRawOnce = true;
      logger?.log(`SwiftyEx /miniapp/rates raw shape: ${JSON.stringify(raw).slice(0, 500)}`);
    }
    return parseRates(raw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Exported for unit testing against sample payloads. */
export function parseRates(raw: unknown): PriceMapMinor | null {
  const entries = toEntries(raw);
  if (!entries.length) return null;

  const found: Partial<Record<keyof PriceMapMinor, bigint>> = {};
  for (const [keyHint, value] of entries) {
    const asset = ASSET_ALIASES[String(keyHint).toUpperCase()];
    if (!asset || found[asset] !== undefined) continue;
    const ngn = pickNgn(value);
    if (ngn !== null && ngn > 0) found[asset] = BigInt(Math.round(ngn * 100));
  }

  if (found.USDT === undefined || found.BTC === undefined || found.ETH === undefined) {
    return null;
  }
  return { USDT: found.USDT, BTC: found.BTC, ETH: found.ETH };
}

/** Normalize array-of-objects OR an object map into [assetHint, valueObject] pairs. */
function toEntries(raw: unknown): Array<[string, unknown]> {
  if (Array.isArray(raw)) {
    return raw.map((item) => {
      const o = (item ?? {}) as Record<string, unknown>;
      const hint = o.asset ?? o.symbol ?? o.currency ?? o.code ?? o.name ?? '';
      return [String(hint), item] as [string, unknown];
    });
  }
  if (raw && typeof raw === 'object') {
    // Could be { data: [...] } / { rates: {...} } or a direct asset-keyed map.
    const o = raw as Record<string, unknown>;
    if (Array.isArray(o.data)) return toEntries(o.data);
    if (o.rates) return toEntries(o.rates);
    return Object.entries(o);
  }
  return [];
}

/** Pull an NGN price from a rate entry — number or numeric string in buy/rate/price/sell. */
function pickNgn(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const n = Number(value.replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    for (const k of ['buy', 'buy_rate', 'rate', 'price', 'ngn', 'sell', 'sell_rate']) {
      const n = pickNgn(o[k]);
      if (n !== null) return n;
    }
  }
  return null;
}
