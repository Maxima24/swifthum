import {
  initialMockExecutions,
  initialMockRules,
  mockPrices,
  mockSuggestions,
} from '../mocks/rules';
import type {
  EscrowDetail,
  EscrowEventItem,
  Execution,
  GiftListItem,
  PaymentIntent,
  ReceiptListItem,
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
const intents: Record<
  string,
  PaymentIntent & { senderName: string; consumed?: boolean; refunded?: boolean }
> = {};
let transactions: Transaction[] = [];

// In-memory gifts (sender view)
let gifts: GiftListItem[] = [];

// In-memory receipts
let receipts: ReceiptListItem[] = [];
function pushReceipt(r: ReceiptListItem) {
  receipts = [r, ...receipts];
}

// In-memory escrows (mock is single-user: the demo user is always the buyer)
const escrows: (EscrowDetail & { joinCode: string })[] = [];
const ESCROW_ACTION_EVENT: Record<string, string> = {
  accept: 'accepted',
  decline: 'declined',
  cancel: 'cancelled',
  'mark-paid': 'paid_marked',
  release: 'released',
  dispute: 'disputed',
};
const ESCROW_ACTION_STATE: Record<string, EscrowDetail['state']> = {
  accept: 'ACCEPTED',
  decline: 'DECLINED',
  cancel: 'CANCELLED',
  'mark-paid': 'PAID_MARKED',
  release: 'COMPLETED',
  dispute: 'DISPUTED',
};

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

  // ─── SwiftyEx Mini App (real-data proxy) — dev mocks ─────────
  if (path === '/swiftyex/rates' && method === 'GET') {
    // Mirrors the real SwiftyEx shape: { rates: [{ symbol, buy, sell }] } — only usdnaira.
    return {
      configured: true,
      rates: { rates: [{ symbol: 'usdnaira', buy: '1355.00', sell: '1430.00' }] },
    } as T;
  }
  if (path === '/swiftyex/wallets' && method === 'GET') {
    return {
      configured: true,
      wallets: [
        { wallet_type: 'naira', blockchain: 'fiat', balance: '42,500.00', deposit_address: 'SWIFT-NGN-001' },
        { wallet_type: 'usdt', blockchain: 'tron', balance: '128.40', deposit_address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5oR1234' },
        { wallet_type: 'btc', blockchain: 'bitcoin', balance: '0.0123', deposit_address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
      ],
    } as T;
  }
  if (path === '/swiftyex/me' && method === 'GET') {
    return {
      configured: true,
      profile: { username: 'demo_user', kyc_verified: true, kyc_level: 2, referral_code: 'SWIFT-REF-42' },
    } as T;
  }
  if (path.startsWith('/swiftyex/sx-transactions') && method === 'GET') {
    return {
      configured: true,
      transactions: [
        { type: 'deposit', asset: 'usdt', amount: '50.00', created_at: '2026-06-05' },
        { type: 'buy', asset: 'btc', amount: '0.004', created_at: '2026-06-04' },
        { type: 'withdrawal', asset: 'naira', amount: '10,000.00', created_at: '2026-06-03' },
      ],
    } as T;
  }

  // ─── Wallet ──────────────────────────────────────────────────
  if (path === '/wallets/me' && method === 'GET') return wallet as T;

  // ─── Pay by @username (lookup + direct transfer) ─────────────
  if (path.startsWith('/users/lookup') && method === 'GET') {
    const handle = (new URLSearchParams(path.split('?')[1] ?? '').get('username') ?? '')
      .replace(/^@+/, '')
      .toLowerCase();
    // Pretend a couple of demo handles exist.
    const known: Record<string, string> = { bayo: 'Bayo A.', ada: 'Ada O.', demo: 'Demo User' };
    if (known[handle]) return { found: true, displayName: known[handle], username: handle } as T;
    return { found: false } as T;
  }
  if (path === '/transfers' && method === 'POST') {
    const amountMinor = body.amountMinor as number;
    if (amountMinor > wallet.balanceMinor) throw new Error('400 insufficient_balance');
    const known: Record<string, string> = { bayo: 'Bayo A.', ada: 'Ada O.', demo: 'Demo User' };
    const handle = String(body.recipientUsername ?? '').replace(/^@+/, '').toLowerCase();
    const displayName = known[handle] ?? 'User';
    wallet = { ...wallet, balanceMinor: wallet.balanceMinor - amountMinor };
    transactions = [
      {
        id: nextId('tx'),
        direction: 'sent',
        amountMinor,
        currency: 'NGN',
        counterparty: { displayName },
        settledAt: new Date().toISOString(),
      },
      ...transactions,
    ];
    return {
      status: 'ok',
      transferId: nextId('tx'),
      amountMinor,
      currency: 'NGN',
      recipient: { displayName },
    } as T;
  }

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

  // ─── Cancel an intent (sender) ───────────────────────────────
  const cancelMatch = path.match(/^\/intents\/([^/]+)\/cancel$/);
  if (cancelMatch && method === 'POST') {
    const intent = Object.values(intents).find((x) => x.intentId === cancelMatch[1]);
    if (!intent) throw new Error('404 not_found');
    if (intent.consumed) throw new Error('409 already_redeemed');
    intent.refunded = true;
    return { status: 'refunded' } as T;
  }

  // ─── Intent status (sender polls for "Paid ✓") ───────────────
  const statusMatch = path.match(/^\/intents\/([^/]+)$/);
  if (statusMatch && method === 'GET') {
    const intent = Object.values(intents).find((x) => x.intentId === statusMatch[1]);
    if (!intent) throw new Error('404 not_found');
    const expired = new Date(intent.expiresAt).getTime() < Date.now();
    const status = intent.consumed
      ? 'completed'
      : intent.refunded
        ? 'refunded'
        : expired
          ? 'expired'
          : 'pending';
    return {
      status,
      amountMinor: intent.amountMinor,
      currency: 'NGN',
      expiresAt: intent.expiresAt,
      ...(intent.consumed ? { counterparty: { displayName: 'Demo Receiver' } } : {}),
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

    // Emit a verifiable receipt (received) for the mock dashboard.
    const rid = nextId('rcpt');
    const rtoken = `${btoa(JSON.stringify({ receiptId: rid })).replace(/=+$/, '')}.${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    pushReceipt({
      id: rid,
      sourceType: 'payment',
      direction: 'received',
      amountMinor: intent.amountMinor,
      currency: 'NGN',
      counterparty: { displayName: intent.senderName },
      url: `${window.location.origin}/r/${rid}?token=${rtoken}`,
      token: rtoken,
      createdAt: new Date().toISOString(),
    });

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

  // ─── Gifts ───────────────────────────────────────────────────
  if (path === '/gifts' && method === 'POST') {
    const amountMinor = body.amountMinor as number;
    if (amountMinor > wallet.balanceMinor) throw new Error('400 insufficient_balance');
    const id = nextId('g');
    const claimCode = Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 12);
    const now = new Date();
    const ttlExpiresAt = new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    const item: GiftListItem = {
      id,
      amountMinor,
      currency: 'NGN',
      message: body.message || undefined,
      state: 'UNCLAIMED',
      claimCode,
      deepLink: `https://t.me/swifthum_bot?start=gift_${claimCode}`,
      ttlExpiresAt,
      createdAt: now.toISOString(),
    };
    gifts = [item, ...gifts];
    wallet = { ...wallet, balanceMinor: wallet.balanceMinor - amountMinor };
    return {
      giftId: id,
      claimCode,
      deepLink: item.deepLink,
      amountMinor,
      currency: 'NGN',
      message: item.message,
      state: 'UNCLAIMED',
      ttlExpiresAt,
      createdAt: item.createdAt,
    } as T;
  }
  if (path === '/gifts' && method === 'GET') return { items: gifts } as T;
  const giftCancelMatch = path.match(/^\/gifts\/([^/]+)\/cancel$/);
  if (giftCancelMatch && method === 'POST') {
    const g = gifts.find((x) => x.id === giftCancelMatch[1]);
    if (!g) throw new Error('404 not_found');
    if (g.state === 'CLAIMED') throw new Error('409 already_redeemed');
    if (g.state === 'UNCLAIMED') {
      g.state = 'RECLAIMED';
      wallet = { ...wallet, balanceMinor: wallet.balanceMinor + g.amountMinor };
    }
    return { status: 'reclaimed' } as T;
  }

  // ─── Receipts ────────────────────────────────────────────────
  if (path === '/receipts' && method === 'GET') return { items: receipts } as T;
  if (path.startsWith('/receipts/verify') && method === 'GET') {
    const token = new URLSearchParams(path.split('?')[1] ?? '').get('token') ?? '';
    const r = receipts.find((x) => x.token === token);
    if (!r) return { valid: false } as T;
    return {
      valid: true,
      receipt: {
        id: r.id,
        sourceType: r.sourceType,
        amountMinor: r.amountMinor,
        asset: r.currency,
        from: r.direction === 'received' ? r.counterparty.displayName : 'You',
        to: r.direction === 'received' ? 'You' : r.counterparty.displayName,
        createdAt: r.createdAt,
      },
    } as T;
  }

  // ─── Escrow ──────────────────────────────────────────────────
  if (path === '/escrows' && method === 'POST') {
    const amountMinor = body.amountMinor as number;
    if (amountMinor > wallet.balanceMinor) throw new Error('400 insufficient_balance');
    const id = nextId('esc');
    const joinCode = Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 12);
    const now = new Date();
    const ttlExpiresAt = new Date(now.getTime() + 72 * 3600 * 1000).toISOString();
    const detail: EscrowDetail & { joinCode: string } = {
      id,
      role: 'buyer',
      state: 'PROPOSED',
      amountMinor,
      currency: 'NGN',
      terms: body.terms || undefined,
      ttlExpiresAt,
      createdAt: now.toISOString(),
      joinCode,
      deepLink: `https://t.me/swifthum_bot?start=escrow_${joinCode}`,
      events: [{ type: 'proposed', actorId: 'u_demo', metadata: {}, createdAt: now.toISOString() }],
    };
    escrows.unshift(detail);
    wallet = { ...wallet, balanceMinor: wallet.balanceMinor - amountMinor };
    return {
      escrowId: id,
      joinCode,
      deepLink: detail.deepLink,
      amountMinor,
      currency: 'NGN',
      terms: detail.terms,
      state: 'PROPOSED',
      ttlExpiresAt,
      createdAt: detail.createdAt,
    } as T;
  }
  if (path === '/escrows' && method === 'GET') {
    return { items: escrows.map(({ events: _events, joinCode: _jc, ...s }) => s) } as T;
  }
  const escrowActionMatch = path.match(/^\/escrows\/([^/]+)\/(accept|decline|cancel|mark-paid|release|dispute)$/);
  if (escrowActionMatch && method === 'POST') {
    const [, eid, action] = escrowActionMatch;
    const e = escrows.find((x) => x.id === eid);
    if (!e) throw new Error('404 not_found');
    e.state = ESCROW_ACTION_STATE[action];
    const ev: EscrowEventItem = {
      type: ESCROW_ACTION_EVENT[action],
      actorId: 'u_demo',
      metadata: {},
      createdAt: new Date().toISOString(),
    };
    e.events = [...e.events, ev];
    if (action === 'cancel' || action === 'decline') {
      wallet = { ...wallet, balanceMinor: wallet.balanceMinor + e.amountMinor };
    }
    const { events: _ev, joinCode: _jc, ...summary } = e;
    return summary as T;
  }
  const escrowDetailMatch = path.match(/^\/escrows\/([^/]+)$/);
  if (escrowDetailMatch && method === 'GET') {
    const e = escrows.find((x) => x.id === escrowDetailMatch[1]);
    if (!e) throw new Error('404 not_found');
    const { joinCode: _jc, ...detail } = e;
    return detail as T;
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
