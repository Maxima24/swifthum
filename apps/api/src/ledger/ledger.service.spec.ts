import { LedgerService, type AccountRef } from './ledger.service';

/**
 * In-memory Prisma transaction-client double. Mirrors the sandbox.client /
 * payments.service spec approach (no real DB). Backs the few methods
 * LedgerService.transfer touches and lets us assert the double-entry invariants
 * from HACKFEST_PLAN §6.
 */
function makeLedger(seedWallets: Record<string, bigint> = {}) {
  type Account = {
    id: string;
    kind: string;
    ownerUserId: string | null;
    balanceMinor: bigint;
    currency: string;
  };
  const accounts = new Map<string, Account>();
  const byOwner = new Map<string, string>();
  const wallets = new Map<string, { userId: string; balanceMinor: bigint }>();
  const txns: Array<Record<string, unknown>> = [];
  const txnByKey = new Map<string, Record<string, unknown>>();
  const entries: Array<{ txId: string; accountId: string; direction: string; amountMinor: bigint }> = [];
  let idc = 0;
  const nid = (p: string) => `${p}_${++idc}`;

  const add = (a: Account) => {
    accounts.set(a.id, a);
    if (a.ownerUserId) byOwner.set(a.ownerUserId, a.id);
  };
  add({ id: 'la_treasury', kind: 'treasury', ownerUserId: null, balanceMinor: 0n, currency: 'NGN' });
  add({ id: 'la_hold', kind: 'payment_hold', ownerUserId: null, balanceMinor: 0n, currency: 'NGN' });
  for (const [userId, bal] of Object.entries(seedWallets)) {
    wallets.set(userId, { userId, balanceMinor: bal });
    add({ id: `la_w_${userId}`, kind: 'wallet', ownerUserId: userId, balanceMinor: bal, currency: 'NGN' });
  }

  const inc = (cur: bigint, data: { increment: bigint }) => cur + BigInt(data.increment);

  const tx: any = {
    $queryRaw: async () => [],
    ledgerTransaction: {
      findUnique: async ({ where }: any) => txnByKey.get(where.idempotencyKey) ?? null,
      create: async ({ data }: any) => {
        const t = { ...data };
        txns.push(t);
        if (t.idempotencyKey) txnByKey.set(t.idempotencyKey, t);
        return t;
      },
    },
    ledgerAccount: {
      findFirst: async ({ where }: any) => {
        for (const a of accounts.values()) {
          if (a.kind === where.kind && a.ownerUserId === (where.ownerUserId ?? null)) return a;
        }
        return null;
      },
      upsert: async ({ where, create }: any) => {
        const existing = byOwner.get(where.ownerUserId);
        if (existing) return accounts.get(existing);
        const a: Account = { ...create, balanceMinor: BigInt(create.balanceMinor ?? 0n) };
        add(a);
        return a;
      },
      findUniqueOrThrow: async ({ where }: any) => {
        const a = accounts.get(where.id);
        if (!a) throw new Error(`no account ${where.id}`);
        return a;
      },
      update: async ({ where, data }: any) => {
        const a = accounts.get(where.id)!;
        a.balanceMinor = inc(a.balanceMinor, data.balanceMinor);
        return a;
      },
    },
    ledgerEntry: {
      createMany: async ({ data }: any) => {
        for (const e of data) entries.push({ ...e });
        return { count: data.length };
      },
    },
    wallet: {
      update: async ({ where, data }: any) => {
        const w = wallets.get(where.userId);
        if (!w) throw new Error('no wallet');
        w.balanceMinor = inc(w.balanceMinor, data.balanceMinor);
        return w;
      },
    },
  };

  // prisma not used by transfer(); pass a stub.
  const svc = new LedgerService({} as any);
  // override id generation determinism isn't needed; cuid2 ids are fine.
  void nid;

  const balanceFromEntries = (accountId: string): bigint =>
    entries
      .filter((e) => e.accountId === accountId)
      .reduce((acc, e) => acc + (e.direction === 'credit' ? e.amountMinor : -e.amountMinor), 0n);

  return { svc, tx, accounts, entries, wallets, txns, balanceFromEntries };
}

const W = (userId: string): AccountRef => ({ wallet: userId });

describe('LedgerService.transfer', () => {
  it('moves funds, balances debits==credits, and mirrors the Wallet row', async () => {
    const L = makeLedger({ u1: 100_000n });
    await L.svc.transfer(L.tx, {
      from: W('u1'),
      to: { system: 'payment_hold' },
      amountMinor: 30_000n,
      kind: 'reserve',
    });

    expect(L.accounts.get('la_w_u1')!.balanceMinor).toBe(70_000n);
    expect(L.wallets.get('u1')!.balanceMinor).toBe(70_000n); // mirrored
    expect(L.accounts.get('la_hold')!.balanceMinor).toBe(30_000n);

    // Σ debits == Σ credits for the single tx.
    const debits = L.entries.filter((e) => e.direction === 'debit').reduce((a, e) => a + e.amountMinor, 0n);
    const credits = L.entries.filter((e) => e.direction === 'credit').reduce((a, e) => a + e.amountMinor, 0n);
    expect(debits).toBe(credits);

    // Cached balance == Σ entries per account.
    expect(L.accounts.get('la_w_u1')!.balanceMinor).toBe(100_000n + L.balanceFromEntries('la_w_u1'));
    expect(L.accounts.get('la_hold')!.balanceMinor).toBe(L.balanceFromEntries('la_hold'));
  });

  it('rejects insufficient funds from a non-treasury account', async () => {
    const L = makeLedger({ u1: 50_000n });
    await expect(
      L.svc.transfer(L.tx, {
        from: W('u1'),
        to: { system: 'payment_hold' },
        amountMinor: 60_000n,
        kind: 'reserve',
      }),
    ).rejects.toMatchObject({ code: 'insufficient_balance' });
    expect(L.wallets.get('u1')!.balanceMinor).toBe(50_000n); // untouched
  });

  it('lets treasury go negative (it is the money source)', async () => {
    const L = makeLedger({ u1: 0n });
    await L.svc.transfer(L.tx, {
      from: { system: 'treasury' },
      to: W('u1'),
      amountMinor: 100_000n,
      kind: 'seed',
    });
    expect(L.accounts.get('la_treasury')!.balanceMinor).toBe(-100_000n);
    expect(L.wallets.get('u1')!.balanceMinor).toBe(100_000n);
  });

  it('is idempotent: a replayed key returns the original and never double-moves', async () => {
    const L = makeLedger({ u1: 100_000n });
    const args = {
      from: W('u1'),
      to: { system: 'payment_hold' } as AccountRef,
      amountMinor: 40_000n,
      kind: 'reserve',
      idempotencyKey: 'reserve_i_1',
    };
    const first = await L.svc.transfer(L.tx, args);
    const second = await L.svc.transfer(L.tx, args);

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
    expect(L.wallets.get('u1')!.balanceMinor).toBe(60_000n); // moved exactly once
    expect(L.txns).toHaveLength(1);
  });

  it('rejects a non-positive amount', async () => {
    const L = makeLedger({ u1: 100_000n });
    await expect(
      L.svc.transfer(L.tx, { from: W('u1'), to: { system: 'payment_hold' }, amountMinor: 0n, kind: 'reserve' }),
    ).rejects.toMatchObject({ code: 'validation_error' });
  });
});
