import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { Errors } from '../common/errors';
import { prefixedId } from '../common/ids';
import { BotPushService } from '../bot/bot-push.service';
import { AnthropicService, type ParsePaymentResult } from '../ai/anthropic.service';
import { hashToken, signToken, verifyToken } from './payment-token';

const TRANSACTIONS_PAGE_DEFAULT = 50;
const TRANSACTIONS_PAGE_MAX = 100;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger('Payments');
  private readonly tokenSecret: string;
  private readonly intentTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly botPush: BotPushService,
    private readonly ai: AnthropicService,
    config: ConfigService,
  ) {
    this.tokenSecret = config.getOrThrow<string>('PAYMENT_TOKEN_SECRET');
    this.intentTtlSec = Number(config.get<string>('PAYMENT_INTENT_TTL_SEC', '30'));
  }

  /**
   * Natural-language payment parse. Delegates to AnthropicService which has a
   * 3s timeout + static fallback, so this always resolves to a ParsePaymentResult.
   * The bot uses this to turn "Abeg send Bayo 5k" into a confirmation card.
   */
  parseText(_userId: string, text: string): Promise<ParsePaymentResult> {
    return this.ai.parsePayment(text);
  }

  /**
   * Sender creates an intent. We **debit the sender immediately** to reserve
   * funds. Expired unconsumed intents are refunded by the worker (see
   * IntentRefunder). This avoids the "phantom balance" race where two intents
   * can be issued for funds that don't both exist.
   */
  async createIntent(userId: string, amountMinor: number) {
    const amount = BigInt(amountMinor);
    const expiresAt = new Date(Date.now() + this.intentTtlSec * 1000);
    const intentId = prefixedId('i');

    // Sign the token first (it has no DB dependency). We need the hash for the row.
    const token = signToken(
      { i: intentId, a: amountMinor, e: Math.floor(expiresAt.getTime() / 1000) },
      this.tokenSecret,
    );
    const tokenHashValue = hashToken(token);

    // Score fraud risk BEFORE opening the transaction so the (up to 3s) AI call
    // never holds the wallet row lock. scoreFraud has its own timeout + fallback,
    // so this resolves quickly and never throws.
    const riskScore = await this.computeRiskScore(userId, amountMinor);

    return this.prisma.$transaction(
      async (tx) => {
        // Reserve funds: wallet → payment_hold. LedgerService locks the accounts,
        // asserts sufficient balance (throws insufficient_balance), and keeps the
        // mirrored Wallet.balanceMinor in lockstep.
        await this.ledger.transfer(tx, {
          from: { wallet: userId },
          to: { system: 'payment_hold' },
          amountMinor: amount,
          kind: 'reserve',
          idempotencyKey: `reserve_${intentId}`,
          metadata: { intentId },
        });

        await tx.paymentIntent.create({
          data: {
            id: intentId,
            senderId: userId,
            amountMinor: amount,
            currency: 'NGN',
            tokenHash: tokenHashValue,
            expiresAt,
            riskScore,
          },
        });

        return {
          intentId,
          token,
          amountMinor,
          currency: 'NGN' as const,
          expiresAt: expiresAt.toISOString(),
          riskScore,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Gather lightweight sender context (balance + this week's send activity) and
   * ask the AI for a 0..1 fraud score. Non-locking reads — purely informational.
   * Falls back to the column default (0.1) if anything is missing.
   */
  private async computeRiskScore(userId: string, amountMinor: number): Promise<number> {
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [wallet, weekly] = await Promise.all([
        this.prisma.wallet.findUnique({ where: { userId } }),
        this.prisma.transaction.aggregate({
          where: { userId, direction: 'sent', settledAt: { gte: since } },
          _sum: { amountMinor: true },
          _count: true,
        }),
      ]);
      const { score } = await this.ai.scoreFraud({
        amountMinor,
        walletBalanceMinor: Number(wallet?.balanceMinor ?? 0n),
        weeklySentMinor: Number(weekly._sum.amountMinor ?? 0n),
        weeklySentCount: weekly._count,
      });
      return score;
    } catch (err) {
      this.logger.warn(`computeRiskScore failed (${(err as Error).message}); using default`);
      return 0.1;
    }
  }

  /**
   * Receiver redeems the audio-borne token. Credits the receiver, marks the
   * intent consumed, writes two ledger rows (sender's "sent" + receiver's
   * "received"), and (after commit) publishes both push notifications.
   *
   * No debit here — the sender was debited at intent creation.
   */
  async redeem(receiverId: string, token: string) {
    const v = verifyToken(token, this.tokenSecret);
    if (!v.ok) {
      if (v.reason === 'expired') throw Errors.expired();
      throw Errors.invalidOrExpired();
    }
    const { payload, tokenHash } = v;

    type RedeemSuccess = {
      intent: { id: string; amountMinor: bigint; senderId: string };
      senderName: string;
      receiverName: string;
    };

    const result = await this.prisma.$transaction<RedeemSuccess>(
      async (tx) => {
        const intent = await tx.paymentIntent.findUnique({ where: { tokenHash } });
        if (!intent) throw Errors.invalidOrExpired();
        if (intent.id !== payload.i) throw Errors.invalidOrExpired();
        if (intent.consumedAt) throw Errors.alreadyRedeemed();
        // The sender may have cancelled (refunded) — never credit a refunded intent.
        if (intent.refundedAt) throw Errors.invalidOrExpired();
        if (intent.expiresAt.getTime() <= Date.now()) throw Errors.expired();
        if (intent.senderId === receiverId) {
          throw Errors.validation('cannot redeem your own intent');
        }

        const [sender, receiver] = await Promise.all([
          tx.user.findUnique({ where: { id: intent.senderId } }),
          tx.user.findUnique({ where: { id: receiverId } }),
        ]);
        if (!sender || !receiver) throw Errors.invalidOrExpired();

        // Release the held funds to the receiver: payment_hold → receiver wallet.
        await this.ledger.transfer(tx, {
          from: { system: 'payment_hold' },
          to: { wallet: receiverId },
          amountMinor: intent.amountMinor,
          kind: 'redeem',
          idempotencyKey: `redeem_${intent.id}`,
          metadata: { intentId: intent.id, senderId: intent.senderId },
        });

        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { consumedAt: new Date() },
        });

        await tx.usedNonce.create({ data: { tokenHash } });

        await tx.transaction.createMany({
          data: [
            {
              id: prefixedId('tx'),
              userId: sender.id,
              direction: 'sent',
              amountMinor: intent.amountMinor,
              currency: 'NGN',
              counterpartyName: receiver.displayName,
              intentId: intent.id,
            },
            {
              id: prefixedId('tx'),
              userId: receiver.id,
              direction: 'received',
              amountMinor: intent.amountMinor,
              currency: 'NGN',
              counterpartyName: sender.displayName,
              intentId: intent.id,
            },
          ],
        });

        return {
          intent: { id: intent.id, amountMinor: intent.amountMinor, senderId: sender.id },
          senderName: sender.displayName,
          receiverName: receiver.displayName,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Fire-and-forget notifications AFTER commit.
    void this.publishRedeemNotifications(result, receiverId);

    return {
      status: 'ok' as const,
      intentId: result.intent.id,
      amountMinor: Number(result.intent.amountMinor),
      currency: 'NGN' as const,
      sender: { displayName: result.senderName },
    };
  }

  /**
   * Sender cancels an unredeemed intent and gets the reserved funds back
   * immediately (instead of waiting for the expiry sweep). Idempotent: a
   * already-refunded intent returns ok; a consumed (completed) one throws.
   */
  async cancelIntent(userId: string, intentId: string): Promise<{ status: 'refunded' }> {
    return this.prisma.$transaction(
      async (tx) => {
        const intent = await tx.paymentIntent.findUnique({ where: { id: intentId } });
        if (!intent || intent.senderId !== userId) throw Errors.notFound('intent not found');
        if (intent.consumedAt) throw Errors.alreadyRedeemed();
        if (intent.refundedAt) return { status: 'refunded' as const }; // idempotent

        // Return the held funds: payment_hold → sender wallet. The shared
        // `refund_<id>` key means cancel and the expiry sweep can never both
        // refund the same intent (unique LedgerTransaction.idempotencyKey).
        await this.ledger.transfer(tx, {
          from: { system: 'payment_hold' },
          to: { wallet: intent.senderId },
          amountMinor: intent.amountMinor,
          kind: 'refund',
          idempotencyKey: `refund_${intent.id}`,
          metadata: { intentId: intent.id, reason: 'cancel' },
        });
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { refundedAt: new Date() },
        });
        return { status: 'refunded' as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Sender polls their intent to learn when the receiver scanned. On `completed`
   * we surface the receiver's name (from the sender's "sent" ledger row).
   */
  async getIntentStatus(userId: string, intentId: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id: intentId } });
    if (!intent || intent.senderId !== userId) throw Errors.notFound('intent not found');

    let status: 'pending' | 'completed' | 'refunded' | 'expired';
    let counterparty: { displayName: string } | undefined;
    if (intent.consumedAt) {
      status = 'completed';
      const sentTx = await this.prisma.transaction.findFirst({
        where: { userId, intentId, direction: 'sent' },
      });
      if (sentTx) counterparty = { displayName: sentTx.counterpartyName };
    } else if (intent.refundedAt) {
      status = 'refunded';
    } else if (intent.expiresAt.getTime() <= Date.now()) {
      status = 'expired';
    } else {
      status = 'pending';
    }

    return {
      status,
      amountMinor: Number(intent.amountMinor),
      currency: 'NGN' as const,
      expiresAt: intent.expiresAt.toISOString(),
      ...(counterparty ? { counterparty } : {}),
    };
  }

  async listTransactions(userId: string, cursor: string | undefined, limit: number | undefined) {
    const take = Math.min(limit ?? TRANSACTIONS_PAGE_DEFAULT, TRANSACTIONS_PAGE_MAX);
    const rows = await this.prisma.transaction.findMany({
      where: { userId },
      orderBy: [{ settledAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const items = rows.slice(0, take);
    const nextCursor = rows.length > take ? items[items.length - 1].id : null;
    return {
      items: items.map((t) => ({
        id: t.id,
        direction: t.direction as 'sent' | 'received',
        amountMinor: t.amountMinor,
        currency: t.currency,
        counterparty: { displayName: t.counterpartyName },
        settledAt: t.settledAt.toISOString(),
      })),
      nextCursor,
    };
  }

  // ─── worker helper ──────────────────────────────────────────────

  /**
   * Find expired+unconsumed intents and refund the reserved amount to the sender.
   * Called periodically by the IntentRefunder worker. Returns the number of
   * intents refunded.
   */
  async refundExpiredIntents(): Promise<number> {
    const due = await this.prisma.paymentIntent.findMany({
      where: { consumedAt: null, refundedAt: null, expiresAt: { lt: new Date() } },
      take: 100,
    });
    let refunded = 0;
    for (const intent of due) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const fresh = await tx.paymentIntent.findUnique({ where: { id: intent.id } });
            if (!fresh || fresh.consumedAt || fresh.refundedAt) return;
            await this.ledger.transfer(tx, {
              from: { system: 'payment_hold' },
              to: { wallet: fresh.senderId },
              amountMinor: fresh.amountMinor,
              kind: 'refund',
              idempotencyKey: `refund_${fresh.id}`,
              metadata: { intentId: fresh.id, reason: 'expiry' },
            });
            await tx.paymentIntent.update({
              where: { id: fresh.id },
              data: { refundedAt: new Date() },
            });
            refunded++;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (err) {
        this.logger.warn(`refund failed for intent ${intent.id}: ${(err as Error).message}`);
      }
    }
    return refunded;
  }

  // ─── helpers ────────────────────────────────────────────────────

  private async publishRedeemNotifications(
    result: {
      intent: { amountMinor: bigint; senderId: string };
      senderName: string;
      receiverName: string;
    },
    receiverId: string,
  ) {
    try {
      // Look up both parties by id (the sender via intent.senderId, not a fragile
      // displayName match) so the right user gets the DM.
      const [receiver, sender] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: receiverId } }),
        this.prisma.user.findUnique({ where: { id: result.intent.senderId } }),
      ]);
      if (receiver && receiver.notificationsEnabled) {
        this.logger.log(`publishing payment_received → telegramId=${receiver.telegramId}`);
        await this.botPush.publish({
          telegramId: Number(receiver.telegramId),
          type: 'payment_received',
          data: {
            amountMinor: Number(result.intent.amountMinor),
            counterpartyName: result.senderName,
          },
        });
      }
      if (sender && sender.notificationsEnabled) {
        this.logger.log(`publishing payment_sent → telegramId=${sender.telegramId}`);
        await this.botPush.publish({
          telegramId: Number(sender.telegramId),
          type: 'payment_sent',
          data: {
            amountMinor: Number(result.intent.amountMinor),
            counterpartyName: result.receiverName,
          },
        });
      }
    } catch (err) {
      this.logger.warn(`publish redeem notifications failed: ${(err as Error).message}`);
    }
  }
}
