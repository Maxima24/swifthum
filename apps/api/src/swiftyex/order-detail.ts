import { QTY_SCALE } from '../common/assets';
import type { OrderResult, OrderStatus } from './swiftyex.port';

/** Render 8-decimal base units as a trimmed decimal string (e.g. 308000000n → "3.08"). */
export function formatQtyBase(qtyBase: bigint): string {
  const whole = qtyBase / QTY_SCALE;
  const frac = (qtyBase % QTY_SCALE).toString().padStart(8, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

function formatMinor(v: bigint): string {
  const major = Number(v) / 100;
  return major.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Human-readable execution detail. **Pure** — derives everything from the order
 * result and never inspects which adapter produced it. `status === 'simulated'`
 * is what distinguishes a sandbox fill from a live one, not a mode flag.
 */
export function formatOrderDetail(result: OrderResult): string {
  if (result.status === 'failed') return result.errorMessage ?? 'order failed';

  const qty = result.filledQtyBase !== undefined ? formatQtyBase(result.filledQtyBase) : '?';
  const price = result.filledPriceMinor !== undefined ? formatMinor(result.filledPriceMinor) : '?';

  if (result.status === 'simulated') {
    return `Would ${result.side} ${qty} ${result.asset} at ₦${price}`;
  }
  const verb = result.side === 'buy' ? 'Bought' : 'Sold';
  return `${verb} ${qty} ${result.asset} at ₦${price}`;
}

/** Map an order status to the RuleExecution outcome the frontend renders. */
export function orderStatusToOutcome(status: OrderStatus): 'success' | 'failed' | 'simulated' {
  switch (status) {
    case 'success': return 'success';
    case 'simulated': return 'simulated';
    default: return 'failed'; // 'failed' and (defensively) 'pending'
  }
}
