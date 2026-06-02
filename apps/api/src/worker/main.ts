import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';
import { WatcherProcessor } from './watcher.processor';
import { WorkerModule } from './worker.module';

const QUEUE_NAME = 'watcher';
const JOB_NAME = 'tick';
const SCHEDULER_KEY = 'watcher-tick-scheduler';

async function bootstrap() {
  const logger = new Logger('WorkerMain');
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });
  const config = app.get(ConfigService);
  const processor = app.get(WatcherProcessor);
  const tickSec = Number(config.get<string>('WATCHER_TICK_INTERVAL_SEC', '20'));
  const redisUrl = config.get<string>('REDIS_URL', 'redis://localhost:6379');

  // BullMQ requires maxRetriesPerRequest: null on its connection. We pass an
  // ioredis instance; the `as unknown as ConnectionOptions` cast sidesteps a
  // pnpm duplicate-package type mismatch (bullmq bundles a slightly older ioredis
  // type than the one we resolve) — it's a genuine ioredis client at runtime.
  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
  }) as unknown as ConnectionOptions;

  const queue = new Queue(QUEUE_NAME, { connection });

  // Register a repeating "tick" job. Idempotent via upsertJobScheduler.
  await queue.upsertJobScheduler(
    SCHEDULER_KEY,
    { every: tickSec * 1000 },
    { name: JOB_NAME, data: {} },
  );
  logger.log(`scheduler registered: every ${tickSec}s`);

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      if (job.name === JOB_NAME) {
        await processor.tick();
      }
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    logger.error(`job ${job?.id ?? '?'} failed: ${err.message}`);
  });
  worker.on('ready', () => logger.log('worker ready'));

  const shutdown = async (signal: string) => {
    logger.log(`received ${signal} — shutting down`);
    await worker.close();
    await queue.close();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('worker bootstrap failed:', err);
  process.exit(1);
});
