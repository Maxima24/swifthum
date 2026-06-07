/**
 * One-off backfill: reconstruct the double-entry ledger to mirror the existing
 * Wallet balances and in-flight payment holds. Run ONCE after the
 * `double_entry_ledger` migration, before serving traffic on the new code.
 *
 *   cd apps/api
 *   ts-node -r tsconfig-paths/register prisma/backfill-ledger.ts
 *   # or via package.json: pnpm backfill:ledger
 *
 * Idempotent — safe to re-run (every write is keyed). It does NOT use
 * LedgerService.transfer (that mirrors into Wallet and would double balances);
 * it writes ledger rows directly so the ledger matches the *current* Wallet
 * state exactly.
 *
 * Invariants after running (see HACKFEST_PLAN §6):
 *   - each user's Wallet.balanceMinor == their wallet LedgerAccount balance
 *   - payment_hold == Σ(amount of pending, unconsumed, unrefunded intents)
 *   - treasury == −(everything issued) ; Σdebits == Σcredits per tx
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

const prisma = new PrismaClient();

const laId = () => `la_${createId()}`;
const ltId = () => `lt_${createId()}`;
const leId = () => `le_${createId()}`;

type SystemKind = 'treasury' | 'payment_hold' | 'escrow_hold' | 'gift_unclaimed';
const SYSTEM_KINDS: SystemKind[] = ['treasury', 'payment_hold', 'escrow_hold', 'gift_unclaimed'];

async function ensureSystemAccount(kind: SystemKind): Promise<string> {
  const existing = await prisma.ledgerAccount.findFirst({ where: { kind, ownerUserId: null } });
  if (existing) return existing.id;
  const acc = await prisma.ledgerAccount.create({
    data: { id: laId(), kind, ownerUserId: null, currency: 'NGN' },
  });
  return acc.id;
}

/** Write a balanced tx (debit `from`, credit `to`) directly, keyed for idempotency. */
async function directTransfer(args: {
  fromAccountId: string;
  toAccountId: string;
  amountMinor: bigint;
  kind: string;
  idempotencyKey: string;
  metadata: Prisma.InputJsonValue;
}): Promise<boolean> {
  const prior = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey: args.idempotencyKey },
  });
  if (prior) return false; // already applied
  await prisma.$transaction(async (tx) => {
    const txId = ltId();
    await tx.ledgerTransaction.create({
      data: { id: txId, kind: args.kind, idempotencyKey: args.idempotencyKey, metadata: args.metadata },
    });
    await tx.ledgerEntry.createMany({
      data: [
        { id: leId(), txId, accountId: args.fromAccountId, direction: 'debit', amountMinor: args.amountMinor },
        { id: leId(), txId, accountId: args.toAccountId, direction: 'credit', amountMinor: args.amountMinor },
      ],
    });
    await tx.ledgerAccount.update({
      where: { id: args.fromAccountId },
      data: { balanceMinor: { decrement: args.amountMinor } },
    });
    await tx.ledgerAccount.update({
      where: { id: args.toAccountId },
      data: { balanceMinor: { increment: args.amountMinor } },
    });
  });
  return true;
}

async function main() {
  console.log('▶ backfill-ledger starting');
  const systemIds: Record<SystemKind, string> = {} as Record<SystemKind, string>;
  for (const kind of SYSTEM_KINDS) {
    systemIds[kind] = await ensureSystemAccount(kind);
  }
  const treasuryId = systemIds.treasury;
  const holdId = systemIds.payment_hold;

  // 1) Mirror every user's wallet balance: treasury → wallet account.
  const wallets = await prisma.wallet.findMany();
  let seeded = 0;
  for (const w of wallets) {
    const account = await prisma.ledgerAccount.upsert({
      where: { ownerUserId: w.userId },
      create: {
        id: laId(),
        kind: 'wallet',
        ownerUserId: w.userId,
        currency: w.currency,
        balanceMinor: 0n,
      },
      update: {},
    });
    if (w.balanceMinor > 0n) {
      const applied = await directTransfer({
        fromAccountId: treasuryId,
        toAccountId: account.id,
        amountMinor: w.balanceMinor,
        kind: 'backfill_seed',
        idempotencyKey: `backfill_seed_${w.userId}`,
        metadata: { userId: w.userId },
      });
      if (applied) seeded++;
    }
  }

  // 2) In-flight reserves (pending intents): money already left the Wallet, so it
  //    must sit in payment_hold. treasury → payment_hold for each.
  const pending = await prisma.paymentIntent.findMany({
    where: { consumedAt: null, refundedAt: null },
  });
  let held = 0;
  for (const intent of pending) {
    const applied = await directTransfer({
      fromAccountId: treasuryId,
      toAccountId: holdId,
      amountMinor: intent.amountMinor,
      kind: 'backfill_hold',
      idempotencyKey: `backfill_hold_${intent.id}`,
      metadata: { intentId: intent.id },
    });
    if (applied) held++;
  }

  // Verify the headline invariant.
  let mismatches = 0;
  for (const w of wallets) {
    const acc = await prisma.ledgerAccount.findUnique({ where: { ownerUserId: w.userId } });
    if (!acc || acc.balanceMinor !== w.balanceMinor) {
      mismatches++;
      console.warn(`  ✗ balance mismatch for ${w.userId}: wallet=${w.balanceMinor} ledger=${acc?.balanceMinor}`);
    }
  }

  console.log(
    `✔ backfill done: wallets=${wallets.length} seeded=${seeded} pendingHeld=${held} mismatches=${mismatches}`,
  );
  if (mismatches > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error('backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
