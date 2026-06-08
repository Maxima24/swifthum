import { parseRates } from './swiftyex-rates';

describe('parseRates', () => {
  it('maps the live usdnaira-only shape → partial { USDT } using the buy/sell mid', () => {
    // {"rates":[{"symbol":"usdnaira","buy":"1355.00","sell":"1430.00"}]}  mid = 1392.50
    const out = parseRates({ rates: [{ symbol: 'usdnaira', buy: '1355.00', sell: '1430.00' }] });
    expect(out).toEqual({ USDT: 139_250n });
  });

  it('uses the mid when both buy and sell are present', () => {
    expect(parseRates([{ asset: 'USDT', buy: 1600, sell: 1700 }])).toEqual({ USDT: 165_000n });
  });

  it('falls back to a single buy/rate/price when there is no sell', () => {
    const out = parseRates([
      { symbol: 'usdnaira', buy: 1400 },
      { symbol: 'btcnaira', rate: 101_000_000 },
    ]);
    expect(out).toEqual({ USDT: 140_000n, BTC: 10_100_000_000n });
  });

  it('maps an asset-keyed object (partial is fine)', () => {
    expect(parseRates({ USDT: { buy: 1600 }, ETHEREUM: { rate: 5_000_000 } })).toEqual({
      USDT: 160_000n,
      ETH: 500_000_000n,
    });
  });

  it('returns null only when nothing maps', () => {
    expect(parseRates('nope')).toBeNull();
    expect(parseRates({ nonsense: true })).toBeNull();
    expect(parseRates([{ symbol: 'doge', buy: 1 }])).toBeNull();
    expect(parseRates(null)).toBeNull();
  });
});
