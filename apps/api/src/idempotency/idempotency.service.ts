import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const KEY_PREFIX = 'idem:';
const DEFAULT_TTL_SEC = 24 * 60 * 60; // 24h
const IN_FLIGHT = '__in_flight__';

/**
 * HTTP-level idempotency for state-changing endpoints (gift create, escrow fund,
 * …). A client sends an `Idempotency-Key`; the first request runs and its result
 * is cached in Redis, so a retry returns the same response without re-running.
 *
 * This is the **fast path / response cache**. The hard money guarantee is the
 * unique `LedgerTransaction.idempotencyKey` (LedgerService) — the transfer can't
 * double-apply even if Redis is cold or evicted. So `run` is best-effort: if
 * Redis is unavailable it just executes `fn` (the ledger still protects funds).
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger('Idempotency');

  constructor(private readonly redis: RedisService) {}

  /**
   * Run `fn` at most once per `key`. Returns the cached result on replay.
   * Without a key, always runs (no idempotency requested).
   */
  async run<T>(key: string | undefined, fn: () => Promise<T>, ttlSec = DEFAULT_TTL_SEC): Promise<T> {
    if (!key) return fn();
    const redisKey = KEY_PREFIX + key;

    try {
      const cached = await this.redis.client.get(redisKey);
      if (cached && cached !== IN_FLIGHT) return JSON.parse(cached) as T;
      // Reserve the key so concurrent duplicates don't both run (best-effort).
      await this.redis.client.set(redisKey, IN_FLIGHT, 'EX', ttlSec, 'NX');
    } catch (err) {
      this.logger.warn(`redis read failed for ${key}; executing without cache: ${asMsg(err)}`);
      return fn();
    }

    const result = await fn();
    try {
      await this.redis.client.set(redisKey, JSON.stringify(result), 'EX', ttlSec);
    } catch (err) {
      this.logger.warn(`redis write failed for ${key}: ${asMsg(err)}`);
    }
    return result;
  }
}

function asMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
