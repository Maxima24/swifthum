import { IdempotencyService } from './idempotency.service';
import type { RedisService } from '../redis/redis.service';

/** Minimal in-memory Redis double supporting get + set(EX, NX). */
function makeRedis() {
  const store = new Map<string, string>();
  const client = {
    get: jest.fn(async (k: string) => store.get(k) ?? null),
    set: jest.fn(async (k: string, v: string, _ex?: string, _ttl?: number, nx?: string) => {
      if (nx === 'NX' && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    }),
  };
  return { redis: { client } as unknown as RedisService, client, store };
}

describe('IdempotencyService', () => {
  it('runs the fn and caches the result on first call', async () => {
    const { redis } = makeRedis();
    const svc = new IdempotencyService(redis);
    const fn = jest.fn(async () => ({ ok: true, n: 1 }));
    const res = await svc.run('k1', fn);
    expect(res).toEqual({ ok: true, n: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns the cached result on replay without re-running', async () => {
    const { redis } = makeRedis();
    const svc = new IdempotencyService(redis);
    const fn = jest.fn(async () => ({ value: 42 }));
    const first = await svc.run('k2', fn);
    const second = await svc.run('k2', fn);
    expect(second).toEqual(first);
    expect(fn).toHaveBeenCalledTimes(1); // ran once
  });

  it('always runs when no key is supplied', async () => {
    const { redis } = makeRedis();
    const svc = new IdempotencyService(redis);
    const fn = jest.fn(async () => 1);
    await svc.run(undefined, fn);
    await svc.run(undefined, fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('falls back to executing fn if Redis read throws', async () => {
    const { redis, client } = makeRedis();
    client.get.mockRejectedValueOnce(new Error('redis down'));
    const svc = new IdempotencyService(redis);
    const fn = jest.fn(async () => 'done');
    expect(await svc.run('k3', fn)).toBe('done');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
