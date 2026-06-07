import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { prefixedId } from '../common/ids';
import type { TelegramUser } from '../auth/init-data';

@Injectable()
export class UsersService {
  private readonly logger = new Logger('Users');

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  /**
   * Idempotent upsert by Telegram ID. On first sign-in also seeds a wallet
   * (so the demo user has spendable balance immediately).
   * The wallet seed amount is read from `WALLET_SEED_NGN_MINOR`.
   */
  async upsertByTelegram(
    tg: TelegramUser,
    walletSeedMinor: bigint,
  ): Promise<{ id: string; telegramId: bigint; displayName: string }> {
    const displayName = this.formatDisplayName(tg);
    const telegramId = BigInt(tg.id);

    const existing = await this.prisma.user.findUnique({ where: { telegramId } });
    if (existing) {
      if (existing.displayName !== displayName) {
        await this.prisma.user.update({
          where: { id: existing.id },
          data: { displayName },
        });
      }
      await this.applyUsername(existing.id, tg.username);
      return existing.displayName !== displayName ? { ...existing, displayName } : existing;
    }

    const id = prefixedId('u');
    const user = await this.createUserWithSeed(id, telegramId, displayName, walletSeedMinor);
    await this.applyUsername(id, tg.username);
    return user;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Update mutable user preferences (currently just the notifications opt-out).
   * Returns the fields the Mini App cares about.
   */
  async updatePreferences(
    userId: string,
    prefs: { notificationsEnabled?: boolean },
  ): Promise<{ notificationsEnabled: boolean }> {
    const data: { notificationsEnabled?: boolean } = {};
    if (prefs.notificationsEnabled !== undefined) {
      data.notificationsEnabled = prefs.notificationsEnabled;
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
      select: { notificationsEnabled: true },
    });
    return user;
  }

  async findByTelegramId(telegramId: number) {
    return this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  }

  /**
   * Find or create a user purely by Telegram ID (no first_name/last_name known).
   * Used by the bot's exchange endpoint — the user may interact via bot before
   * ever opening the Mini App. Existing users are returned as-is (we do NOT
   * overwrite a real displayName with a tg_<id> placeholder).
   */
  async ensureByTelegramId(
    telegramId: number,
    walletSeedMinor: bigint,
    username?: string | null,
  ): Promise<{ id: string; telegramId: bigint; displayName: string }> {
    const tgIdBig = BigInt(telegramId);
    const existing = await this.prisma.user.findUnique({ where: { telegramId: tgIdBig } });
    if (existing) {
      await this.applyUsername(existing.id, username);
      return existing;
    }
    const id = prefixedId('u');
    const user = await this.createUserWithSeed(id, tgIdBig, `tg_${telegramId}`, walletSeedMinor);
    await this.applyUsername(id, username);
    return user;
  }

  /** Resolve a @handle to a user (internal — used by direct transfers). */
  async findByUsername(raw: string) {
    const handle = this.normalizeUsername(raw);
    if (!handle) return null;
    return this.prisma.user.findUnique({ where: { username: handle } });
  }

  /** Public lookup for the pay-by-username UI: does this @handle belong to a SwiftHum user? */
  async lookupByUsername(
    raw: string,
  ): Promise<{ found: boolean; displayName?: string; username?: string }> {
    const handle = this.normalizeUsername(raw);
    if (!handle) return { found: false };
    const u = await this.prisma.user.findUnique({
      where: { username: handle },
      select: { displayName: true, username: true },
    });
    if (!u) return { found: false };
    return { found: true, displayName: u.displayName, username: u.username ?? handle };
  }

  /**
   * Normalize + claim a Telegram @handle for a user. Telegram handles are
   * globally unique at any instant, so if another row still holds it (stale
   * after the previous owner renamed), move it to the current owner. Best-effort:
   * a failure here never breaks sign-in.
   */
  private async applyUsername(userId: string, raw?: string | null): Promise<void> {
    const handle = this.normalizeUsername(raw);
    if (!handle) return;
    try {
      const me = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      if (me?.username === handle) return;
      await this.prisma.$transaction([
        this.prisma.user.updateMany({
          where: { username: handle, NOT: { id: userId } },
          data: { username: null },
        }),
        this.prisma.user.update({ where: { id: userId }, data: { username: handle } }),
      ]);
    } catch (err) {
      this.logger.warn(`applyUsername failed for ${userId}: ${(err as Error).message}`);
    }
  }

  /** Strip a leading @, lowercase, and validate against Telegram handle chars. */
  private normalizeUsername(raw?: string | null): string | null {
    if (!raw) return null;
    const h = raw.trim().replace(/^@+/, '').toLowerCase();
    return /^[a-z0-9_]{3,32}$/.test(h) ? h : null;
  }

  /**
   * Create a user + their (zero-balance) wallet, then seed via the ledger so the
   * money has a `treasury → wallet` provenance entry (§4: all money via the
   * ledger, no ad-hoc wallet writes). The Wallet row is mirrored in lockstep by
   * LedgerService. A zero seed (e.g. gift-claim auto-provisioning) skips the
   * transfer — the wallet account is created lazily when funds first arrive.
   */
  private async createUserWithSeed(
    id: string,
    telegramId: bigint,
    displayName: string,
    walletSeedMinor: bigint,
  ): Promise<{ id: string; telegramId: bigint; displayName: string }> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id,
          telegramId,
          displayName,
          wallet: { create: { balanceMinor: 0n, currency: 'NGN' } },
        },
      });
      if (walletSeedMinor > 0n) {
        await this.ledger.transfer(tx, {
          from: { system: 'treasury' },
          to: { wallet: id },
          amountMinor: walletSeedMinor,
          kind: 'seed',
          idempotencyKey: `seed_${id}`,
        });
      }
      return user;
    });
  }

  private formatDisplayName(tg: TelegramUser): string {
    if (tg.first_name) {
      return tg.last_name ? `${tg.first_name} ${tg.last_name}` : tg.first_name;
    }
    return tg.username ?? `tg_${tg.id}`;
  }
}
