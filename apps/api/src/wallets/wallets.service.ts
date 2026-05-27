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
}
