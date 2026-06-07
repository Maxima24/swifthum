import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { BotPushService } from '../bot/bot-push.service';
import { Errors } from '../common/errors';
import { assertTransition, type TransitionMap } from '../common/fsm';
import { generateClaimCode, prefixedId } from '../common/ids';

/** Gift FSM: UNCLAIMED → CLAIMED | EXPIRED | RECLAIMED (terminal states). */
const GIFT_FSM: TransitionMap = {
  UNCLAIMED: ['CLAIMED', 'EXPIRED', 'RECLAIMED'],
  CLAIMED: [],
  EXPIRED: [],
  RECLAIMED: [],
};

type GiftRow = {
  id: string;
  senderId: string;
  asset: string;
  amountMinor: bigint;
  message: string | null;
  claimCode: string;
  state: string;
  claimedByUserId: string | null;
  ttlExpiresAt: Date;
  createdAt: Date;
  claimedAt: Date | null;
};

@Injectable()
export class GiftsService {
  private readonly logger = new Logger('Gifts');
  private readonly ttlSec: number;
  private readonly botUsername: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly receipts: ReceiptsService,
    private readonly botPush: BotPushService,
    config: ConfigService,
  ) {
    this.ttlSec = Number(config.get<string>('GIFT_TTL_HOURS', '168')) * 3600;
    this.botUsername = config.get<string>('BOT_USERNAME', 'swifthum_bot');
  }

  /**
   * Sender locks funds into a gift: wallet → gift_unclaimed. The money is held
   * in the system account until the gift is claimed or refunded (cancel/expiry).
   * Idempotency at the money layer is the unique `gift_create_<id>` ledger key;
   * HTTP-level retries are deduped by the controller's IdempotencyService.
   */
  async createGift(userId: string, amountMinor: number, message?: string) {
    const amount = BigInt(amountMinor);
    const giftId = prefixedId('g');
    const claimCode = generateClaimCode();
    const ttlExpiresAt = new Date(Date.now() + this.ttlSec * 1000);

    const gift = await this.prisma.$transaction(
      async (tx) => {
        await this.ledger.transfer(tx, {
          from: { wallet: userId },
          to: { system: 'gift_unclaimed' },
          amountMinor: amount,
          kind: 'gift_create',
          idempotencyKey: `gift_create_${giftId}`,
          metadata: { giftId },
        });
        return tx.gift.create({
          data: {
            id: giftId,
            senderId: userId,
            asset: 'NGN',
            amountMinor: amount,
            message: message?.trim() || null,
            claimCode,
            state: 'UNCLAIMED',
            ttlExpiresAt,
          },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.toCreateResult(gift);
  }

  /**
   * Recipient claims via the bot (POST /gifts/claim). The recipient is already
   * provisioned by /auth/bot/exchange, so `receiverId` exists. Single-use is
   * guaranteed by the conditional `updateMany WHERE state='UNCLAIMED'` (count
   * must be 1) inside a serializable tx — two simultaneous opens can't both win.
   */
  async claimGift(receiverId: string, claimCode: string) {
    type ClaimSuccess = {
      gift: { id: string; amountMinor: bigint; senderId: string };
      senderName: string;
      receiverName: string;
    };

    const result = await this.prisma.$transaction<ClaimSuccess>(
      async (tx) => {
        const gift = (await tx.gift.findUnique({ where: { claimCode } })) as GiftRow | null;
        if (!gift) throw Errors.invalidOrExpired('gift not found');
        if (gift.state !== 'UNCLAIMED') throw Errors.alreadyRedeemed('gift already claimed');
        if (gift.ttlExpiresAt.getTime() <= Date.now()) throw Errors.expired('gift expired');
        if (gift.senderId === receiverId) {
          throw Errors.validation('cannot claim your own gift');
        }
        // FSM guard (defensive — state is UNCLAIMED here).
        assertTransition(gift.state, 'CLAIMED', GIFT_FSM);

        // Atomic single-use claim: only one concurrent caller flips UNCLAIMED→CLAIMED.
        const claimed = await tx.gift.updateMany({
          where: { id: gift.id, state: 'UNCLAIMED' },
          data: {
            state: 'CLAIMED',
            claimedByUserId: receiverId,
            claimedAt: new Date(),
            stateUpdatedAt: new Date(),
          },
        });
        if (claimed.count !== 1) throw Errors.alreadyRedeemed('gift already claimed');

        // Release the held funds: gift_unclaimed → recipient wallet.
        await this.ledger.transfer(tx, {
          from: { system: 'gift_unclaimed' },
          to: { wallet: receiverId },
          amountMinor: gift.amountMinor,
          kind: 'gift_claim',
          idempotencyKey: `gift_claim_${gift.id}`,
          metadata: { giftId: gift.id, senderId: gift.senderId },
        });

        const [sender, receiver] = await Promise.all([
          tx.user.findUnique({ where: { id: gift.senderId } }),
          tx.user.findUnique({ where: { id: receiverId } }),
        ]);
        if (!sender || !receiver) throw Errors.invalidOrExpired('gift not found');

        // Funnel tag: mark recipients who joined/were activated via a gift.
        if (!receiver.acquiredVia) {
          await tx.user.update({
            where: { id: receiverId },
            data: { acquiredVia: 'gift' },
          });
        }

        // Emit a verifiable receipt for the claimed gift.
        await this.receipts.emit(tx, {
          sourceType: 'gift',
          sourceId: gift.id,
          fromUserId: gift.senderId,
          toUserId: receiverId,
          fromName: sender.displayName,
          toName: receiver.displayName,
          amountMinor: gift.amountMinor,
        });

        return {
          gift: { id: gift.id, amountMinor: gift.amountMinor, senderId: gift.senderId },
          senderName: sender.displayName,
          receiverName: receiver.displayName,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    void this.publishClaimNotifications(result, receiverId);

    return {
      status: 'ok' as const,
      amountMinor: Number(result.gift.amountMinor),
      currency: 'NGN' as const,
      sender: { displayName: result.senderName },
    };
  }

  /** The caller's sent gifts (newest first), with claim links + state. */
  async listGifts(userId: string) {
    const rows = (await this.prisma.gift.findMany({
      where: { senderId: userId },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
      include: { claimedBy: { select: { displayName: true } } },
    })) as Array<GiftRow & { claimedBy: { displayName: string } | null }>;

    return {
      items: rows.map((g) => ({
        id: g.id,
        amountMinor: Number(g.amountMinor),
        currency: 'NGN' as const,
        message: g.message ?? undefined,
        state: g.state as 'UNCLAIMED' | 'CLAIMED' | 'EXPIRED' | 'RECLAIMED',
        claimCode: g.claimCode,
        deepLink: this.deepLink(g.claimCode),
        ttlExpiresAt: g.ttlExpiresAt.toISOString(),
        createdAt: g.createdAt.toISOString(),
        claimedAt: g.claimedAt ? g.claimedAt.toISOString() : undefined,
        ...(g.claimedBy ? { claimedBy: { displayName: g.claimedBy.displayName } } : {}),
      })),
    };
  }

  /**
   * Sender reclaims an unclaimed gift before it's opened: gift_unclaimed →
   * sender wallet, state RECLAIMED. Shares the `gift_refund_<id>` ledger key with
   * the expiry sweep, so a gift can never be refunded twice. Idempotent.
   */
  async cancelGift(userId: string, giftId: string): Promise<{ status: 'reclaimed' }> {
    return this.prisma.$transaction(
      async (tx) => {
        const gift = (await tx.gift.findUnique({ where: { id: giftId } })) as GiftRow | null;
        if (!gift || gift.senderId !== userId) throw Errors.notFound('gift not found');
        if (gift.state === 'RECLAIMED' || gift.state === 'EXPIRED') {
          return { status: 'reclaimed' as const }; // already refunded — idempotent
        }
        if (gift.state !== 'UNCLAIMED') throw Errors.alreadyRedeemed('gift already claimed');

        const reclaimed = await tx.gift.updateMany({
          where: { id: gift.id, state: 'UNCLAIMED' },
          data: { state: 'RECLAIMED', stateUpdatedAt: new Date() },
        });
        if (reclaimed.count !== 1) throw Errors.alreadyRedeemed('gift already claimed');

        await this.ledger.transfer(tx, {
          from: { system: 'gift_unclaimed' },
          to: { wallet: gift.senderId },
          amountMinor: gift.amountMinor,
          kind: 'gift_refund',
          idempotencyKey: `gift_refund_${gift.id}`,
          metadata: { giftId: gift.id, reason: 'reclaim' },
        });
        return { status: 'reclaimed' as const };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  // ─── worker helper ──────────────────────────────────────────────

  /**
   * Refund unclaimed gifts past their TTL: gift_unclaimed → sender, state
   * EXPIRED. Mirrors PaymentsService.refundExpiredIntents; called from the
   * watcher tick. Returns the number expired.
   */
  async expireUnclaimed(): Promise<number> {
    const due = (await this.prisma.gift.findMany({
      where: { state: 'UNCLAIMED', ttlExpiresAt: { lt: new Date() } },
      take: 100,
    })) as GiftRow[];

    let expired = 0;
    for (const gift of due) {
      try {
        const sender = await this.prisma.$transaction(
          async (tx) => {
            const fresh = (await tx.gift.findUnique({ where: { id: gift.id } })) as GiftRow | null;
            if (!fresh || fresh.state !== 'UNCLAIMED') return null;

            const swept = await tx.gift.updateMany({
              where: { id: fresh.id, state: 'UNCLAIMED' },
              data: { state: 'EXPIRED', stateUpdatedAt: new Date() },
            });
            if (swept.count !== 1) return null;

            await this.ledger.transfer(tx, {
              from: { system: 'gift_unclaimed' },
              to: { wallet: fresh.senderId },
              amountMinor: fresh.amountMinor,
              kind: 'gift_refund',
              idempotencyKey: `gift_refund_${fresh.id}`,
              metadata: { giftId: fresh.id, reason: 'expiry' },
            });
            return tx.user.findUnique({ where: { id: fresh.senderId } });
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
        if (sender) {
          expired++;
          if (sender.notificationsEnabled) {
            void this.botPush.publish({
              telegramId: Number(sender.telegramId),
              type: 'gift_expired',
              data: { amountMinor: Number(gift.amountMinor) },
            });
          }
        }
      } catch (err) {
        this.logger.warn(`gift expiry failed for ${gift.id}: ${(err as Error).message}`);
      }
    }
    return expired;
  }

  // ─── helpers ────────────────────────────────────────────────────

  private deepLink(claimCode: string): string {
    return `https://t.me/${this.botUsername}?start=gift_${claimCode}`;
  }

  private toCreateResult(gift: GiftRow) {
    return {
      giftId: gift.id,
      claimCode: gift.claimCode,
      deepLink: this.deepLink(gift.claimCode),
      amountMinor: Number(gift.amountMinor),
      currency: 'NGN' as const,
      message: gift.message ?? undefined,
      state: gift.state as 'UNCLAIMED',
      ttlExpiresAt: gift.ttlExpiresAt.toISOString(),
      createdAt: gift.createdAt.toISOString(),
    };
  }

  private async publishClaimNotifications(
    result: {
      gift: { amountMinor: bigint; senderId: string };
      senderName: string;
      receiverName: string;
    },
    receiverId: string,
  ) {
    try {
      const [receiver, sender] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: receiverId } }),
        this.prisma.user.findUnique({ where: { id: result.gift.senderId } }),
      ]);
      const amountMinor = Number(result.gift.amountMinor);
      if (receiver && receiver.notificationsEnabled) {
        await this.botPush.publish({
          telegramId: Number(receiver.telegramId),
          type: 'gift_received',
          data: { amountMinor, counterpartyName: result.senderName },
        });
      }
      if (sender && sender.notificationsEnabled) {
        await this.botPush.publish({
          telegramId: Number(sender.telegramId),
          type: 'gift_claimed',
          data: { amountMinor, counterpartyName: result.receiverName },
        });
      }
    } catch (err) {
      this.logger.warn(`publish claim notifications failed: ${(err as Error).message}`);
    }
  }
}
