import type { Execution, PriceMap, Rule } from '../types';

export const mockPrices: PriceMap = {
  USDT: 146200,
  BTC: 14200000000,
  ETH: 530000000,
};

export const initialMockRules: Rule[] = [
  {
    id: 'r_1',
    name: 'Buy USDT dip',
    when: { asset: 'USDT', op: 'lt', priceMinor: 145000 },
    then: { action: 'buy', amountMinor: 5000000, currency: 'NGN' },
    state: 'watching',
    createdAt: '2026-05-20T09:00:00Z',
    lastEvaluatedAt: '2026-05-22T13:45:00Z',
    firedCount: 0,
  },
  {
    id: 'r_2',
    name: 'Take profit',
    when: { asset: 'USDT', op: 'gt', priceMinor: 155000 },
    then: { action: 'sell', amountMinor: 10000000, currency: 'NGN' },
    state: 'sleeping',
    createdAt: '2026-05-18T11:00:00Z',
    lastEvaluatedAt: '2026-05-22T13:45:00Z',
    firedCount: 0,
  },
  {
    id: 'r_3',
    name: 'BTC crash alert',
    when: { asset: 'BTC', op: 'crosses_below', priceMinor: 13000000000 },
    then: { action: 'alert' },
    state: 'fired',
    createdAt: '2026-05-15T08:30:00Z',
    lastEvaluatedAt: '2026-05-22T13:45:00Z',
    firedCount: 2,
  },
  {
    id: 'r_4',
    name: 'Weekend DCA',
    when: { asset: 'USDT', op: 'lt', priceMinor: 148000 },
    then: { action: 'buy', amountMinor: 2000000, currency: 'NGN' },
    state: 'paused',
    createdAt: '2026-05-10T16:00:00Z',
    firedCount: 5,
  },
];

export const initialMockExecutions: Execution[] = [
  {
    id: 'e_1',
    ruleId: 'r_3',
    firedAt: '2026-05-21T14:22:00Z',
    priceAtFireMinor: 12950000000,
    outcome: 'success',
    detail: 'Alert sent via Telegram',
  },
  {
    id: 'e_2',
    ruleId: 'r_3',
    firedAt: '2026-05-19T03:11:00Z',
    priceAtFireMinor: 12880000000,
    outcome: 'success',
    detail: 'Alert sent via Telegram',
  },
];

export interface Suggestion {
  id: string;
  reason: string;
  rule: Omit<Rule, 'id' | 'state' | 'createdAt' | 'firedCount' | 'lastEvaluatedAt'>;
}

export const mockSuggestions: Suggestion[] = [
  {
    id: 's_1',
    reason: 'You bought USDT 3 times at ~₦1,450 last month. Want this on autopilot?',
    rule: {
      name: 'Auto-buy USDT at ₦1,450',
      when: { asset: 'USDT', op: 'lt', priceMinor: 145000 },
      then: { action: 'buy', amountMinor: 5000000, currency: 'NGN' },
    },
  },
  {
    id: 's_2',
    reason: 'USDT dropped below ₦1,440 twice this week — opportunity for a deeper dip?',
    rule: {
      name: 'Deep dip buy',
      when: { asset: 'USDT', op: 'lt', priceMinor: 144000 },
      then: { action: 'buy', amountMinor: 10000000, currency: 'NGN' },
    },
  },
  {
    id: 's_3',
    reason: 'Take some profit if USDT rallies to ₦1,560?',
    rule: {
      name: 'Take profit at ₦1,560',
      when: { asset: 'USDT', op: 'gt', priceMinor: 156000 },
      then: { action: 'sell', amountMinor: 8000000, currency: 'NGN' },
    },
  },
];
