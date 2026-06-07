import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export const NOTIFICATIONS_CHANNEL = 'swifthum.notifications';

export type RuleFiredOutcome = 'success' | 'failed' | 'simulated';

export type NotificationPayload =
  | {
      telegramId: number;
      type: 'rule_fired';
      data: {
        ruleName: string;
        action: 'buy' | 'sell' | 'alert';
        amountMinor?: number;
        currency?: string;
        priceMinor: number;
        outcome: RuleFiredOutcome;
      };
    }
  | {
      telegramId: number;
      type: 'payment_received' | 'payment_sent';
      data: { amountMinor: number; counterpartyName: string };
    }
  | {
      telegramId: number;
      type: 'gift_received' | 'gift_claimed';
      data: { amountMinor: number; counterpartyName: string };
    }
  | {
      telegramId: number;
      type: 'gift_expired';
      data: { amountMinor: number };
    }
  | {
      telegramId: number;
      type: 'weekly_digest';
      data: {
        rulesFiredCount: number;
        transactionsCount: number;
        digestSummary: string;
      };
    };

/**
 * Publishes notifications on the Redis pub/sub channel `swifthum.notifications`.
 * The Python bot (apps/bot/) subscribes and DMs the user via aiogram. The API
 * never DMs Telegram directly — this keeps the bot's rate-limit handling in one
 * place and lets us swap the channel later (queue, Kafka, etc) without touching
 * business modules.
 *
 * **Always publish after the DB transaction commits**, not inside it. Otherwise
 * a rolled-back commit can still send a "payment received" DM.
 */
@Injectable()
export class BotPushService {
  private readonly logger = new Logger('BotPush');

  constructor(private readonly redis: RedisService) {}

  async publish(payload: NotificationPayload): Promise<void> {
    try {
      await this.redis.client.publish(NOTIFICATIONS_CHANNEL, JSON.stringify(payload));
    } catch (err) {
      this.logger.warn(`publish failed: ${(err as Error).message}`);
    }
  }
}
