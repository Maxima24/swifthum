import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { prefixedId } from '../common/ids';
import type { TelegramUser } from '../auth/init-data';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
        return { ...existing, displayName };
      }
      return existing;
    }

    const id = prefixedId('u');
    const user = await this.prisma.user.create({
      data: {
        id,
        telegramId,
        displayName,
        wallet: { create: { balanceMinor: walletSeedMinor, currency: 'NGN' } },
      },
    });
    return user;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByTelegramId(telegramId: number) {
    return this.prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });
  }

  private formatDisplayName(tg: TelegramUser): string {
    if (tg.first_name) {
      return tg.last_name ? `${tg.first_name} ${tg.last_name}` : tg.first_name;
    }
    return tg.username ?? `tg_${tg.id}`;
  }
}
