import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { prefixedId } from '../common/ids';
import { sign, verify } from '../common/signed-token';

// Receipts are permanent proof — give the signed token a ~100-year lifetime so
// verification effectively never expires (signed-token still requires an exp).
const RECEIPT_TTL_SEC = 100 * 365 * 24 * 60 * 60;

export type ReceiptSourceType = 'payment' | 'gift' | 'escrow';

export interface EmitReceiptArgs {
  sourceType: ReceiptSourceType;
  sourceId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  amountMinor: bigint;
  asset?: string;
}

interface ReceiptRow {
  id: string;
  sourceType: string;
  sourceId: string;
  fromUserId: string;
  toUserId: string;
  fromName: string;
  toName: string;
  asset: string;
  amountMinor: bigint;
  token: string;
  createdAt: Date;
}

/**
 * Verifiable Receipts — signed, shareable proof of a completed money movement.
 *
 * `emit` is called inside the same transaction as the money move (redeem, gift
 * claim, later escrow release) so the receipt is atomic with it. The signed
 * `token` (common/signed-token.ts) is the tamper-evident artifact: anyone can
 * re-`verify` it server-side via the public endpoint. We mask counterparties to
 * display-name snapshots — internal ids never appear in the shareable token.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger('Receipts');
  private readonly secret: string;
  private readonly miniappUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    // Prefer a dedicated secret; fall back to the always-present payment secret
    // so a missing SIGNED_TOKEN_SECRET can't crash boot (stable across restarts).
    const dedicated = config.get<string>('SIGNED_TOKEN_SECRET');
    if (!dedicated) {
      this.logger.warn('SIGNED_TOKEN_SECRET not set — deriving from PAYMENT_TOKEN_SECRET');
    }
    this.secret = dedicated || config.getOrThrow<string>('PAYMENT_TOKEN_SECRET');
    this.miniappUrl = (config.get<string>('MINIAPP_URL') || 'http://localhost:5173').replace(
      /\/$/,
      '',
    );
  }

  /**
   * Create + sign a receipt inside the caller's transaction. Returns the row.
   */
  async emit(tx: Prisma.TransactionClient, args: EmitReceiptArgs): Promise<ReceiptRow> {
    const id = prefixedId('rcpt');
    const asset = args.asset ?? 'NGN';
    const token = sign(
      {
        purpose: 'receipt',
        ttlSec: RECEIPT_TTL_SEC,
        data: {
          receiptId: id,
          amountMinor: Number(args.amountMinor),
          asset,
          from: args.fromName,
          to: args.toName,
          sourceType: args.sourceType,
        },
      },
      this.secret,
    );

    const row = await tx.receipt.create({
      data: {
        id,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        fromUserId: args.fromUserId,
        toUserId: args.toUserId,
        fromName: args.fromName,
        toName: args.toName,
        asset,
        amountMinor: args.amountMinor,
        token,
      },
    });
    return row as ReceiptRow;
  }

  /**
   * Public verification: re-check the token signature, then return the
   * authoritative (masked) receipt from the DB. A tampered or expired token, or
   * an unknown receipt, yields `{ valid: false }`.
   */
  async verifyToken(token: string): Promise<
    | {
        valid: true;
        receipt: {
          id: string;
          sourceType: string;
          amountMinor: number;
          asset: string;
          from: string;
          to: string;
          createdAt: string;
        };
      }
    | { valid: false; reason: string }
  > {
    if (!token) return { valid: false, reason: 'missing token' };
    const v = verify(token, this.secret);
    if (!v.ok) return { valid: false, reason: v.reason };

    const receiptId = v.payload.receiptId;
    if (typeof receiptId !== 'string') return { valid: false, reason: 'bad_payload' };

    const receipt = (await this.prisma.receipt.findUnique({
      where: { id: receiptId },
    })) as ReceiptRow | null;
    // The signature must also match the stored token (defends against a validly
    // re-signed but unrelated payload if the secret ever leaked partially).
    if (!receipt || receipt.token !== token) return { valid: false, reason: 'not_found' };

    return {
      valid: true,
      receipt: {
        id: receipt.id,
        sourceType: receipt.sourceType,
        amountMinor: Number(receipt.amountMinor),
        asset: receipt.asset,
        from: receipt.fromName,
        to: receipt.toName,
        createdAt: receipt.createdAt.toISOString(),
      },
    };
  }

  /** The caller's receipts (as sender or recipient), newest first, with share links. */
  async listForUser(userId: string) {
    const rows = (await this.prisma.receipt.findMany({
      where: { OR: [{ fromUserId: userId }, { toUserId: userId }] },
      orderBy: [{ createdAt: 'desc' }],
      take: 100,
    })) as ReceiptRow[];

    return {
      items: rows.map((r) => {
        const direction = r.toUserId === userId ? ('received' as const) : ('sent' as const);
        return {
          id: r.id,
          sourceType: r.sourceType as ReceiptSourceType,
          direction,
          amountMinor: Number(r.amountMinor),
          currency: r.asset,
          counterparty: { displayName: direction === 'received' ? r.fromName : r.toName },
          url: `${this.miniappUrl}/r/${r.id}?token=${r.token}`,
          token: r.token,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    };
  }
}
