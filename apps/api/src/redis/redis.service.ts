import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Wraps two ioredis clients:
 *  - `client` — for normal commands (GET, SET, etc.) and publishing
 *  - `subscriber` — separate connection because ioredis subscribe-mode is exclusive
 *
 * BullMQ instantiates its own connections from `REDIS_URL`; we don't share with it.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Redis');
  readonly client: Redis;
  readonly subscriber: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(url, { maxRetriesPerRequest: null });
    this.subscriber = new Redis(url, { maxRetriesPerRequest: null });
  }

  async onModuleInit() {
    this.client.on('error', (e) => this.logger.error(`client error: ${e.message}`));
    this.subscriber.on('error', (e) => this.logger.error(`subscriber error: ${e.message}`));
  }

  async onModuleDestroy() {
    await this.client.quit().catch(() => undefined);
    await this.subscriber.quit().catch(() => undefined);
  }
}
