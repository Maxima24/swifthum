import { fetchCmcPrices } from './cmc-prices';

/**
 * Stubs global.fetch — no network. Exercises the CoinMarketCap parse + guards.
 */
describe('fetchCmcPrices', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetchOnce(body: unknown, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  const okBody = {
    data: {
      BTC: { quote: { NGN: { price: 84_000_000 } } },
      ETH: { quote: { NGN: { price: 2_240_000 } } },
      USDT: { quote: { NGN: { price: 1360 } } },
    },
  };

  it('returns null (and does not call fetch) without an API key', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    expect(await fetchCmcPrices()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps quote.NGN.price → minor units (×100)', async () => {
    mockFetchOnce(okBody);
    const prices = await fetchCmcPrices({ apiKey: 'cmc-key' });
    expect(prices).not.toBeNull();
    expect(prices!.BTC).toBe(8_400_000_000n);
    expect(prices!.ETH).toBe(224_000_000n);
    expect(prices!.USDT).toBe(136_000n);
  });

  it('sends the X-CMC_PRO_API_KEY header', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => okBody });
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchCmcPrices({ apiKey: 'secret-key' });
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['X-CMC_PRO_API_KEY']).toBe('secret-key');
  });

  it('handles the v2-style array-per-symbol shape', async () => {
    mockFetchOnce({
      data: {
        BTC: [{ quote: { NGN: { price: 84_000_000 } } }],
        ETH: [{ quote: { NGN: { price: 2_240_000 } } }],
        USDT: [{ quote: { NGN: { price: 1360 } } }],
      },
    });
    const prices = await fetchCmcPrices({ apiKey: 'cmc-key' });
    expect(prices!.BTC).toBe(8_400_000_000n);
  });

  it('returns null on HTTP error', async () => {
    mockFetchOnce({}, false, 401);
    expect(await fetchCmcPrices({ apiKey: 'cmc-key' })).toBeNull();
  });

  it('returns null when a symbol is missing a price', async () => {
    mockFetchOnce({ data: { BTC: { quote: { NGN: { price: 1 } } }, ETH: {}, USDT: {} } });
    expect(await fetchCmcPrices({ apiKey: 'cmc-key' })).toBeNull();
  });
});
