import { computeState, evaluate } from './rule-evaluator';

describe('evaluate', () => {
  const base = { asset: 'USDT' as const, targetMinor: 1620_00n };

  describe('lt', () => {
    it('fires when current is strictly below target', () => {
      expect(evaluate({ ...base, op: 'lt', currentMinor: 1619_00n })).toBe(true);
    });
    it('does not fire when current equals target', () => {
      expect(evaluate({ ...base, op: 'lt', currentMinor: 1620_00n })).toBe(false);
    });
    it('does not fire when current is above target', () => {
      expect(evaluate({ ...base, op: 'lt', currentMinor: 1700_00n })).toBe(false);
    });
  });

  describe('gt', () => {
    it('fires when current is strictly above target', () => {
      expect(evaluate({ ...base, op: 'gt', currentMinor: 1700_00n })).toBe(true);
    });
    it('does not fire when current equals target', () => {
      expect(evaluate({ ...base, op: 'gt', currentMinor: 1620_00n })).toBe(false);
    });
  });

  describe('crosses_above', () => {
    it('fires when previous is below and current is at or above target', () => {
      expect(
        evaluate({ ...base, op: 'crosses_above', previousMinor: 1619_00n, currentMinor: 1620_00n }),
      ).toBe(true);
      expect(
        evaluate({ ...base, op: 'crosses_above', previousMinor: 1600_00n, currentMinor: 1625_00n }),
      ).toBe(true);
    });
    it('does not fire when previous already at or above target', () => {
      expect(
        evaluate({ ...base, op: 'crosses_above', previousMinor: 1620_00n, currentMinor: 1625_00n }),
      ).toBe(false);
    });
    it('does not fire without a previous snapshot', () => {
      expect(evaluate({ ...base, op: 'crosses_above', currentMinor: 1625_00n })).toBe(false);
    });
  });

  describe('crosses_below', () => {
    it('fires when previous is above and current is at or below target', () => {
      expect(
        evaluate({ ...base, op: 'crosses_below', previousMinor: 1625_00n, currentMinor: 1620_00n }),
      ).toBe(true);
      expect(
        evaluate({ ...base, op: 'crosses_below', previousMinor: 1700_00n, currentMinor: 1500_00n }),
      ).toBe(true);
    });
    it('does not fire when previous already at or below target', () => {
      expect(
        evaluate({ ...base, op: 'crosses_below', previousMinor: 1620_00n, currentMinor: 1500_00n }),
      ).toBe(false);
    });
    it('does not fire without a previous snapshot', () => {
      expect(evaluate({ ...base, op: 'crosses_below', currentMinor: 1500_00n })).toBe(false);
    });
  });
});

describe('computeState', () => {
  it('returns sleeping when no current price', () => {
    expect(computeState(1620_00n, undefined)).toBe('sleeping');
  });
  it('returns watching when within 1% of target', () => {
    expect(computeState(1620_00n, 1625_00n)).toBe('watching');   // ~0.3%
    expect(computeState(1620_00n, 1615_00n)).toBe('watching');   // ~0.3%
    expect(computeState(1620_00n, 1620_00n)).toBe('watching');   // exact
  });
  it('returns sleeping when more than 1% from target', () => {
    expect(computeState(1620_00n, 1700_00n)).toBe('sleeping');   // ~4.9%
    expect(computeState(1620_00n, 1500_00n)).toBe('sleeping');   // ~7.4%
  });
});
