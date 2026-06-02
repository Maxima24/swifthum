import { formatOrderDetail, formatQtyBase, orderStatusToOutcome } from './order-detail';
import type { OrderResult } from './swiftyex.port';

describe('formatQtyBase', () => {
  it('renders trimmed decimals from 8-dp base units', () => {
    expect(formatQtyBase(308_000_000n)).toBe('3.08');
    expect(formatQtyBase(100_000_000n)).toBe('1');
    expect(formatQtyBase(150_000_000n)).toBe('1.5');
    expect(formatQtyBase(12_345_678n)).toBe('0.12345678');
    expect(formatQtyBase(0n)).toBe('0');
  });
});

describe('formatOrderDetail', () => {
  const base: OrderResult = {
    orderId: 'so_1',
    status: 'simulated',
    side: 'buy',
    asset: 'USDT',
    amountMinor: 5_000_00n,
    filledPriceMinor: 1_620_00n,
    filledQtyBase: 308_000_000n,
  };

  it('uses "Would <side>" for simulated fills', () => {
    const d = formatOrderDetail(base);
    expect(d).toContain('Would buy');
    expect(d).toContain('3.08');
    expect(d).toContain('USDT');
  });

  it('uses past tense for live success', () => {
    expect(formatOrderDetail({ ...base, status: 'success', side: 'buy' })).toContain('Bought');
    expect(formatOrderDetail({ ...base, status: 'success', side: 'sell' })).toContain('Sold');
  });

  it('returns the error message for failed orders', () => {
    const d = formatOrderDetail({
      ...base,
      status: 'failed',
      errorMessage: 'insufficient holdings',
    });
    expect(d).toBe('insufficient holdings');
  });

  it('never inspects a mode — derives everything from the result', () => {
    // Same inputs except status drive entirely different output.
    expect(formatOrderDetail({ ...base, status: 'simulated' })).toContain('Would');
    expect(formatOrderDetail({ ...base, status: 'success' })).not.toContain('Would');
  });
});

describe('orderStatusToOutcome', () => {
  it('maps statuses to ledger outcomes', () => {
    expect(orderStatusToOutcome('success')).toBe('success');
    expect(orderStatusToOutcome('simulated')).toBe('simulated');
    expect(orderStatusToOutcome('failed')).toBe('failed');
    expect(orderStatusToOutcome('pending')).toBe('failed');
  });
});
