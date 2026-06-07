import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';
import { prefixedId } from '../common/ids';

/**
 * Double-entry ledger — the accounting system-of-record beneath the wallet.
 *
 * Every money movement is a single `transfer`: a balanced `LedgerTransaction`
 * with exactly two `LedgerEntry` rows (one `debit` on `from`, one `credit` on
 * `to`, equal amounts → Σdebits == Σcredits). Cached `balanceMinor` on each
 * account is kept in lockstep, and for **wallet** accounts the mirrored
 * `Wallet.balanceMinor` (the user-facing source-of-truth) is updated too — so
 * §4's "all money via LedgerService, no ad-hoc wallet.update" holds.
 *
 * `transfer` runs inside a caller-provided Prisma transaction (so payment/gift/
 * escrow flows compose their own row writes atomically with the money move) and
 * is idempotent via the unique `LedgerTransaction.idempotencyKey`.
 */

export type SystemAccountKind = 'treasury' | 'payment_hold' | 'escrow_hold' | 'gift_unclaimed';
export type LedgerAccountKind = 'wallet' | SystemAccountKind;

const SYSTEM_ACCOUNT_KINDS: SystemAccountKind[] = [
  'treasury',
  'payment_hold',
  'escrow_hold',
  'gift_unclaimed',
];

/** Where money comes from / goes to. A wallet (by userId) or a system singleton. */
export type AccountRef = { wallet: string } | { system: SystemAccountKind };

export interface TransferArgs {
  from: AccountRef;
  to: AccountRef;
  amountMinor: bigint;
  /** LedgerTransaction.kind — the business reason (seed, reserve, redeem, …). */
  kind: string;
  /** Makes the move at-most-once. Same key returns the existing tx, never re-moves. */
  idempotencyKey?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface TransferResult {
  transactionId: string;
  idempotent: boolean;
}

interface ResolvedAccount {
  id: string;
  kind: string;
  ownerUserId: string | null;
}

@Injectable()
export class LedgerService implements OnModuleInit {
  private readonly logger = new Logger('Ledger');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure the singleton system accounts exist. Runs outside any money
   * transaction (a unique-violation here must not abort a payment tx). Safe to
   * race across the api + worker processes: the loser catches P2002 and moves on.
   */
  async onModuleInit(): Promise<void> {
    for (const kind of SYSTEM_ACCOUNT_KINDS) {
      await this.ensureSystemAccount(kind);
    }
  }

  private async ensureSystemAccount(kind: SystemAccountKind): Promise<void> {
    const existing = await this.prisma.ledgerAccount.findFirst({
      where: { kind, ownerUserId: null },
    });
    if (existing) return;
    try {
      await this.prisma.ledgerAccount.create({
        data: { id: prefixedId('la'), kind, ownerUserId: null, currency: 'NGN' },
      });
    } catch (err) {
      // Another process created it first (partial unique index) — fine.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw err;
    }
  }

  /**
   * The one money primitive. Must be called inside a (serializable) Prisma
   * transaction supplied by the caller.
   */
  async transfer(tx: Prisma.TransactionClient, args: TransferArgs): Promise<TransferResult> {
    const { from, to, amountMinor, kind, idempotencyKey, metadata } = args;
    if (amountMinor <= 0n) throw Errors.validation('transfer amount must be positive');

    // Idempotency short-circuit: the money already moved under this key.
    if (idempotencyKey) {
      const prior = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey } });
      if (prior) return { transactionId: prior.id, idempotent: true };
    }

    const fromAcc = await this.resolveAccount(tx, from);
    const toAcc = await this.resolveAccount(tx, to);
    if (fromAcc.id === toAcc.id) throw Errors.validation('cannot transfer to the same account');

    // Lock both accounts in a deterministic order (by id) to avoid deadlocks,
    // then re-read the authoritative balances under lock.
    const [lowId, highId] = [fromAcc.id, toAcc.id].sort();
    await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id IN (${lowId}, ${highId}) ORDER BY id FOR UPDATE`;

    const fromRow = await tx.ledgerAccount.findUniqueOrThrow({ where: { id: fromAcc.id } });
    // Treasury is the money source — it is allowed to go negative.
    if (fromAcc.kind !== 'treasury' && fromRow.balanceMinor < amountMinor) {
      throw Errors.insufficientBalance();
    }

    const txId = prefixedId('lt');
    try {
      await tx.ledgerTransaction.create({
        data: {
          id: txId,
          kind,
          idempotencyKey: idempotencyKey ?? null,
          metadata: metadata ?? {},
        },
      });
    } catch (err) {
      // Concurrent caller won the idempotency race — return their tx.
      if (
        idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const prior = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey } });
        if (prior) return { transactionId: prior.id, idempotent: true };
      }
      throw err;
    }

    await tx.ledgerEntry.createMany({
      data: [
        { id: prefixedId('le'), txId, accountId: fromAcc.id, direction: 'debit', amountMinor },
        { id: prefixedId('le'), txId, accountId: toAcc.id, direction: 'credit', amountMinor },
      ],
    });

    await this.applyBalance(tx, fromAcc, -amountMinor);
    await this.applyBalance(tx, toAcc, amountMinor);

    return { transactionId: txId, idempotent: false };
  }

  /** Read a cached balance (== Σcredits − Σdebits for the account). */
  async balanceOf(accountId: string): Promise<bigint> {
    const acc = await this.prisma.ledgerAccount.findUniqueOrThrow({ where: { id: accountId } });
    return acc.balanceMinor;
  }

  /** The wallet LedgerAccount for a user, created (mirroring zero) if absent. */
  async ensureWalletAccount(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<ResolvedAccount> {
    const acc = await tx.ledgerAccount.upsert({
      where: { ownerUserId: userId },
      create: { id: prefixedId('la'), kind: 'wallet', ownerUserId: userId, currency: 'NGN' },
      update: {},
    });
    return { id: acc.id, kind: acc.kind, ownerUserId: acc.ownerUserId };
  }

  /** The singleton account for a system kind. Created at boot (onModuleInit). */
  async systemAccount(kind: SystemAccountKind): Promise<ResolvedAccount> {
    const acc = await this.prisma.ledgerAccount.findFirst({ where: { kind, ownerUserId: null } });
    if (!acc) throw Errors.validation(`system account ${kind} not initialised`);
    return { id: acc.id, kind: acc.kind, ownerUserId: acc.ownerUserId };
  }

  // ─── internals ──────────────────────────────────────────────────

  private async resolveAccount(
    tx: Prisma.TransactionClient,
    ref: AccountRef,
  ): Promise<ResolvedAccount> {
    if ('wallet' in ref) return this.ensureWalletAccount(tx, ref.wallet);
    const acc = await tx.ledgerAccount.findFirst({
      where: { kind: ref.system, ownerUserId: null },
    });
    if (!acc) throw Errors.validation(`system account ${ref.system} not initialised`);
    return { id: acc.id, kind: acc.kind, ownerUserId: acc.ownerUserId };
  }

  /**
   * Update the cached LedgerAccount balance and — for wallet accounts — the
   * mirrored Wallet row, keeping the user-facing balance in lockstep.
   */
  private async applyBalance(
    tx: Prisma.TransactionClient,
    acc: ResolvedAccount,
    delta: bigint,
  ): Promise<void> {
    await tx.ledgerAccount.update({
      where: { id: acc.id },
      data: { balanceMinor: { increment: delta } },
    });
    if (acc.kind === 'wallet' && acc.ownerUserId) {
      await tx.wallet.update({
        where: { userId: acc.ownerUserId },
        data: { balanceMinor: { increment: delta } },
      });
    }
  }
}
