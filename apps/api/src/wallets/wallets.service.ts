import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Errors } from '../common/errors';

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  async getForUser(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) throw Errors.notFound('wallet not found');
    return wallet;
  }

  /**
   * Wallet plus the user-facing preferences the Mini App reads on load
   * (the notifications opt-out lives on User, not Wallet).
   */
  async getMineWithPrefs(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: { user: { select: { notificationsEnabled: true, email: true } } },
    });
    if (!wallet) throw Errors.notFound('wallet not found');
    return {
      balanceMinor: wallet.balanceMinor,
      currency: wallet.currency,
      notificationsEnabled: wallet.user.notificationsEnabled,
      email: wallet.user.email,
    };
  }
}
