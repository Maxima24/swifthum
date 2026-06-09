import type { ConfigService } from '@nestjs/config';
import { EscrowService } from './escrow.service';
import { Errors } from '../common/errors';
import type { AccountRef, LedgerService, TransferArgs } from '../ledger/ledger.service';

interface SeedEscrow {
  id: string;
  creatorId: string;
  counterpartyId: string | null;
  asset: string;
  amountMinor: bigint;
  terms: string | null;
  joinCode: string;
  state: string;
  ttlExpiresAt: Date;
  stateUpdatedAt: Date;
  createdAt: Date;
}

interface SeedUser {
  id: string;
  displayName: string;
  telegramId: bigint;
  notificationsEnabled: boolean;
}

function escrow(over: Partial<SeedEscrow> = {}): SeedEscrow {
  return {
    id: 'esc_1',
    creatorId: 'u_buyer',
    counterpartyId: null,
    asset: 'NGN',
    amountMinor: 50_000n,
    terms: null,
    joinCode: 'joincode_abcdef',
    state: 'PROPOSED',
    ttlExpiresAt: new Date(Date.now() + 72 * 3600 * 1000),
    stateUpdatedAt: new Date(),
    createdAt: new Date(),
    ...over,
  };
}

const buyer = (): SeedUser => ({ id: 'u_buyer', displayName: 'Ada', telegramId: 1n, notificationsEnabled: true });
const seller = (): SeedUser => ({ id: 'u_seller', displayName: 'Bayo', telegramId: 2n, notificationsEnabled: true });

function makeService(seed: {
  escrows?: SeedEscrow[];
  wallets?: Record<string, bigint>;
  users?: SeedUser[];
  aiDecision?: 'release' | 'refund';
}) {
  const escrows = new Map<string, SeedEscrow>((seed.escrows ?? []).map((e) => [e.id, e]));
  const events = new Map<string, Array<{ id: string; type: string; actorId: string | null; metadata: unknown; createdAt: Date }>>();
  const wallets = new Map<string, bigint>(Object.entries(seed.wallets ?? {}).map(([k, v]) => [k, v]));
  const users = new Map<string, SeedUser>((seed.users ?? []).map((u) => [u.id, u]));
  let held = 0n;

  const byCode = (c: string) => [...escrows.values()].find((e) => e.joinCode === c) ?? null;
  const withEvents = (e: SeedEscrow) => ({ ...e, events: (events.get(e.id) ?? []).slice() });

  const db: any = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    escrow: {
      create: async ({ data }: any) => {
        const row: SeedEscrow = { ...escrow(), ...data, stateUpdatedAt: new Date(), createdAt: new Date() };
        escrows.set(row.id, row);
        return row;
      },
      findUnique: async ({ where, include }: any) => {
        const e = where.id ? escrows.get(where.id) ?? null : byCode(where.joinCode);
        if (!e) return null;
        return include?.events ? withEvents(e) : e;
      },
      findMany: async ({ where }: any) => {
        let rows = [...escrows.values()];
        if (where?.OR) {
          rows = rows.filter((e) => e.creatorId === where.OR[0].creatorId || e.counterpartyId === where.OR[1].counterpartyId);
        }
        if (where?.state) rows = rows.filter((e) => e.state === where.state);
        if (where?.ttlExpiresAt?.lt) rows = rows.filter((e) => e.ttlExpiresAt.getTime() < where.ttlExpiresAt.lt.getTime());
        return rows;
      },
      updateMany: async ({ where, data }: any) => {
        const e = escrows.get(where.id);
        if (!e) return { count: 0 };
        if (where.state && e.state !== where.state) return { count: 0 };
        if ('counterpartyId' in where && where.counterpartyId === null && e.counterpartyId !== null) return { count: 0 };
        Object.assign(e, data);
        return { count: 1 };
      },
    },
    escrowEvent: {
      create: async ({ data }: any) => {
        const list = events.get(data.escrowId) ?? [];
        const row = { ...data, createdAt: new Date() };
        list.push(row);
        events.set(data.escrowId, list);
        return row;
      },
    },
    user: { findUnique: async ({ where }: any) => users.get(where.id) ?? null },
  };

  const walletDelta = (ref: AccountRef, delta: bigint) => {
    if ('wallet' in ref) wallets.set(ref.wallet, (wallets.get(ref.wallet) ?? 0n) + delta);
    else if (ref.system === 'escrow_hold') held += delta;
  };
  const ledger = {
    transfer: jest.fn(async (_tx: unknown, args: TransferArgs) => {
      if ('wallet' in args.from) {
        const bal = wallets.get(args.from.wallet) ?? 0n;
        if (bal < args.amountMinor) throw Errors.insufficientBalance();
      }
      walletDelta(args.from, -args.amountMinor);
      walletDelta(args.to, args.amountMinor);
      return { transactionId: 'lt_test', idempotent: false };
    }),
  } as unknown as LedgerService;

  const receipts = { emit: jest.fn(async () => ({ id: 'rcpt_test' })), autoEmail: jest.fn(async () => undefined) } as any;
  const botPush = { publish: jest.fn(async () => undefined) } as any;
  const ai = { resolveDispute: jest.fn(async () => ({ decision: seed.aiDecision ?? 'refund', reasoning: 'ai test' })) } as any;
  const config = { get: (k: string, d?: string) => (k === 'BOT_USERNAME' ? 'swifthum_bot' : k === 'ESCROW_TTL_HOURS' ? '72' : d) } as unknown as ConfigService;

  const svc = new EscrowService(db, ledger, receipts, botPush, ai, config);
  return { svc, escrows, wallets, users, events, receipts, botPush, ai, getHeld: () => held };
}

describe('EscrowService.createEscrow + join', () => {
  it('funds the escrow (buyer → escrow_hold) and returns a join deep-link', async () => {
    const L = makeService({ wallets: { u_buyer: 100_000n }, users: [buyer()] });
    const res = await L.svc.createEscrow('u_buyer', 40_000, 'laptop');
    expect(L.wallets.get('u_buyer')).toBe(60_000n);
    expect(L.getHeld()).toBe(40_000n);
    expect(res.state).toBe('PROPOSED');
    expect(res.deepLink).toBe(`https://t.me/swifthum_bot?start=escrow_${res.joinCode}`);
  });

  it('rejects creating with insufficient funds', async () => {
    const L = makeService({ wallets: { u_buyer: 10_000n }, users: [buyer()] });
    await expect(L.svc.createEscrow('u_buyer', 40_000)).rejects.toMatchObject({ code: 'insufficient_balance' });
  });

  it('binds the counterparty on join and rejects self-join', async () => {
    const L = makeService({ escrows: [escrow()], wallets: { u_buyer: 0n }, users: [buyer(), seller()] });
    await expect(L.svc.joinEscrow('u_buyer', 'joincode_abcdef')).rejects.toMatchObject({ code: 'validation_error' });
    const res = await L.svc.joinEscrow('u_seller', 'joincode_abcdef');
    expect(L.escrows.get('esc_1')!.counterpartyId).toBe('u_seller');
    expect(res.role).toBe('seller');
  });

  it('is single-use: a different second joiner is rejected', async () => {
    const L = makeService({ escrows: [escrow({ counterpartyId: 'u_seller' })], wallets: {}, users: [buyer(), seller(), { ...seller(), id: 'u_other', telegramId: 9n }] });
    await expect(L.svc.joinEscrow('u_other', 'joincode_abcdef')).rejects.toMatchObject({ code: 'already_redeemed' });
  });
});

describe('EscrowService happy path (two-step release)', () => {
  it('create → join → accept → mark-paid → release credits the seller + emits a receipt', async () => {
    const L = makeService({ wallets: { u_buyer: 100_000n, u_seller: 0n }, users: [buyer(), seller()] });
    const created = await L.svc.createEscrow('u_buyer', 50_000, 'sneakers');
    const id = created.escrowId;
    await L.svc.joinEscrow('u_seller', created.joinCode);
    await L.svc.accept('u_seller', id);
    expect(L.escrows.get(id)!.state).toBe('ACCEPTED');
    await L.svc.markPaid('u_buyer', id);
    expect(L.escrows.get(id)!.state).toBe('PAID_MARKED');
    const released = await L.svc.release('u_seller', id);
    expect(released.state).toBe('COMPLETED');
    expect(L.wallets.get('u_seller')).toBe(50_000n);
    expect(L.getHeld()).toBe(0n);
    expect(L.receipts.emit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceType: 'escrow', toUserId: 'u_seller', amountMinor: 50_000n }),
    );
  });
});

describe('EscrowService branch transitions', () => {
  it('decline refunds the buyer and sets DECLINED', async () => {
    const L = makeService({ escrows: [escrow({ counterpartyId: 'u_seller' })], wallets: { u_buyer: 0n }, users: [buyer(), seller()] });
    await L.svc.decline('u_seller', 'esc_1');
    expect(L.escrows.get('esc_1')!.state).toBe('DECLINED');
    expect(L.wallets.get('u_buyer')).toBe(50_000n);
  });

  it('cancel (creator, PROPOSED) refunds and is idempotent once cancelled', async () => {
    const L = makeService({ escrows: [escrow()], wallets: { u_buyer: 0n }, users: [buyer()] });
    await L.svc.cancel('u_buyer', 'esc_1');
    expect(L.escrows.get('esc_1')!.state).toBe('CANCELLED');
    expect(L.wallets.get('u_buyer')).toBe(50_000n);
    const again = await L.svc.cancel('u_buyer', 'esc_1');
    expect(again.state).toBe('CANCELLED');
    expect(L.wallets.get('u_buyer')).toBe(50_000n); // not double-refunded
  });

  it('rejects accept by a non-counterparty and illegal transitions', async () => {
    const L = makeService({ escrows: [escrow({ counterpartyId: 'u_seller' })], wallets: {}, users: [buyer(), seller()] });
    await expect(L.svc.accept('u_buyer', 'esc_1')).rejects.toMatchObject({ code: 'validation_error' });
    // release requires PAID_MARKED; current is PROPOSED → illegal
    await expect(L.svc.release('u_seller', 'esc_1')).rejects.toBeDefined();
  });

  it('lets either party dispute from ACCEPTED', async () => {
    const L = makeService({ escrows: [escrow({ state: 'ACCEPTED', counterpartyId: 'u_seller' })], wallets: {}, users: [buyer(), seller()] });
    await L.svc.dispute('u_buyer', 'esc_1');
    expect(L.escrows.get('esc_1')!.state).toBe('DISPUTED');
  });
});

describe('EscrowService.resolveDispute (admin)', () => {
  it('release moves funds to the seller + emits a receipt', async () => {
    const L = makeService({ escrows: [escrow({ state: 'DISPUTED', counterpartyId: 'u_seller' })], wallets: { u_seller: 0n }, users: [buyer(), seller()] });
    const res = await L.svc.resolveDispute('esc_1', { decision: 'release' });
    expect(res.resolution).toBe('release');
    expect(L.escrows.get('esc_1')!.state).toBe('RESOLVED_RELEASED');
    expect(L.wallets.get('u_seller')).toBe(50_000n);
    expect(L.receipts.emit).toHaveBeenCalled();
  });

  it('refund returns funds to the buyer', async () => {
    const L = makeService({ escrows: [escrow({ state: 'DISPUTED', counterpartyId: 'u_seller' })], wallets: { u_buyer: 0n }, users: [buyer(), seller()] });
    const res = await L.svc.resolveDispute('esc_1', { decision: 'refund' });
    expect(res.resolution).toBe('refund');
    expect(L.escrows.get('esc_1')!.state).toBe('RESOLVED_REFUNDED');
    expect(L.wallets.get('u_buyer')).toBe(50_000n);
  });

  it('uses the AI suggestion when no explicit decision is given', async () => {
    const L = makeService({ escrows: [escrow({ state: 'DISPUTED', counterpartyId: 'u_seller' })], wallets: { u_seller: 0n }, users: [buyer(), seller()], aiDecision: 'release' });
    const res = await L.svc.resolveDispute('esc_1', { aiAssisted: true });
    expect(L.ai.resolveDispute).toHaveBeenCalled();
    expect(res.resolution).toBe('release');
    expect(L.wallets.get('u_seller')).toBe(50_000n);
  });

  it('rejects resolving an escrow that is not disputed', async () => {
    const L = makeService({ escrows: [escrow({ state: 'ACCEPTED', counterpartyId: 'u_seller' })], wallets: {}, users: [buyer(), seller()] });
    await expect(L.svc.resolveDispute('esc_1', { decision: 'refund' })).rejects.toMatchObject({ code: 'validation_error' });
  });
});

describe('EscrowService.expireProposed', () => {
  it('refunds + EXPIRES proposed escrows past their TTL, leaving live ones', async () => {
    const L = makeService({
      escrows: [
        escrow({ id: 'esc_old', joinCode: 'old_xxxxxxxx', ttlExpiresAt: new Date(Date.now() - 1000) }),
        escrow({ id: 'esc_live', joinCode: 'live_xxxxxxx' }),
      ],
      wallets: { u_buyer: 0n },
      users: [buyer()],
    });
    const n = await L.svc.expireProposed();
    expect(n).toBe(1);
    expect(L.escrows.get('esc_old')!.state).toBe('EXPIRED');
    expect(L.escrows.get('esc_live')!.state).toBe('PROPOSED');
    expect(L.wallets.get('u_buyer')).toBe(50_000n);
    await new Promise((r) => setImmediate(r)); // flush fire-and-forget notify
    expect(L.botPush.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'escrow_expired' }));
  });
});
