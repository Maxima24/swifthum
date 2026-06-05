import { fetchCoingeckoPrices, FALLBACK_PRICES } from './coingecko-prices';

/**
 * Exercises the shared price feed by stubbing global.fetch. No network.
 */
describe('fetchCoingeckoPrices', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  function mockFetchOnce(body: unknown, ok = true, status = 200) {
    global.fetch = jest.fn().mockResolvedValue({
      ok,
      status,
      json: async () => body,
    }) as unknown as typeof fetch;
  }

  it('maps NGN major units → minor units (×100)', async () => {
    mockFetchOnce({
      tether: { ngn: 1359.78 },
      bitcoin: { ngn: 84_756_375 },
      ethereum: { ngn: 2_284_677 },
    });
    const { prices, source } = await fetchCoingeckoPrices();
    expect(source).toBe('coingecko');
    expect(prices.USDT).toBe(135_978n); // 1359.78 × 100
    expect(prices.BTC).toBe(8_475_637_500n);
    expect(prices.ETH).toBe(228_467_700n);
  });

  it('sends the demo API key header when provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tether: { ngn: 1000 }, bitcoin: { ngn: 1 }, ethereum: { ngn: 1 } }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    await fetchCoingeckoPrices({ apiKey: 'cg-demo-xyz' });
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['x-cg-demo-api-key']).toBe('cg-demo-xyz');
  });

  it('falls back to static prices on HTTP error', async () => {
    mockFetchOnce({}, false, 429);
    const { prices, source } = await fetchCoingeckoPrices();
    expect(source).toBe('fallback');
    expect(prices).toEqual(FALLBACK_PRICES);
  });

  it('falls back when the body has no usable prices', async () => {
    mockFetchOnce({ tether: {}, bitcoin: {}, ethereum: {} });
    const { source } = await fetchCoingeckoPrices();
    expect(source).toBe('fallback');
  });

  it('falls back when fetch throws (e.g. timeout)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('aborted')) as unknown as typeof fetch;
    const { prices, source } = await fetchCoingeckoPrices();
    expect(source).toBe('fallback');
    expect(prices).toEqual(FALLBACK_PRICES);
  });
});
