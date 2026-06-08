import { UsersService } from './users.service';

interface FakeUser {
  id: string;
  username: string | null;
  email: string | null;
  displayName: string;
  telegramId: bigint;
  notificationsEnabled: boolean;
}

function makeService(seed: FakeUser[] = []) {
  const users = new Map<string, FakeUser>(seed.map((u) => [u.id, u]));
  const find = (where: any): FakeUser | null => {
    if (where.id) return users.get(where.id) ?? null;
    if (where.username !== undefined)
      return [...users.values()].find((u) => u.username === where.username) ?? null;
    if (where.telegramId !== undefined)
      return [...users.values()].find((u) => u.telegramId === where.telegramId) ?? null;
    return null;
  };

  const db: any = {
    // Array-form $transaction: the ops already executed eagerly in our fake.
    $transaction: async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
    user: {
      findUnique: async ({ where }: any) => find(where),
      update: async ({ where, data }: any) => {
        const u = users.get(where.id)!;
        Object.assign(u, data);
        return u;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const u of users.values()) {
          const usernameMatch = where.username === undefined || u.username === where.username;
          const notMatch = !where.NOT || u.id !== where.NOT.id;
          if (usernameMatch && notMatch) {
            Object.assign(u, data);
            count++;
          }
        }
        return { count };
      },
    },
  };

  const svc = new UsersService(db, {} as any);
  return { svc, users };
}

const user = (over: Partial<FakeUser> = {}): FakeUser => ({
  id: 'u_a',
  username: null,
  email: null,
  displayName: 'Ada',
  telegramId: 1n,
  notificationsEnabled: true,
  ...over,
});

describe('UsersService.lookupByUsername', () => {
  it('finds a user (case-insensitive, strips @)', async () => {
    const { svc } = makeService([user({ id: 'u_a', username: 'ada', displayName: 'Ada O.' })]);
    const res = await svc.lookupByUsername('@Ada');
    expect(res.found).toBe(true);
    expect(res.displayName).toBe('Ada O.');
    expect(res.username).toBe('ada');
  });

  it('returns not-found for an unknown handle', async () => {
    const { svc } = makeService([]);
    expect((await svc.lookupByUsername('nobody')).found).toBe(false);
  });

  it('returns not-found for a too-short / invalid handle', async () => {
    const { svc } = makeService([]);
    expect((await svc.lookupByUsername('ab')).found).toBe(false);
    expect((await svc.lookupByUsername('@@!!')).found).toBe(false);
  });
});

describe('UsersService.findByUsername', () => {
  it('resolves a handle to the user row', async () => {
    const { svc } = makeService([user({ id: 'u_a', username: 'bob' })]);
    expect((await svc.findByUsername('@BOB'))?.id).toBe('u_a');
    expect(await svc.findByUsername('ghost')).toBeNull();
  });
});

describe('UsersService.updatePreferences (email)', () => {
  it('persists and normalizes (lowercase/trim) the receipt email', async () => {
    const { svc, users } = makeService([user({ id: 'u_a' })]);
    const res = await svc.updatePreferences('u_a', { email: '  Ada@Gmail.com ' });
    expect(users.get('u_a')!.email).toBe('ada@gmail.com');
    expect(res.email).toBe('ada@gmail.com');
  });
});

describe('UsersService username claim (steal-reassign)', () => {
  it('moves a re-used handle from its stale owner to the current one', async () => {
    const { svc, users } = makeService([
      user({ id: 'u_old', username: 'bob', displayName: 'Old Bob' }),
      user({ id: 'u_new', username: null, displayName: 'New Bob' }),
    ]);
    // applyUsername is private — exercised here directly (it's the core invariant).
    await (svc as unknown as { applyUsername: (id: string, h: string) => Promise<void> }).applyUsername(
      'u_new',
      '@Bob',
    );
    expect(users.get('u_old')!.username).toBeNull();
    expect(users.get('u_new')!.username).toBe('bob');
  });
});
