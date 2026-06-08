import { getMarketPrices } from './market-prices';
import { FALLBACK_PRICES } from './coingecko-prices';

/**
 * Drives the source-selection chain by routing global.fetch per URL.
 */
describe('getMarketPrices chain', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function routeFetch(handler: (url: string) => { ok?: boolean; status?: number; body: unknown }) {
    global.fetch = jest.fn(async (input: unknown) => {
      const url = String(input);
      const r = handler(url);
      return { ok: r.ok ?? true, status: r.status ?? 200, json: async () => r.body } as Response;
    }) as unknown as typeof fetch;
  }

  it('overlays the real SwiftyEx USDT (usdnaira) on the CoinGecko base for BTC/ETH', async () => {
    routeFetch((url) => {
      if (url.includes('miniapp/rates')) {
        return { body: { rates: [{ symbol: 'usdnaira', buy: '1355.00', sell: '1430.00' }] } };
      }
      if (url.includes('coingecko')) {
        return { body: { tether: { ngn: 1360 }, bitcoin: { ngn: 84_000_000 }, ethereum: { ngn: 2_240_000 } } };
      }
      throw new Error(`unexpected ${url}`);
    });
    const { source, prices } = await getMarketPrices({ swiftyexRatesUrl: 'https://sx.example' });
    expect(source).toBe('swiftyex');
    expect(prices.USDT).toBe(139_250n); // SwiftyEx mid of 1355/1430
    expect(prices.BTC).toBe(8_400_000_000n); // CoinGecko
    expect(prices.ETH).toBe(224_000_000n); // CoinGecko
  });

  it('falls back to the full CoinGecko base when SwiftyEx rates are unusable', async () => {
    routeFetch((url) => {
      if (url.includes('miniapp/rates')) return { body: { nonsense: true } };
      if (url.includes('coingecko')) {
        return { body: { tether: { ngn: 1360 }, bitcoin: { ngn: 84_000_000 }, ethereum: { ngn: 2_240_000 } } };
      }
      throw new Error(`unexpected ${url}`);
    });
    const { source } = await getMarketPrices({ swiftyexRatesUrl: 'https://sx.example' });
    expect(source).toBe('coingecko');
  });

  it('uses CoinGecko when it succeeds (no fallback calls)', async () => {
    routeFetch((url) => {
      if (url.includes('coingecko')) {
        return { body: { tether: { ngn: 1360 }, bitcoin: { ngn: 84_000_000 }, ethereum: { ngn: 2_240_000 } } };
      }
      throw new Error(`should not call ${url}`);
    });
    const { source, prices } = await getMarketPrices();
    expect(source).toBe('coingecko');
    expect(prices.USDT).toBe(136_000n);
  });

  it('falls through to CoinMarketCap when CoinGecko fails', async () => {
    routeFetch((url) => {
      if (url.includes('coingecko')) return { ok: false, status: 429, body: {} };
      if (url.includes('coinmarketcap')) {
        return {
          body: {
            data: {
              BTC: { quote: { NGN: { price: 84_000_000 } } },
              ETH: { quote: { NGN: { price: 2_240_000 } } },
              USDT: { quote: { NGN: { price: 1360 } } },
            },
          },
        };
      }
      throw new Error(`unexpected ${url}`);
    });
    const { source, prices } = await getMarketPrices({ cmcKey: 'cmc-key' });
    expect(source).toBe('cmc');
    expect(prices.BTC).toBe(8_400_000_000n);
  });

  it('uses static prices when CoinGecko fails and no CMC key is set', async () => {
    routeFetch((url) => {
      if (url.includes('coingecko')) return { ok: false, status: 429, body: {} };
      throw new Error(`unexpected ${url}`);
    });
    const { source, prices } = await getMarketPrices(); // no cmcKey → CMC skipped
    expect(source).toBe('static');
    expect(prices).toEqual(FALLBACK_PRICES);
  });

  it('uses static prices when every source fails', async () => {
    routeFetch(() => ({ ok: false, status: 500, body: {} }));
    const { source, prices } = await getMarketPrices({ cmcKey: 'cmc-key' });
    expect(source).toBe('static');
    expect(prices).toEqual(FALLBACK_PRICES);
  });
});
