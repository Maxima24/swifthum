import type { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { hashToken, signToken } from './payment-token';
import { Errors } from '../common/errors';
import type { AccountRef, LedgerService, TransferArgs } from '../ledger/ledger.service';

const SECRET = 'test-payment-token-secret';

interface SeedIntent {
  id: string;
  senderId: string;
  amountMinor: bigint;
  tokenHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
  refundedAt: Date | null;
}

/**
 * Minimal in-memory Prisma double — just the slice cancelIntent / getIntentStatus
 * / redeem touch. Mirrors the sandbox.client.spec approach (no real DB).
 */
function makeService(seed: {
  intents?: SeedIntent[];
  wallets?: Record<string, bigint>;
  transactions?: Array<Record<string, unknown>>;
}) {
  const intents = new Map<string, SeedIntent>((seed.intents ?? []).map((i) => [i.id, i]));
  const wallets = new Map<string, { userId: string; balanceMinor: bigint }>(
    Object.entries(seed.wallets ?? {}).map(([userId, balanceMinor]) => [
      userId,
      { userId, balanceMinor },
    ]),
  );
  const transactions = seed.transactions ?? [];
  const byTokenHash = (h: string) => [...intents.values()].find((i) => i.tokenHash === h) ?? null;

  const applyBalance = (cur: bigint, data: { balanceMinor?: { increment?: bigint; decrement?: bigint } }) => {
    const inc = data?.balanceMinor?.increment;
    const dec = data?.balanceMinor?.decrement;
    if (inc !== undefined) return cur + BigInt(inc);
    if (dec !== undefined) return cur - BigInt(dec);
    return cur;
  };

  const db: any = {
    $executeRaw: async () => 0,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    paymentIntent: {
      findUnique: async ({ where }: any) =>
        where.id ? (intents.get(where.id) ?? null) : byTokenHash(where.tokenHash),
      update: async ({ where, data }: any) => {
        const row = intents.get(where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    wallet: {
      update: async ({ where, data }: any) => {
        const w = wallets.get(where.userId)!;
        w.balanceMinor = applyBalance(w.balanceMinor, data);
        return w;
      },
    },
    user: {
      findUnique: async ({ where }: any) => ({
        id: where.id,
        displayName: `U_${where.id}`,
        telegramId: 1n,
        notificationsEnabled: true,
      }),
    },
    usedNonce: { create: async () => ({}) },
    transaction: {
      findFirst: async ({ where }: any) =>
        transactions.find(
          (t) =>
            t.userId === where.userId &&
            t.intentId === where.intentId &&
            t.direction === where.direction,
        ) ?? null,
      createMany: async ({ data }: any) => {
        transactions.push(...data);
        return { count: data.length };
      },
    },
  };

  const config = {
    getOrThrow: (k: string) => (k === 'PAYMENT_TOKEN_SECRET' ? SECRET : ''),
    get: (_k: string, d?: string) => d,
  } as unknown as ConfigService;

  const botPush = { publish: jest.fn(async () => undefined) } as any;
  const ai = { scoreFraud: jest.fn(async () => ({ score: 0.1, reasoning: '' })) } as any;

  // Fake ledger: applies wallet-side deltas to the same `wallets` map the
  // assertions read, and enforces insufficient-balance for a wallet `from`
  // (system accounts like payment_hold are unbounded sources here).
  const walletDelta = (ref: AccountRef, delta: bigint) => {
    if ('wallet' in ref) {
      const w = wallets.get(ref.wallet);
      if (w) w.balanceMinor += delta;
    }
  };
  const ledger = {
    transfer: jest.fn(async (_tx: unknown, args: TransferArgs) => {
      if ('wallet' in args.from) {
        const w = wallets.get(args.from.wallet);
        if (w && w.balanceMinor < args.amountMinor) throw Errors.insufficientBalance();
      }
      walletDelta(args.from, -args.amountMinor);
      walletDelta(args.to, args.amountMinor);
      return { transactionId: 'lt_test', idempotent: false };
    }),
  } as unknown as LedgerService;

  const receipts = { emit: jest.fn(async () => ({ id: 'rcpt_test' })) } as any;

  const svc = new PaymentsService(db, ledger, receipts, botPush, ai, config);
  return { svc, intents, wallets, transactions };
}

function seedIntent(over: Partial<SeedIntent> = {}): SeedIntent {
  return {
    id: 'i_1',
    senderId: 'u_sender',
    amountMinor: 100_000n,
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    consumedAt: null,
    refundedAt: null,
    ...over,
  };
}

describe('PaymentsService.cancelIntent', () => {
  it('refunds an unconsumed intent and marks it refunded', async () => {
    const { svc, wallets, intents } = makeService({
      intents: [seedIntent()],
      wallets: { u_sender: 0n },
    });
    const res = await svc.cancelIntent('u_sender', 'i_1');
    expect(res.status).toBe('refunded');
    expect(wallets.get('u_sender')!.balanceMinor).toBe(100_000n);
    expect(intents.get('i_1')!.refundedAt).toBeInstanceOf(Date);
  });

  it('is idempotent when already refunded (no double credit)', async () => {
    const { svc, wallets } = makeService({
      intents: [seedIntent({ refundedAt: new Date() })],
      wallets: { u_sender: 50n },
    });
    const res = await svc.cancelIntent('u_sender', 'i_1');
    expect(res.status).toBe('refunded');
    expect(wallets.get('u_sender')!.balanceMinor).toBe(50n); // unchanged
  });

  it('throws already_redeemed when the intent was consumed', async () => {
    const { svc } = makeService({
      intents: [seedIntent({ consumedAt: new Date() })],
      wallets: { u_sender: 0n },
    });
    await expect(svc.cancelIntent('u_sender', 'i_1')).rejects.toMatchObject({
      code: 'already_redeemed',
    });
  });

  it('throws not_found for a non-owner', async () => {
    const { svc } = makeService({ intents: [seedIntent()], wallets: { u_sender: 0n } });
    await expect(svc.cancelIntent('u_other', 'i_1')).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('PaymentsService.getIntentStatus', () => {
  it('returns pending for a live unconsumed intent', async () => {
    const { svc } = makeService({ intents: [seedIntent()], wallets: {} });
    expect((await svc.getIntentStatus('u_sender', 'i_1')).status).toBe('pending');
  });

  it('returns completed with the receiver name', async () => {
    const { svc } = makeService({
      intents: [seedIntent({ consumedAt: new Date() })],
      wallets: {},
      transactions: [
        { userId: 'u_sender', intentId: 'i_1', direction: 'sent', counterpartyName: 'Bob' },
      ],
    });
    const s = await svc.getIntentStatus('u_sender', 'i_1');
    expect(s.status).toBe('completed');
    expect(s.counterparty?.displayName).toBe('Bob');
  });

  it('returns refunded / expired terminal states', async () => {
    const refunded = makeService({ intents: [seedIntent({ refundedAt: new Date() })], wallets: {} });
    expect((await refunded.svc.getIntentStatus('u_sender', 'i_1')).status).toBe('refunded');

    const expired = makeService({
      intents: [seedIntent({ expiresAt: new Date(Date.now() - 1000) })],
      wallets: {},
    });
    expect((await expired.svc.getIntentStatus('u_sender', 'i_1')).status).toBe('expired');
  });
});

describe('PaymentsService.redeem race guard', () => {
  it('rejects a refunded intent (no double-spend after cancel)', async () => {
    const token = signToken(
      { i: 'i_1', a: 100_000, e: Math.floor((Date.now() + 60_000) / 1000) },
      SECRET,
    );
    const { svc } = makeService({
      intents: [seedIntent({ tokenHash: hashToken(token), refundedAt: new Date() })],
      wallets: { u_recv: 0n },
    });
    await expect(svc.redeem('u_recv', token)).rejects.toMatchObject({
      code: 'invalid_or_expired',
    });
  });
});
