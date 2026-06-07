import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { BotPushService } from '../bot/bot-push.service';
import { AnthropicService } from '../ai/anthropic.service';
import { Errors } from '../common/errors';
import { assertTransition, type TransitionMap } from '../common/fsm';
import { generateClaimCode, prefixedId } from '../common/ids';

/**
 * P2P Escrow. Money is locked in the `escrow_hold` ledger account from funding
 * until release/refund/resolution — safe by construction. FSM is enforced in the
 * service layer; every transition is a single serializable tx: assert the move,
 * apply it with a conditional `updateMany WHERE state=<from>` (count===1 guards
 * against races), move funds via LedgerService, append an EscrowEvent. Refund and
 * release ledger keys are shared across the paths that can reach them so funds
 * can never double-move. Notifications fire after commit.
 *
 * Roles: creator = buyer / funder; counterparty = seller / receiver.
 */
const ESCROW_FSM: TransitionMap = {
  PROPOSED: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  ACCEPTED: ['PAID_MARKED', 'DISPUTED'],
  PAID_MARKED: ['COMPLETED', 'DISPUTED'],
  DISPUTED: ['RESOLVED_RELEASED', 'RESOLVED_REFUNDED'],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
  EXPIRED: [],
  RESOLVED_RELEASED: [],
  RESOLVED_REFUNDED: [],
};

type EscrowRow = {
  id: string;
  creatorId: string;
  counterpartyId: string | null;
  asset: string;
  amountMinor: bigint;
  terms: string | null;
  joinCode: string;
  state: string;
  ttlExpiresAt: Date;
  stateUpdatedAt: Date;
  createdAt: Date;
};

type EscrowEventRow = {
  id: string;
  type: string;
  actorId: string | null;
  metadata: Prisma.JsonValue;
  createdAt: Date;
};

export type EscrowRole = 'buyer' | 'seller';
export type ResolveDecision = 'release' | 'refund';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger('Escrow');
  private readonly ttlSec: number;
  private readonly botUsername: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly receipts: ReceiptsService,
    private readonly botPush: BotPushService,
    private readonly ai: AnthropicService,
    config: ConfigService,
  ) {
    this.ttlSec = Number(config.get<string>('ESCROW_TTL_HOURS', '72')) * 3600;
    this.botUsername = config.get<string>('BOT_USERNAME', 'swifthum_bot');
  }

  // ─── create + join ──────────────────────────────────────────────

  /** Buyer creates + funds an escrow (wallet → escrow_hold), state PROPOSED. */
  async createEscrow(buyerId: string, amountMinor: number, terms?: string) {
    const amount = BigInt(amountMinor);
    const id = prefixedId('esc');
    const joinCode = generateClaimCode();
    const ttlExpiresAt = new Date(Date.now() + this.ttlSec * 1000);

    const escrow = await this.prisma.$transaction(
      async (tx) => {
        await this.ledger.transfer(tx, {
          from: { wallet: buyerId },
          to: { system: 'escrow_hold' },
          amountMinor: amount,
          kind: 'escrow_fund',
          idempotencyKey: `escrow_fund_${id}`,
          metadata: { escrowId: id },
        });
        const row = (await tx.escrow.create({
          data: {
            id,
            creatorId: buyerId,
            asset: 'NGN',
            amountMinor: amount,
            terms: terms?.trim() || null,
            joinCode,
            state: 'PROPOSED',
            ttlExpiresAt,
          },
        })) as EscrowRow;
        await this.appendEvent(tx, id, 'proposed', buyerId);
        return row;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.toCreateResult(escrow);
  }

  /**
   * Counterparty (seller) binds to an escrow via its join code. Single-use:
   * `updateMany WHERE counterpartyId IS NULL AND state='PROPOSED'`. Self-join
   * (creator) is rejected. Returns the escrow summary so the bot can show
   * Accept/Decline.
   */
  async joinEscrow(userId: string, joinCode: string) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const escrow = (await tx.escrow.findUnique({ where: { joinCode } })) as EscrowRow | null;
        if (!escrow) throw Errors.invalidOrExpired('escrow not found');
        if (escrow.creatorId === userId) throw Errors.validation('cannot join your own escrow');
        if (escrow.state !== 'PROPOSED') throw Errors.alreadyRedeemed('escrow no longer open');
        if (escrow.counterpartyId && escrow.counterpartyId !== userId) {
          throw Errors.alreadyRedeemed('escrow already has a counterparty');
        }

        const bound = await tx.escrow.updateMany({
          where: { id: escrow.id, state: 'PROPOSED', counterpartyId: null },
          data: { counterpartyId: userId },
        });
        // count 0 is fine if THIS user already joined (idempotent re-open of link).
        if (bound.count !== 1 && escrow.counterpartyId !== userId) {
          throw Errors.alreadyRedeemed('escrow already has a counterparty');
        }
        if (bound.count === 1) await this.appendEvent(tx, escrow.id, 'joined', userId);
        return { ...escrow, counterpartyId: userId };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return this.toSummary(result, userId);
  }

  // ─── counterparty / creator transitions ─────────────────────────

  /** Counterparty accepts: PROPOSED → ACCEPTED. */
  async accept(userId: string, id: string) {
    const { escrow } = await this.transition(id, {
      requireRole: 'seller',
      actorId: userId,
      from: 'PROPOSED',
      to: 'ACCEPTED',
      event: 'accepted',
    });
    void this.notify(escrow.creatorId, 'escrow_accepted', escrow, userId);
    return this.toSummary(escrow, userId);
  }

  /** Counterparty declines: PROPOSED → DECLINED, refund the buyer. */
  async decline(userId: string, id: string) {
    const { escrow } = await this.transition(id, {
      requireRole: 'seller',
      actorId: userId,
      from: 'PROPOSED',
      to: 'DECLINED',
      event: 'declined',
      refundBuyer: true,
    });
    void this.notify(escrow.creatorId, 'escrow_declined', escrow, userId);
    return this.toSummary(escrow, userId);
  }

  /** Creator cancels before acceptance: PROPOSED → CANCELLED, refund the buyer. */
  async cancel(userId: string, id: string) {
    const escrow = (await this.prisma.escrow.findUnique({ where: { id } })) as EscrowRow | null;
    if (!escrow || escrow.creatorId !== userId) throw Errors.notFound('escrow not found');
    if (escrow.state === 'CANCELLED' || escrow.state === 'EXPIRED') {
      return this.toSummary(escrow, userId); // idempotent
    }
    const { escrow: updated } = await this.transition(id, {
      requireRole: 'buyer',
      actorId: userId,
      from: 'PROPOSED',
      to: 'CANCELLED',
      event: 'cancelled',
      refundBuyer: true,
    });
    return this.toSummary(updated, userId);
  }

  /** Buyer marks their side done: ACCEPTED → PAID_MARKED. */
  async markPaid(userId: string, id: string) {
    const { escrow } = await this.transition(id, {
      requireRole: 'buyer',
      actorId: userId,
      from: 'ACCEPTED',
      to: 'PAID_MARKED',
      event: 'paid_marked',
    });
    if (escrow.counterpartyId) {
      void this.notify(escrow.counterpartyId, 'escrow_marked_paid', escrow, userId);
    }
    return this.toSummary(escrow, userId);
  }

  /** Seller releases the held funds to themselves: PAID_MARKED → COMPLETED. */
  async release(userId: string, id: string) {
    const { escrow } = await this.transition(id, {
      requireRole: 'seller',
      actorId: userId,
      from: 'PAID_MARKED',
      to: 'COMPLETED',
      event: 'released',
      releaseToSeller: true,
      emitReceipt: true,
    });
    void this.notify(escrow.creatorId, 'escrow_completed', escrow, userId);
    return this.toSummary(escrow, userId);
  }

  /** Either party disputes: ACCEPTED|PAID_MARKED → DISPUTED. */
  async dispute(userId: string, id: string) {
    const escrow = (await this.prisma.escrow.findUnique({ where: { id } })) as EscrowRow | null;
    if (!escrow) throw Errors.notFound('escrow not found');
    this.roleOf(escrow, userId); // authorize (throws if not a party)
    if (escrow.state !== 'ACCEPTED' && escrow.state !== 'PAID_MARKED') {
      throw Errors.validation('escrow cannot be disputed in its current state');
    }
    const { escrow: updated } = await this.transition(id, {
      actorId: userId,
      from: escrow.state,
      to: 'DISPUTED',
      event: 'disputed',
    });
    const other = userId === updated.creatorId ? updated.counterpartyId : updated.creatorId;
    if (other) void this.notify(other, 'escrow_disputed', updated, userId);
    return this.toSummary(updated, userId);
  }

  // ─── admin dispute resolution ───────────────────────────────────

  /**
   * Admin (internal) resolves a dispute. With no explicit decision and
   * `aiAssisted`, asks the AI (static fallback = refund). Moves funds out of
   * `escrow_hold` and emits a receipt on release.
   */
  async resolveDispute(
    id: string,
    opts: { decision?: ResolveDecision; aiAssisted?: boolean },
  ) {
    const escrow = (await this.prisma.escrow.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })) as (EscrowRow & { events: EscrowEventRow[] }) | null;
    if (!escrow) throw Errors.notFound('escrow not found');
    if (escrow.state !== 'DISPUTED') throw Errors.validation('escrow is not disputed');

    let decision: ResolveDecision;
    let reasoning: string;
    if (opts.decision) {
      decision = opts.decision;
      reasoning = 'admin override';
    } else if (opts.aiAssisted) {
      const ai = await this.ai.resolveDispute({
        amountMinor: Number(escrow.amountMinor),
        terms: escrow.terms ?? '',
        buyerMarkedPaid: escrow.events.some((e) => e.type === 'paid_marked'),
        events: escrow.events.map((e) => e.type),
      });
      decision = ai.decision;
      reasoning = `ai: ${ai.reasoning}`;
    } else {
      decision = 'refund';
      reasoning = 'default refund';
    }

    const to = decision === 'release' ? 'RESOLVED_RELEASED' : 'RESOLVED_REFUNDED';
    const { escrow: updated } = await this.transition(id, {
      actorId: null,
      from: 'DISPUTED',
      to,
      event: decision === 'release' ? 'resolved_released' : 'resolved_refunded',
      eventMeta: { decision, reasoning },
      releaseToSeller: decision === 'release',
      refundBuyer: decision === 'refund',
      emitReceipt: decision === 'release',
    });

    const data = { resolution: decision, reasoning };
    void this.notify(updated.creatorId, 'escrow_resolved', updated, updated.counterpartyId ?? undefined, data);
    if (updated.counterpartyId) {
      void this.notify(updated.counterpartyId, 'escrow_resolved', updated, updated.creatorId, data);
    }
    const summary = await this.toSummary(updated, updated.creatorId);
    return { ...summary, resolution: decision, reasoning };
  }

  // ─── reads ──────────────────────────────────────────────────────

  async listForUser(userId: string) {
    const rows = (await this.prisma.escrow.findMany({
      where: { OR: [{ creatorId: userId }, { counterpartyId: userId }] },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    })) as EscrowRow[];
    const summaries = await Promise.all(rows.map((r) => this.toSummary(r, userId)));
    return { items: summaries };
  }

  async getDetail(userId: string, id: string) {
    const escrow = (await this.prisma.escrow.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: 'asc' } } },
    })) as (EscrowRow & { events: EscrowEventRow[] }) | null;
    if (!escrow) throw Errors.notFound('escrow not found');
    this.roleOf(escrow, userId); // authorize
    const summary = await this.toSummary(escrow, userId);
    return {
      ...summary,
      events: escrow.events.map((e) => ({
        type: e.type,
        actorId: e.actorId,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  // ─── worker sweep ───────────────────────────────────────────────

  /** Refund unaccepted (PROPOSED) escrows past their TTL → EXPIRED. */
  async expireProposed(): Promise<number> {
    const due = (await this.prisma.escrow.findMany({
      where: { state: 'PROPOSED', ttlExpiresAt: { lt: new Date() } },
      take: 100,
    })) as EscrowRow[];
    let expired = 0;
    for (const escrow of due) {
      try {
        const updated = await this.runTransition(escrow.id, {
          actorId: null,
          from: 'PROPOSED',
          to: 'EXPIRED',
          event: 'expired',
          refundBuyer: true,
        });
        if (updated) {
          expired++;
          void this.notify(updated.creatorId, 'escrow_expired', updated);
        }
      } catch (err) {
        this.logger.warn(`escrow expiry failed for ${escrow.id}: ${(err as Error).message}`);
      }
    }
    return expired;
  }

  // ─── internals ──────────────────────────────────────────────────

  private async transition(
    id: string,
    opts: TransitionOpts,
  ): Promise<{ escrow: EscrowRow }> {
    const escrow = await this.runTransition(id, opts);
    if (!escrow) throw Errors.validation('escrow state changed concurrently');
    return { escrow };
  }

  /**
   * Core transition primitive (used by both the API methods and the worker
   * sweep). Authorizes the actor's role, asserts the FSM move, applies it under
   * a conditional updateMany guard, moves funds, appends the event — all in one
   * serializable tx. Returns the updated row, or null if the guard lost a race.
   */
  private async runTransition(id: string, opts: TransitionOpts): Promise<EscrowRow | null> {
    return this.prisma.$transaction(
      async (tx) => {
        const escrow = (await tx.escrow.findUnique({ where: { id } })) as EscrowRow | null;
        if (!escrow) throw Errors.notFound('escrow not found');
        if (opts.requireRole) {
          const role = this.roleOf(escrow, opts.actorId ?? '');
          if (role !== opts.requireRole) throw Errors.validation('not allowed for your role');
        }
        assertTransition(escrow.state, opts.to, ESCROW_FSM);
        if (escrow.state !== opts.from) {
          throw Errors.validation(`escrow not in ${opts.from} state`);
        }

        const guard = await tx.escrow.updateMany({
          where: { id, state: opts.from },
          data: { state: opts.to, stateUpdatedAt: new Date() },
        });
        if (guard.count !== 1) return null;

        if (opts.refundBuyer) {
          await this.ledger.transfer(tx, {
            from: { system: 'escrow_hold' },
            to: { wallet: escrow.creatorId },
            amountMinor: escrow.amountMinor,
            kind: 'escrow_refund',
            idempotencyKey: `escrow_refund_${id}`,
            metadata: { escrowId: id, to: opts.to },
          });
        }
        if (opts.releaseToSeller) {
          if (!escrow.counterpartyId) throw Errors.validation('escrow has no counterparty');
          await this.ledger.transfer(tx, {
            from: { system: 'escrow_hold' },
            to: { wallet: escrow.counterpartyId },
            amountMinor: escrow.amountMinor,
            kind: 'escrow_release',
            idempotencyKey: `escrow_release_${id}`,
            metadata: { escrowId: id, to: opts.to },
          });
        }

        await this.appendEvent(tx, id, opts.event, opts.actorId ?? null, opts.eventMeta);

        const updated: EscrowRow = { ...escrow, state: opts.to, stateUpdatedAt: new Date() };

        if (opts.emitReceipt && updated.counterpartyId) {
          const [buyer, seller] = await Promise.all([
            tx.user.findUnique({ where: { id: updated.creatorId } }),
            tx.user.findUnique({ where: { id: updated.counterpartyId } }),
          ]);
          if (buyer && seller) {
            await this.receipts.emit(tx, {
              sourceType: 'escrow',
              sourceId: id,
              fromUserId: buyer.id,
              toUserId: seller.id,
              fromName: buyer.displayName,
              toName: seller.displayName,
              amountMinor: updated.amountMinor,
            });
          }
        }
        return updated;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private appendEvent(
    tx: Prisma.TransactionClient,
    escrowId: string,
    type: string,
    actorId: string | null,
    metadata?: Prisma.InputJsonValue,
  ) {
    return tx.escrowEvent.create({
      data: { id: prefixedId('e'), escrowId, type, actorId, metadata: metadata ?? {} },
    });
  }

  private roleOf(escrow: EscrowRow, userId: string): EscrowRole {
    if (escrow.creatorId === userId) return 'buyer';
    if (escrow.counterpartyId === userId) return 'seller';
    throw Errors.notFound('escrow not found');
  }

  private deepLink(joinCode: string): string {
    return `https://t.me/${this.botUsername}?start=escrow_${joinCode}`;
  }

  private toCreateResult(escrow: EscrowRow) {
    return {
      escrowId: escrow.id,
      joinCode: escrow.joinCode,
      deepLink: this.deepLink(escrow.joinCode),
      amountMinor: Number(escrow.amountMinor),
      currency: 'NGN' as const,
      terms: escrow.terms ?? undefined,
      state: escrow.state,
      ttlExpiresAt: escrow.ttlExpiresAt.toISOString(),
      createdAt: escrow.createdAt.toISOString(),
    };
  }

  /** Viewer-relative summary (role + masked counterparty name). */
  private async toSummary(escrow: EscrowRow, viewerId: string) {
    const role: EscrowRole | 'observer' =
      escrow.creatorId === viewerId
        ? 'buyer'
        : escrow.counterpartyId === viewerId
          ? 'seller'
          : 'observer';
    const otherId = role === 'buyer' ? escrow.counterpartyId : escrow.creatorId;
    let counterpartyName: string | undefined;
    if (otherId) {
      const u = await this.prisma.user.findUnique({ where: { id: otherId } });
      counterpartyName = u?.displayName;
    }
    return {
      id: escrow.id,
      role,
      state: escrow.state as EscrowState,
      amountMinor: Number(escrow.amountMinor),
      currency: escrow.asset,
      terms: escrow.terms ?? undefined,
      counterparty: counterpartyName ? { displayName: counterpartyName } : undefined,
      ttlExpiresAt: escrow.ttlExpiresAt.toISOString(),
      createdAt: escrow.createdAt.toISOString(),
      // The shareable link is only useful to the creator while still open.
      ...(role === 'buyer' && escrow.state === 'PROPOSED'
        ? { deepLink: this.deepLink(escrow.joinCode) }
        : {}),
    };
  }

  /** Look up the target user and DM them (gated by notificationsEnabled). */
  private async notify(
    userId: string,
    type: EscrowNotificationType,
    escrow: EscrowRow,
    actorId?: string,
    extra?: { resolution?: ResolveDecision; reasoning?: string },
  ) {
    try {
      const [target, actor] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: userId } }),
        actorId ? this.prisma.user.findUnique({ where: { id: actorId } }) : Promise.resolve(null),
      ]);
      if (!target || !target.notificationsEnabled) return;
      await this.botPush.publish({
        telegramId: Number(target.telegramId),
        type,
        data: {
          escrowId: escrow.id,
          amountMinor: Number(escrow.amountMinor),
          ...(actor ? { counterpartyName: actor.displayName } : {}),
          ...(extra ?? {}),
        },
      });
    } catch (err) {
      this.logger.warn(`escrow notify failed: ${(err as Error).message}`);
    }
  }
}

type EscrowState =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'PAID_MARKED'
  | 'COMPLETED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED'
  | 'RESOLVED_RELEASED'
  | 'RESOLVED_REFUNDED';

type EscrowNotificationType =
  | 'escrow_accepted'
  | 'escrow_declined'
  | 'escrow_marked_paid'
  | 'escrow_completed'
  | 'escrow_disputed'
  | 'escrow_resolved'
  | 'escrow_expired';

interface TransitionOpts {
  requireRole?: EscrowRole;
  actorId: string | null;
  from: string;
  to: string;
  event: string;
  eventMeta?: Prisma.InputJsonValue;
  refundBuyer?: boolean;
  releaseToSeller?: boolean;
  emitReceipt?: boolean;
}
