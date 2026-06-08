/**
 * Defensive normalizers for the SwiftyEx Mini App API responses. The exact JSON
 * shapes are upstream-owned, so these accept arrays, `{data:[…]}`, or asset-keyed
 * objects and pull common field-name variants. Anything unrecognized → empty list.
 */

export interface SxWallet {
  asset?: string;
  balance?: string;
  address?: string;
  blockchain?: string;
}

export interface SxRate {
  asset?: string;
  buy?: string;
  sell?: string;
}

export function field(o: unknown, ...keys: string[]): unknown {
  if (!o || typeof o !== 'object') return undefined;
  const rec = o as Record<string, unknown>;
  for (const k of keys) if (rec[k] != null && rec[k] !== '') return rec[k];
  return undefined;
}

function asStr(v: unknown): string | undefined {
  return v == null ? undefined : String(v);
}

/** Coerce array / {data:[…]} / {wallets:[…]} / asset-keyed object → array of items. */
function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['data', 'wallets', 'rates', 'results', 'items']) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
    // asset-keyed map: { USDT: {...}, BTC: {...} }
    return Object.entries(o).map(([key, val]) =>
      val && typeof val === 'object' ? { asset: key, ...(val as object) } : { asset: key, value: val },
    );
  }
  return [];
}

export function normalizeWallets(raw: unknown): SxWallet[] {
  return asArray(raw).map((item) => ({
    asset: asStr(field(item, 'wallet_type', 'asset', 'symbol', 'currency', 'code')),
    balance: asStr(field(item, 'balance', 'amount', 'available', 'value')),
    address: asStr(field(item, 'deposit_address', 'address', 'wallet_address')),
    blockchain: asStr(field(item, 'blockchain', 'network', 'chain')),
  }));
}

export function normalizeRates(raw: unknown): SxRate[] {
  return asArray(raw)
    .map((item) => ({
      asset: asStr(field(item, 'asset', 'symbol', 'currency', 'code', 'name')),
      buy: asStr(field(item, 'buy', 'buy_rate', 'rate', 'price')),
      sell: asStr(field(item, 'sell', 'sell_rate')),
    }))
    .filter((r) => r.asset);
}
