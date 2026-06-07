import type { ConfigService } from '@nestjs/config';
import { GiftsService } from './gifts.service';
import { Errors } from '../common/errors';
import type { AccountRef, LedgerService, TransferArgs } from '../ledger/ledger.service';

interface SeedGift {
  id: string;
  senderId: string;
  asset: string;
  amountMinor: bigint;
  message: string | null;
  claimCode: string;
  state: string;
  claimedByUserId: string | null;
  ttlExpiresAt: Date;
  stateUpdatedAt: Date;
  createdAt: Date;
  claimedAt: Date | null;
}

interface SeedUser {
  id: string;
  displayName: string;
  telegramId: bigint;
  notificationsEnabled: boolean;
  acquiredVia: string | null;
}

function gift(over: Partial<SeedGift> = {}): SeedGift {
  return {
    id: 'g_1',
    senderId: 'u_sender',
    asset: 'NGN',
    amountMinor: 50_000n,
    message: null,
    claimCode: 'code_abcdefghij',
    state: 'UNCLAIMED',
    claimedByUserId: null,
    ttlExpiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    stateUpdatedAt: new Date(),
    createdAt: new Date(),
    claimedAt: null,
    ...over,
  };
}

function makeService(seed: {
  gifts?: SeedGift[];
  wallets?: Record<string, bigint>;
  users?: SeedUser[];
}) {
  const gifts = new Map<string, SeedGift>((seed.gifts ?? []).map((g) => [g.id, g]));
  const wallets = new Map<string, bigint>(
    Object.entries(seed.wallets ?? {}).map(([id, b]) => [id, b]),
  );
  const users = new Map<string, SeedUser>((seed.users ?? []).map((u) => [u.id, u]));
  let held = 0n; // gift_unclaimed system balance

  const byCode = (c: string) => [...gifts.values()].find((g) => g.claimCode === c) ?? null;

  const db: any = {
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
    gift: {
      create: async ({ data }: any) => {
        const row: SeedGift = {
          ...gift(),
          ...data,
          createdAt: new Date(),
          stateUpdatedAt: new Date(),
          claimedAt: null,
          claimedByUserId: null,
        };
        gifts.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }: any) =>
        where.id ? (gifts.get(where.id) ?? null) : byCode(where.claimCode),
      findMany: async ({ where }: any) => {
        let rows = [...gifts.values()];
        if (where?.senderId) rows = rows.filter((g) => g.senderId === where.senderId);
        if (where?.state) rows = rows.filter((g) => g.state === where.state);
        if (where?.ttlExpiresAt?.lt) {
          rows = rows.filter((g) => g.ttlExpiresAt.getTime() < where.ttlExpiresAt.lt.getTime());
        }
        return rows.map((g) => ({
          ...g,
          claimedBy: g.claimedByUserId
            ? { displayName: users.get(g.claimedByUserId)?.displayName ?? '?' }
            : null,
        }));
      },
      updateMany: async ({ where, data }: any) => {
        const g = gifts.get(where.id);
        if (!g) return { count: 0 };
        if (where.state && g.state !== where.state) return { count: 0 };
        Object.assign(g, data);
        return { count: 1 };
      },
    },
    user: {
      findUnique: async ({ where }: any) => users.get(where.id) ?? null,
      update: async ({ where, data }: any) => {
        const u = users.get(where.id)!;
        Object.assign(u, data);
        return u;
      },
    },
  };

  const walletDelta = (ref: AccountRef, delta: bigint) => {
    if ('wallet' in ref) wallets.set(ref.wallet, (wallets.get(ref.wallet) ?? 0n) + delta);
    else if (ref.system === 'gift_unclaimed') held += delta;
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

  const botPush = { publish: jest.fn(async () => undefined) } as any;
  const config = {
    get: (k: string, d?: string) => (k === 'BOT_USERNAME' ? 'swifthum_bot' : d),
  } as unknown as ConfigService;

  const svc = new GiftsService(db, ledger, botPush, config);
  return { svc, gifts, wallets, users, botPush, ledger, getHeld: () => held };
}

const sender = (): SeedUser => ({
  id: 'u_sender',
  displayName: 'Ada',
  telegramId: 100n,
  notificationsEnabled: true,
  acquiredVia: null,
});
const recipient = (): SeedUser => ({
  id: 'u_recv',
  displayName: 'Bayo',
  telegramId: 200n,
  notificationsEnabled: true,
  acquiredVia: null,
});

describe('GiftsService.createGift', () => {
  it('locks funds into gift_unclaimed and returns a claim deep-link', async () => {
    const { svc, wallets, getHeld } = makeService({
      wallets: { u_sender: 100_000n },
      users: [sender()],
    });
    const res = await svc.createGift('u_sender', 30_000, 'enjoy');
    expect(wallets.get('u_sender')).toBe(70_000n);
    expect(getHeld()).toBe(30_000n);
    expect(res.amountMinor).toBe(30_000);
    expect(res.state).toBe('UNCLAIMED');
    expect(res.deepLink).toBe(`https://t.me/swifthum_bot?start=gift_${res.claimCode}`);
  });

  it('rejects when the sender has insufficient balance', async () => {
    const { svc } = makeService({ wallets: { u_sender: 10_000n }, users: [sender()] });
    await expect(svc.createGift('u_sender', 30_000)).rejects.toMatchObject({
      code: 'insufficient_balance',
    });
  });
});

describe('GiftsService.claimGift', () => {
  it('credits the recipient, marks CLAIMED, tags acquiredVia, and DMs both', async () => {
    const { svc, wallets, gifts, users, botPush } = makeService({
      gifts: [gift({ amountMinor: 50_000n })],
      wallets: { u_recv: 0n },
      users: [sender(), recipient()],
    });
    const res = await svc.claimGift('u_recv', 'code_abcdefghij');
    expect(res.status).toBe('ok');
    expect(res.amountMinor).toBe(50_000);
    expect(res.sender.displayName).toBe('Ada');
    expect(wallets.get('u_recv')).toBe(50_000n);
    expect(gifts.get('g_1')!.state).toBe('CLAIMED');
    expect(gifts.get('g_1')!.claimedByUserId).toBe('u_recv');
    expect(users.get('u_recv')!.acquiredVia).toBe('gift');
    // post-commit fire-and-forget DMs
    await new Promise((r) => setImmediate(r));
    expect(botPush.publish).toHaveBeenCalledTimes(2);
  });

  it('is single-use: a second claim is rejected and credits only once', async () => {
    const { svc, wallets } = makeService({
      gifts: [gift({ amountMinor: 50_000n })],
      wallets: { u_recv: 0n },
      users: [sender(), recipient()],
    });
    await svc.claimGift('u_recv', 'code_abcdefghij');
    await expect(svc.claimGift('u_recv', 'code_abcdefghij')).rejects.toMatchObject({
      code: 'already_redeemed',
    });
    expect(wallets.get('u_recv')).toBe(50_000n); // not doubled
  });

  it('rejects an expired gift', async () => {
    const { svc } = makeService({
      gifts: [gift({ ttlExpiresAt: new Date(Date.now() - 1000) })],
      wallets: { u_recv: 0n },
      users: [sender(), recipient()],
    });
    await expect(svc.claimGift('u_recv', 'code_abcdefghij')).rejects.toMatchObject({
      code: 'expired',
    });
  });

  it('rejects claiming your own gift', async () => {
    const { svc } = makeService({
      gifts: [gift()],
      wallets: { u_sender: 0n },
      users: [sender()],
    });
    await expect(svc.claimGift('u_sender', 'code_abcdefghij')).rejects.toMatchObject({
      code: 'validation_error',
    });
  });

  it('rejects an unknown claim code', async () => {
    const { svc } = makeService({ users: [recipient()] });
    await expect(svc.claimGift('u_recv', 'nope_nope_nope')).rejects.toMatchObject({
      code: 'invalid_or_expired',
    });
  });
});

describe('GiftsService.cancelGift', () => {
  it('refunds the sender and marks RECLAIMED', async () => {
    const { svc, wallets, gifts } = makeService({
      gifts: [gift({ amountMinor: 50_000n })],
      wallets: { u_sender: 0n },
      users: [sender()],
    });
    const res = await svc.cancelGift('u_sender', 'g_1');
    expect(res.status).toBe('reclaimed');
    expect(wallets.get('u_sender')).toBe(50_000n);
    expect(gifts.get('g_1')!.state).toBe('RECLAIMED');
  });

  it('is idempotent once reclaimed (no double refund)', async () => {
    const { svc, wallets } = makeService({
      gifts: [gift({ state: 'RECLAIMED' })],
      wallets: { u_sender: 0n },
      users: [sender()],
    });
    const res = await svc.cancelGift('u_sender', 'g_1');
    expect(res.status).toBe('reclaimed');
    expect(wallets.get('u_sender')).toBe(0n); // unchanged
  });

  it('rejects a non-owner', async () => {
    const { svc } = makeService({ gifts: [gift()], wallets: { u_sender: 0n }, users: [sender()] });
    await expect(svc.cancelGift('u_other', 'g_1')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('rejects cancelling an already-claimed gift', async () => {
    const { svc } = makeService({
      gifts: [gift({ state: 'CLAIMED' })],
      wallets: { u_sender: 0n },
      users: [sender()],
    });
    await expect(svc.cancelGift('u_sender', 'g_1')).rejects.toMatchObject({
      code: 'already_redeemed',
    });
  });
});

describe('GiftsService.expireUnclaimed', () => {
  it('refunds expired unclaimed gifts and marks them EXPIRED', async () => {
    const { svc, wallets, gifts, botPush } = makeService({
      gifts: [
        gift({ id: 'g_old', claimCode: 'old_code_xxxx', ttlExpiresAt: new Date(Date.now() - 1000) }),
        gift({ id: 'g_live', claimCode: 'live_code_xxx' }),
      ],
      wallets: { u_sender: 0n },
      users: [sender()],
    });
    const count = await svc.expireUnclaimed();
    expect(count).toBe(1);
    expect(gifts.get('g_old')!.state).toBe('EXPIRED');
    expect(gifts.get('g_live')!.state).toBe('UNCLAIMED'); // untouched
    expect(wallets.get('u_sender')).toBe(50_000n);
    expect(botPush.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gift_expired', telegramId: 100 }),
    );
  });
});
