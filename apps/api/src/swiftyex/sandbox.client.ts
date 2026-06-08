import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { prefixedId } from '../common/ids';
import { type Asset, isAsset } from '../common/assets';
import { encryptCredential } from './credential-crypto';
import { getMarketPrices } from './market-prices';
import {
  type AccountStatus,
  type Holding,
  type OrderRequest,
  type OrderResult,
  type PriceMapMinor,
  type SwiftyexPort,
  computeFilledQtyBase,
} from './swiftyex.port';

/**
 * Stateful sandbox SwiftyEx. Feature-complete so the whole app runs pre-keys:
 *  - prices from CoinGecko (+ static fallback)
 *  - orders move per-user simulated holdings in the DB and persist an order row
 *  - account linking persists an (encrypted, fake) credential to SwiftyexAccount
 *
 * Every method matches the live client's surface, so swapping is a config flip.
 */
@Injectable()
export class SandboxSwiftyexClient implements SwiftyexPort {
  private readonly logger = new Logger('SwiftyEx.Sandbox');
  private readonly encSecret: string;
  private readonly coingeckoKey?: string;
  private readonly cmcKey?: string;
  private readonly swiftyexRatesUrl?: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.encSecret = config.get<string>('SWIFTYEX_KEY_ENC_SECRET', 'dev-only-insecure-secret');
    this.coingeckoKey = config.get<string>('COINGECKO_API_KEY') || undefined;
    this.cmcKey = config.get<string>('CMC_API_KEY') || undefined;
    this.swiftyexRatesUrl = config.get<string>('SWIFTYEX_MINIAPP_BASE_URL') || undefined;
  }

  // ─── market data ────────────────────────────────────────────────

  async currentPrices(): Promise<PriceMapMinor> {
    const { prices } = await getMarketPrices({
      swiftyexRatesUrl: this.swiftyexRatesUrl,
      coingeckoKey: this.coingeckoKey,
      cmcKey: this.cmcKey,
      logger: this.logger,
    });
    return prices;
  }

  // ─── trading ────────────────────────────────────────────────────

  async placeOrder(req: OrderRequest): Promise<OrderResult> {
    const prices = await this.currentPrices();
    const priceMinor = prices[req.asset];
    const orderId = prefixedId('so');

    if (!priceMinor || priceMinor <= 0n) {
      return this.persistFailed(orderId, req, 'no price for asset');
    }

    const filledQtyBase = computeFilledQtyBase(req.amountMinor, priceMinor);
    if (filledQtyBase <= 0n) {
      return this.persistFailed(orderId, req, 'amount too small to fill');
    }

    return this.prisma.$transaction(
      async (tx) => {
        if (req.side === 'sell') {
          // Lock the holding row, verify sufficient quantity.
          await tx.$executeRaw`SELECT 1 FROM "SwiftyexHolding" WHERE "userId" = ${req.userId} AND "asset" = ${req.asset} FOR UPDATE`;
          const holding = await tx.swiftyexHolding.findUnique({
            where: { userId_asset: { userId: req.userId, asset: req.asset } },
          });
          const have = holding?.qtyBase ?? 0n;
          if (have < filledQtyBase) {
            return this.writeOrder(tx, orderId, req, 'failed', {
              detail: 'insufficient holdings',
              errorMessage: 'insufficient holdings',
            });
          }
          await tx.swiftyexHolding.update({
            where: { userId_asset: { userId: req.userId, asset: req.asset } },
            data: { qtyBase: { decrement: filledQtyBase } },
          });
        } else {
          await tx.swiftyexHolding.upsert({
            where: { userId_asset: { userId: req.userId, asset: req.asset } },
            create: {
              id: prefixedId('sh'),
              userId: req.userId,
              asset: req.asset,
              qtyBase: filledQtyBase,
            },
            update: { qtyBase: { increment: filledQtyBase } },
          });
        }

        return this.writeOrder(tx, orderId, req, 'simulated', { priceMinor, filledQtyBase });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async getOrder(userId: string, orderId: string): Promise<OrderResult | null> {
    const row = await this.prisma.swiftyexOrder.findFirst({ where: { id: orderId, userId } });
    if (!row || !isAsset(row.asset)) return null;
    return {
      orderId: row.id,
      status: row.status as OrderResult['status'],
      side: row.side as OrderResult['side'],
      asset: row.asset,
      amountMinor: row.amountMinor,
      filledPriceMinor: row.filledPriceMinor ?? undefined,
      filledQtyBase: row.filledQtyBase ?? undefined,
      errorMessage: row.status === 'failed' ? (row.detail ?? undefined) : undefined,
    };
  }

  // ─── portfolio ──────────────────────────────────────────────────

  async getHoldings(userId: string): Promise<Holding[]> {
    const rows = await this.prisma.swiftyexHolding.findMany({ where: { userId } });
    return rows
      .filter((r) => isAsset(r.asset))
      .map((r) => ({ asset: r.asset as Asset, qtyBase: r.qtyBase }));
  }

  // ─── account linking ────────────────────────────────────────────

  async linkAccount(userId: string, credential: string): Promise<AccountStatus> {
    if (!credential || credential.trim().length === 0) {
      throw new Error('credential required');
    }
    const apiKey = encryptCredential(credential.trim(), this.encSecret);
    const label = `sandbox·${credential.trim().slice(0, 4)}…`;
    const row = await this.prisma.swiftyexAccount.upsert({
      where: { userId },
      create: { id: prefixedId('sa'), userId, apiKey, label },
      update: { apiKey, label, linkedAt: new Date() },
    });
    return { linked: true, label: row.label ?? undefined, linkedAt: row.linkedAt.toISOString() };
  }

  async unlinkAccount(userId: string): Promise<void> {
    await this.prisma.swiftyexAccount.deleteMany({ where: { userId } });
  }

  async getAccount(userId: string): Promise<AccountStatus> {
    const row = await this.prisma.swiftyexAccount.findUnique({ where: { userId } });
    if (!row) return { linked: false };
    return { linked: true, label: row.label ?? undefined, linkedAt: row.linkedAt.toISOString() };
  }

  // ─── helpers ────────────────────────────────────────────────────

  private async persistFailed(
    orderId: string,
    req: OrderRequest,
    reason: string,
  ): Promise<OrderResult> {
    return this.writeOrder(this.prisma, orderId, req, 'failed', {
      detail: reason,
      errorMessage: reason,
    });
  }

  private async writeOrder(
    db: Prisma.TransactionClient | PrismaService,
    orderId: string,
    req: OrderRequest,
    status: OrderResult['status'],
    extra: {
      priceMinor?: bigint;
      filledQtyBase?: bigint;
      detail?: string;
      errorMessage?: string;
    },
  ): Promise<OrderResult> {
    await db.swiftyexOrder.create({
      data: {
        id: orderId,
        userId: req.userId,
        side: req.side,
        asset: req.asset,
        amountMinor: req.amountMinor,
        status,
        filledPriceMinor: extra.priceMinor ?? null,
        filledQtyBase: extra.filledQtyBase ?? null,
        detail: extra.detail ?? null,
      },
    });
    return {
      orderId,
      status,
      side: req.side,
      asset: req.asset,
      amountMinor: req.amountMinor,
      filledPriceMinor: extra.priceMinor,
      filledQtyBase: extra.filledQtyBase,
      errorMessage: extra.errorMessage,
    };
  }
}
