import type { Action, Asset, Operator, Rule } from '../types';

export function formatNgn(minor: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

export function formatPriceMinor(minor: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(minor / 100);
}

export function formatRelativeTime(iso?: string): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const OP_LABEL: Record<Operator, string> = {
  lt: 'drops below',
  gt: 'rises above',
  crosses_above: 'crosses above',
  crosses_below: 'crosses below',
};

const ACTION_LABEL: Record<Action, string> = {
  buy: 'BUY',
  sell: 'SELL',
  alert: 'ALERT',
};

export function formatAsset(a: Asset): string {
  return a;
}

export function formatRuleSummary(rule: Rule): string {
  const when = `WHEN ${rule.when.asset} ${OP_LABEL[rule.when.op]} ${formatPriceMinor(rule.when.priceMinor)}`;
  const then =
    rule.then.action === 'alert'
      ? 'SEND ALERT'
      : `${ACTION_LABEL[rule.then.action]} ${rule.then.amountMinor ? formatNgn(rule.then.amountMinor) : ''}`;
  return `${when} → ${then}`;
}
