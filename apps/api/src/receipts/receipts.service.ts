import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { Errors } from '../common/errors';
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
  emailedAt: Date | null;
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
    private readonly email: EmailService,
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

  /**
   * Email a receipt to the caller. The caller must be a party to the receipt.
   * Sends to `emailOverride` if given, else the caller's saved `User.email`.
   * Returns a status the UI can branch on (no hard error for the common cases).
   */
  async emailReceipt(
    userId: string,
    receiptId: string,
    emailOverride?: string,
  ): Promise<{ status: 'ok' | 'no_email' | 'not_configured' | 'failed'; to?: string; error?: string }> {
    const receipt = (await this.prisma.receipt.findUnique({
      where: { id: receiptId },
    })) as ReceiptRow | null;
    if (!receipt) throw Errors.notFound('receipt not found');
    if (receipt.fromUserId !== userId && receipt.toUserId !== userId) {
      throw Errors.notFound('receipt not found'); // not a party → don't reveal it exists
    }

    if (!this.email.isConfigured()) return { status: 'not_configured' };

    let to = emailOverride?.trim().toLowerCase();
    if (!to) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      });
      to = user?.email ?? undefined;
    }
    if (!to) return { status: 'no_email' };

    const direction = receipt.toUserId === userId ? 'received' : 'sent';
    const res = await this.email.send(this.buildReceiptEmail(receipt, to, direction));
    if (res.ok) {
      await this.markEmailed(receipt.id);
      return { status: 'ok', to };
    }
    // SMTP is configured but the send was rejected (e.g. bad Gmail app password).
    return { status: 'failed', error: (res.error ?? 'send failed').slice(0, 160) };
  }

  /**
   * Fire-and-forget auto-email after a transaction commits. Emails every party
   * who has a saved email (their direction-appropriate copy) and marks the
   * receipt emailed. **Never throws and never blocks the caller** — call it as
   * `void this.receipts.autoEmail(...)` right after the money tx resolves.
   */
  async autoEmail(sourceType: string, sourceId: string): Promise<void> {
    try {
      if (!this.email.isConfigured()) return;
      const receipt = (await this.prisma.receipt.findFirst({
        where: { sourceType, sourceId },
        orderBy: { createdAt: 'desc' },
      })) as ReceiptRow | null;
      if (!receipt || receipt.emailedAt) return;

      const [fromUser, toUser] = await Promise.all([
        this.prisma.user.findUnique({ where: { id: receipt.fromUserId }, select: { email: true } }),
        this.prisma.user.findUnique({ where: { id: receipt.toUserId }, select: { email: true } }),
      ]);

      let sent = 0;
      if (toUser?.email) {
        const r = await this.email.send(this.buildReceiptEmail(receipt, toUser.email, 'received'));
        if (r.ok) sent++;
      }
      if (fromUser?.email) {
        const r = await this.email.send(this.buildReceiptEmail(receipt, fromUser.email, 'sent'));
        if (r.ok) sent++;
      }

      if (sent > 0) {
        await this.markEmailed(receipt.id);
        this.logger.log(`auto-emailed ${receipt.id} → ${sent}`);
      }
    } catch (err) {
      this.logger.warn(`autoEmail failed (${sourceType}/${sourceId}): ${(err as Error).message}`);
    }
  }

  private markEmailed(receiptId: string) {
    return this.prisma.receipt
      .update({ where: { id: receiptId }, data: { emailedAt: new Date() } })
      .catch(() => undefined);
  }

  private buildReceiptEmail(
    r: ReceiptRow,
    to: string,
    direction: 'received' | 'sent',
  ) {
    const amount = `₦${(Number(r.amountMinor) / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const counterparty = direction === 'received' ? r.fromName : r.toName;
    const verb = direction === 'received' ? 'received from' : 'sent to';
    const verifyUrl = `${this.miniappUrl}/r/${r.id}?token=${r.token}`;
    const when = r.createdAt.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
    const subject = `SwiftHum receipt — ${amount} ${verb} ${counterparty}`;

    const text = [
      `SwiftHum receipt`,
      ``,
      `${amount} ${verb} ${counterparty}`,
      `Type: ${r.sourceType}`,
      `Date: ${when}`,
      ``,
      `Verify this receipt: ${verifyUrl}`,
      ``,
      `This is a tamper-proof, signed receipt — editing the link breaks verification.`,
    ].join('\n');

    const html = `
  <div style="margin:0;padding:24px;background:#0a0b0f;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#e7e8ec">
    <div style="max-width:480px;margin:0 auto;background:#14151c;border:1px solid rgba(255,255,255,0.08);border-radius:18px;overflow:hidden">
      <div style="padding:22px 24px;background:linear-gradient(135deg,#6c63ff,#8b5cf6)">
        <div style="font-size:20px;font-weight:800;color:#fff">SwiftHum</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.85);text-transform:uppercase;letter-spacing:.12em">Verifiable receipt</div>
      </div>
      <div style="padding:26px 24px">
        <div style="font-size:30px;font-weight:800;color:#fff">${amount}</div>
        <div style="margin-top:4px;color:#9aa0ae">${verb} <b style="color:#e7e8ec">${escapeHtml(counterparty)}</b></div>
        <table style="width:100%;margin-top:20px;font-size:14px;color:#9aa0ae">
          <tr><td style="padding:6px 0">Type</td><td style="text-align:right;color:#e7e8ec;text-transform:capitalize">${escapeHtml(r.sourceType)}</td></tr>
          <tr><td style="padding:6px 0">Date</td><td style="text-align:right;color:#e7e8ec">${escapeHtml(when)}</td></tr>
        </table>
        <a href="${verifyUrl}" style="display:block;margin-top:24px;padding:14px;text-align:center;background:linear-gradient(135deg,#6c63ff,#8b5cf6);color:#fff;font-weight:700;text-decoration:none;border-radius:999px">✅ Verify this receipt</a>
        <p style="margin-top:16px;font-size:12px;color:#6b7180;text-align:center">Signed &amp; tamper-proof — editing the link breaks verification.</p>
      </div>
    </div>
  </div>`;

    return { to, subject, html, text };
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
          emailedAt: r.emailedAt ? r.emailedAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
        };
      }),
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
