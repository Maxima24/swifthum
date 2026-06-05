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

    const suggestions = await this.ai.suggestRules({
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

    // The Mini App expects { id, reason, rule: { name, when, then } }. Wrap the
    // flat AI output (same shape as the static fallback) to match that contract.
    // Suggestions are ephemeral (not persisted), so an index-based id suffices.
    return suggestions.map((s, i) => ({
      id: `sug_${i}`,
      reason: s.reason,
      rule: { name: s.name, when: s.when, then: s.then },
    }));
  }
}
