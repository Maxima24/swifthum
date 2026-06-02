import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AnthropicService } from '../ai/anthropic.service';
import type { Asset } from '../common/assets';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AnthropicService,
  ) {}

  async suggestedRules(userId: string) {
    const since = new Date(Date.now() - SEVEN_DAYS_MS);

    const [snapshots, userRules] = await Promise.all([
      this.prisma.priceSnapshot.findMany({
        where: { takenAt: { gte: since } },
        orderBy: { takenAt: 'desc' },
        take: 200,
      }),
      this.prisma.rule.findMany({ where: { userId } }),
    ]);

    return this.ai.suggestRules({
      recentPrices: snapshots.map((s) => ({
        asset: s.asset as Asset,
        priceMinor: Number(s.priceMinor),
        takenAt: s.takenAt.toISOString(),
      })),
      userRules: userRules.map((r) => ({
        whenAsset: r.whenAsset,
        whenOp: r.whenOp,
        whenPriceMinor: Number(r.whenPriceMinor),
      })),
    });
  }
}
