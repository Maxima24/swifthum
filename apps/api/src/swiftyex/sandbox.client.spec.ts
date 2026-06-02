import { SandboxSwiftyexClient } from './sandbox.client';

/**
 * In-memory stand-in for the slice of PrismaService the sandbox client uses.
 * Lets us exercise buy/sell/holdings/linking logic without a database.
 */
function makeFakePrisma() {
  const holdings = new Map<string, { id: string; userId: string; asset: string; qtyBase: bigint }>();
  const orders: Array<Record<string, unknown>> = [];
  const accounts = new Map<
    string,
    { id: string; userId: string; apiKey: string; label: string | null; linkedAt: Date }
  >();
  const hkey = (userId: string, asset: string) => `${userId}:${asset}`;

  const applyIntOp = (current: bigint, op: unknown): bigint => {
    if (typeof op === 'bigint') return op;
    if (op && typeof op === 'object') {
      const o = op as Record<string, unknown>;
      if ('increment' in o) return current + BigInt(o.increment as bigint);
      if ('decrement' in o) return current - BigInt(o.decrement as bigint);
      if ('set' in o) return BigInt(o.set as bigint);
    }
    return current;
  };

  const db = {
    $executeRaw: jest.fn(async () => 0),
    $transaction: async (fn: (tx: typeof db) => unknown) => fn(db),
    swiftyexHolding: {
      findUnique: async ({ where }: any) => {
        const { userId, asset } = where.userId_asset;
        return holdings.get(hkey(userId, asset)) ?? null;
      },
      findMany: async ({ where }: any) =>
        [...holdings.values()].filter((h) => h.userId === where.userId),
      update: async ({ where, data }: any) => {
        const { userId, asset } = where.userId_asset;
        const row = holdings.get(hkey(userId, asset));
        if (!row) throw new Error('holding not found');
        row.qtyBase = applyIntOp(row.qtyBase, data.qtyBase);
        return row;
      },
      upsert: async ({ where, create, update }: any) => {
        const { userId, asset } = where.userId_asset;
        const existing = holdings.get(hkey(userId, asset));
        if (existing) {
          existing.qtyBase = applyIntOp(existing.qtyBase, update.qtyBase);
          return existing;
        }
        const row = {
          id: create.id,
          userId: create.userId,
          asset: create.asset,
          qtyBase: BigInt(create.qtyBase),
        };
        holdings.set(hkey(userId, asset), row);
        return row;
      },
    },
    swiftyexOrder: {
      create: async ({ data }: any) => {
        orders.push({ ...data });
        return data;
      },
      findFirst: async ({ where }: any) =>
        orders.find((o) => o.id === where.id && o.userId === where.userId) ?? null,
    },
    swiftyexAccount: {
      upsert: async ({ where, create, update }: any) => {
        const existing = accounts.get(where.userId);
        if (existing) {
          existing.apiKey = update.apiKey;
          existing.label = update.label ?? null;
          existing.linkedAt = update.linkedAt ?? existing.linkedAt;
          return existing;
        }
        const row = {
          id: create.id,
          userId: create.userId,
          apiKey: create.apiKey,
          label: create.label ?? null,
          linkedAt: new Date(),
        };
        accounts.set(where.userId, row);
        return row;
      },
      deleteMany: async ({ where }: any) => {
        const had = accounts.delete(where.userId);
        return { count: had ? 1 : 0 };
      },
      findUnique: async ({ where }: any) => accounts.get(where.userId) ?? null,
    },
    _state: { holdings, orders, accounts },
  };
  return db;
}

function makeClient() {
  const prisma = makeFakePrisma();
  const config = { get: (_key: string, dflt?: string) => dflt } as any;
  const client = new SandboxSwiftyexClient(prisma as any, config);
  // Stub the network price feed with clean numbers: USDT ₦1,620.
  jest
    .spyOn(client, 'currentPrices')
    .mockResolvedValue({ USDT: 1620_00n, BTC: 95_000_000_00n, ETH: 5_200_000_00n });
  return { client, prisma };
}

describe('SandboxSwiftyexClient', () => {
  it('buy increments holdings and persists a simulated order', async () => {
    const { client } = makeClient();
    // ₦16,200 at ₦1,620 → 10 USDT → 10 * 1e8 base units
    const result = await client.placeOrder({
      side: 'buy',
      asset: 'USDT',
      amountMinor: 1_620_000n,
      currency: 'NGN',
      userId: 'u1',
    });
    expect(result.status).toBe('simulated');
    expect(result.filledQtyBase).toBe(1_000_000_000n);
    expect(result.filledPriceMinor).toBe(1620_00n);

    const holdings = await client.getHoldings('u1');
    expect(holdings).toEqual([{ asset: 'USDT', qtyBase: 1_000_000_000n }]);

    const fetched = await client.getOrder('u1', result.orderId);
    expect(fetched?.orderId).toBe(result.orderId);
    expect(fetched?.status).toBe('simulated');
  });

  it('sell decrements holdings', async () => {
    const { client } = makeClient();
    await client.placeOrder({
      side: 'buy',
      asset: 'USDT',
      amountMinor: 1_620_000n,
      currency: 'NGN',
      userId: 'u1',
    });
    // Sell ₦1,620 worth → 1 USDT → -1e8
    const sell = await client.placeOrder({
      side: 'sell',
      asset: 'USDT',
      amountMinor: 162_000n,
      currency: 'NGN',
      userId: 'u1',
    });
    expect(sell.status).toBe('simulated');
    const holdings = await client.getHoldings('u1');
    expect(holdings[0].qtyBase).toBe(900_000_000n); // 10 - 1 = 9 USDT
  });

  it('oversell fails without changing holdings', async () => {
    const { client } = makeClient();
    await client.placeOrder({
      side: 'buy',
      asset: 'USDT',
      amountMinor: 162_000n, // 1 USDT
      currency: 'NGN',
      userId: 'u1',
    });
    const sell = await client.placeOrder({
      side: 'sell',
      asset: 'USDT',
      amountMinor: 16_200_000n, // tries to sell 100 USDT
      currency: 'NGN',
      userId: 'u1',
    });
    expect(sell.status).toBe('failed');
    expect(sell.errorMessage).toBe('insufficient holdings');
    const holdings = await client.getHoldings('u1');
    expect(holdings[0].qtyBase).toBe(100_000_000n); // unchanged: 1 USDT
  });

  it('links and unlinks an account', async () => {
    const { client } = makeClient();
    expect(await client.getAccount('u1')).toEqual({ linked: false });

    const linked = await client.linkAccount('u1', 'test-key-1234');
    expect(linked.linked).toBe(true);
    expect((await client.getAccount('u1')).linked).toBe(true);

    await client.unlinkAccount('u1');
    expect(await client.getAccount('u1')).toEqual({ linked: false });
  });

  it('does not store the raw credential', async () => {
    const { client, prisma } = makeClient();
    await client.linkAccount('u1', 'super-secret-key');
    const stored = prisma._state.accounts.get('u1');
    expect(stored?.apiKey).toBeDefined();
    expect(stored?.apiKey).not.toContain('super-secret-key');
  });
});
