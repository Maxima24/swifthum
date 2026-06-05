import {
  initialMockExecutions,
  initialMockRules,
  mockPrices,
  mockSuggestions,
} from '../mocks/rules';
import type {
  Execution,
  PaymentIntent,
  RedemptionResult,
  Rule,
  RuleState,
  SwiftyexAccountStatus,
  SwiftyexHolding,
  Transaction,
  Wallet,
} from '../types';

let rules: Rule[] = [...initialMockRules];
let executions: Execution[] = [...initialMockExecutions];

// In-memory payment state
let wallet: Wallet = { balanceMinor: 25_000_00, currency: 'NGN', notificationsEnabled: true };
const intents: Record<string, PaymentIntent & { senderName: string; consumed?: boolean }> = {};
let transactions: Transaction[] = [];

// In-memory SwiftyEx account state
let swiftyexAccount: SwiftyexAccountStatus = { linked: false };
const swiftyexHoldings: SwiftyexHolding[] = [];

// Live price simulation — random-walk each base price so the realtime chart
// actually moves in mock mode. Real backend supplies real movement.
const livePrices: Record<string, number> = { ...mockPrices } as Record<string, number>;
function tickPrices() {
  for (const asset of Object.keys(livePrices)) {
    const base = (mockPrices as Record<string, number>)[asset];
    const drift = (Math.random() - 0.5) * 0.003; // ±0.15% per tick
    // Walk around current, but gently pull back toward base so it doesn't drift away.
    const pull = (base - livePrices[asset]) * 0.05;
    livePrices[asset] = Math.max(1, Math.round(livePrices[asset] * (1 + drift) + pull));
  }
}

const delay = (ms = 200 + Math.random() * 200) => new Promise((r) => setTimeout(r, ms));

function nextId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function computeState(rule: Pick<Rule, 'when' | 'state'>): RuleState {
  if (rule.state === 'paused') return 'paused';
  const current = mockPrices[rule.when.asset];
  if (!current) return 'sleeping';
  const diffPct = Math.abs(current - rule.when.priceMinor) / rule.when.priceMinor;
  return diffPct <= 0.01 ? 'watching' : 'sleeping';
}

function makeToken(payload: object): string {
  // Mock JWT-ish format — short, fits ggwave's ~140-byte payload budget
  const body = btoa(JSON.stringify(payload)).replace(/=+$/, '');
  const sig = btoa(Math.random().toString(36).slice(2, 10)).replace(/=+$/, '');
  return `swfh.${body}.${sig}`;
}

export async function mockApi<T>(path: string, init?: RequestInit): Promise<T> {
  await delay();
  const method = (init?.method ?? 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(init.body as string) : null;

  // ─── Rules ───────────────────────────────────────────────────
  if (path === '/rules' && method === 'GET') return rules as T;
  if (path === '/rules' && method === 'POST') {
    const rule: Rule = {
      id: nextId('r'),
      name: body.name || `${body.then.action.toUpperCase()} ${body.when.asset}`,
      when: body.when,
      then: body.then,
      state: 'sleeping',
      createdAt: new Date().toISOString(),
      lastEvaluatedAt: new Date().toISOString(),
      firedCount: 0,
    };
    rule.state = computeState(rule);
    rules = [rule, ...rules];
    return rule as T;
  }
  const idMatch = path.match(/^\/rules\/([^/]+)$/);
  if (idMatch) {
    const id = idMatch[1];
    const idx = rules.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Mock 404: ${path}`);
    if (method === 'GET') return rules[idx] as T;
    if (method === 'PATCH') {
      rules[idx] = { ...rules[idx], ...body };
      rules[idx].state = computeState(rules[idx]);
      return rules[idx] as T;
    }
    if (method === 'DELETE') {
      rules.splice(idx, 1);
      executions = executions.filter((e) => e.ruleId !== id);
      return undefined as T;
    }
  }
  const pauseMatch = path.match(/^\/rules\/([^/]+)\/(pause|resume)$/);
  if (pauseMatch && method === 'POST') {
    const [, id, action] = pauseMatch;
    const rule = rules.find((r) => r.id === id);
    if (!rule) throw new Error(`Mock 404: ${path}`);
    rule.state = action === 'pause' ? 'paused' : computeState({ ...rule, state: 'sleeping' });
    return rule as T;
  }
  const execMatch = path.match(/^\/rules\/([^/]+)\/executions$/);
  if (execMatch && method === 'GET') {
    const id = execMatch[1];
    return executions.filter((e) => e.ruleId === id) as T;
  }

  // ─── Prices / Insights ───────────────────────────────────────
  if (path.startsWith('/prices/current') && method === 'GET') {
    tickPrices();
    return { ...livePrices } as T;
  }
  if (path === '/insights/suggested-rules' && method === 'GET') return mockSuggestions as T;

  // ─── Auth ────────────────────────────────────────────────────
  if (path === '/auth/telegram' && method === 'POST') {
    return {
      sessionToken: 'mock_jwt_' + Date.now(),
      user: { id: 'u_demo', telegramId: 12345, displayName: 'Demo User' },
    } as T;
  }

  // ─── Wallet ──────────────────────────────────────────────────
  if (path === '/wallets/me' && method === 'GET') return wallet as T;

  // ─── User preferences ────────────────────────────────────────
  if (path === '/users/me' && method === 'PATCH') {
    if (typeof body?.notificationsEnabled === 'boolean') {
      wallet = { ...wallet, notificationsEnabled: body.notificationsEnabled };
    }
    return { notificationsEnabled: wallet.notificationsEnabled ?? true } as T;
  }

  // ─── Payment intents (sender) ────────────────────────────────
  if (path === '/intents' && method === 'POST') {
    const amountMinor = body.amountMinor as number;
    if (amountMinor > wallet.balanceMinor) {
      throw new Error('400 insufficient_balance');
    }
    const intent: PaymentIntent & { senderName: string } = {
      intentId: nextId('i'),
      token: makeToken({ a: amountMinor, t: Date.now() }),
      amountMinor,
      currency: 'NGN',
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
      riskScore: 0.1,
      senderName: 'Demo User',
    };
    intents[intent.token] = intent;
    return {
      intentId: intent.intentId,
      token: intent.token,
      amountMinor: intent.amountMinor,
      currency: intent.currency,
      expiresAt: intent.expiresAt,
      riskScore: intent.riskScore,
    } as T;
  }

  // ─── Redeem (receiver) ───────────────────────────────────────
  if (path === '/redeem' && method === 'POST') {
    const token = body.token as string;
    const intent = intents[token];
    if (!intent) throw new Error('401 invalid_or_expired');
    if (intent.consumed) throw new Error('409 already_redeemed');
    if (new Date(intent.expiresAt).getTime() < Date.now()) throw new Error('410 expired');
    intent.consumed = true;

    transactions = [
      {
        id: nextId('tx'),
        direction: 'received',
        amountMinor: intent.amountMinor,
        currency: 'NGN',
        counterparty: { displayName: intent.senderName },
        settledAt: new Date().toISOString(),
      },
      ...transactions,
    ];
    wallet = { ...wallet, balanceMinor: wallet.balanceMinor + intent.amountMinor };

    const result: RedemptionResult = {
      status: 'ok',
      intentId: intent.intentId,
      amountMinor: intent.amountMinor,
      currency: 'NGN',
      sender: { displayName: intent.senderName },
    };
    return result as T;
  }

  // ─── Transactions ────────────────────────────────────────────
  if (path.startsWith('/transactions') && method === 'GET') {
    return { items: transactions, nextCursor: null } as T;
  }

  // ─── SwiftyEx account / holdings ─────────────────────────────
  if (path === '/swiftyex/account' && method === 'GET') return swiftyexAccount as T;
  if (path === '/swiftyex/link' && method === 'POST') {
    const key = String(body?.apiKey ?? 'demo');
    swiftyexAccount = {
      linked: true,
      label: `sandbox·${key.slice(0, 4)}…`,
      linkedAt: new Date().toISOString(),
    };
    return swiftyexAccount as T;
  }
  if (path === '/swiftyex/link' && method === 'DELETE') {
    swiftyexAccount = { linked: false };
    return undefined as T;
  }
  if (path === '/swiftyex/holdings' && method === 'GET') return swiftyexHoldings as T;

  throw new Error(`Mock route not found: ${method} ${path}`);
}
