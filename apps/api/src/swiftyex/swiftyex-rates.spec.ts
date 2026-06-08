import { parseRates } from './swiftyex-rates';

describe('parseRates', () => {
  it('maps an array of {asset, buy} → NGN-minor PriceMapMinor', () => {
    const out = parseRates([
      { asset: 'USDT', buy: 1605, sell: 1612 },
      { symbol: 'BTC', buy: 101_000_000 },
      { currency: 'ETH', rate: 5_400_000 },
    ]);
    expect(out).toEqual({ USDT: 160_500n, BTC: 10_100_000_000n, ETH: 540_000_000n });
  });

  it('maps an asset-keyed object', () => {
    const out = parseRates({
      USDT: { buy: 1600 },
      BTC: { price: 100_000_000 },
      ETHEREUM: { rate: 5_000_000 },
    });
    expect(out).toEqual({ USDT: 160_000n, BTC: 10_000_000_000n, ETH: 500_000_000n });
  });

  it('unwraps a { data: [...] } envelope and parses numeric strings', () => {
    const out = parseRates({
      data: [
        { asset: 'usdt', buy: '1,610' },
        { asset: 'btc', buy: '101000000' },
        { asset: 'eth', buy: '5400000' },
      ],
    });
    expect(out?.USDT).toBe(161_000n);
  });

  it('returns null when an asset is missing', () => {
    expect(parseRates([{ asset: 'USDT', buy: 1600 }, { asset: 'BTC', buy: 1 }])).toBeNull();
  });

  it('returns null for garbage', () => {
    expect(parseRates('nope')).toBeNull();
    expect(parseRates({ nonsense: true })).toBeNull();
    expect(parseRates(null)).toBeNull();
  });
});
