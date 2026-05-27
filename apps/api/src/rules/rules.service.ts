import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
import { Errors } from '../common/errors';
import { prefixedId } from '../common/ids';
import type { Asset } from '../common/assets';
import { computeState } from './rule-evaluator';
import { CreateRuleDto, UpdateRuleDto } from './rules.dto';
import { toApiExecution, toApiRule } from './rules.serializer';

const RULE_LIMIT_PER_USER = 50;
const FIRED_DECAY_MS = 5 * 60 * 1000;

@Injectable()
export class RulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
  ) {}

  async list(userId: string) {
    const rows = await this.prisma.rule.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toApiRule);
  }

  async getOne(userId: string, ruleId: string) {
    const row = await this.prisma.rule.findFirst({ where: { id: ruleId, userId } });
    if (!row) throw Errors.notFound('rule not found');
    return toApiRule(row);
  }

  async create(userId: string, dto: CreateRuleDto) {
    this.validateActionShape(dto.then);
    const count = await this.prisma.rule.count({ where: { userId } });
    if (count >= RULE_LIMIT_PER_USER) throw Errors.ruleLimitReached();

    const prices = await this.safeCurrentPrices();
    const target = BigInt(dto.when.priceMinor);
    const state = computeState(target, prices?.[dto.when.asset]);
    const name = dto.name?.trim() || `${dto.then.action.toUpperCase()} ${dto.when.asset}`;

    const row = await this.prisma.rule.create({
      data: {
        id: prefixedId('r'),
        userId,
        name,
        whenAsset: dto.when.asset,
        whenOp: dto.when.op,
        whenPriceMinor: target,
        thenAction: dto.then.action,
        thenAmountMinor:
          dto.then.amountMinor !== undefined ? BigInt(dto.then.amountMinor) : null,
        thenCurrency: dto.then.currency ?? null,
        state,
        lastEvaluatedAt: new Date(),
      },
    });
    return toApiRule(row);
  }

  async update(userId: string, ruleId: string, dto: UpdateRuleDto) {
    const existing = await this.prisma.rule.findFirst({ where: { id: ruleId, userId } });
    if (!existing) throw Errors.notFound('rule not found');

    if (dto.then) this.validateActionShape(dto.then);

    // Build patch
    const patch: Prisma.RuleUpdateInput = {};
    if (dto.name !== undefined) patch.name = dto.name.trim() || existing.name;
    if (dto.when) {
      patch.whenAsset = dto.when.asset;
      patch.whenOp = dto.when.op;
      patch.whenPriceMinor = BigInt(dto.when.priceMinor);
    }
    if (dto.then) {
      patch.thenAction = dto.then.action;
      patch.thenAmountMinor =
        dto.then.amountMinor !== undefined ? BigInt(dto.then.amountMinor) : null;
      patch.thenCurrency = dto.then.currency ?? null;
    }

    // Recompute state from current price unless paused (sticky).
    if (existing.state !== 'paused') {
      const prices = await this.safeCurrentPrices();
      const asset = (dto.when?.asset ?? existing.whenAsset) as Asset;
      const target = dto.when ? BigInt(dto.when.priceMinor) : existing.whenPriceMinor;
      patch.state = computeState(target, prices?.[asset]);
      patch.lastEvaluatedAt = new Date();
    }

    const row = await this.prisma.rule.update({ where: { id: ruleId }, data: patch });
    return toApiRule(row);
  }

  async delete(userId: string, ruleId: string) {
    const res = await this.prisma.rule.deleteMany({ where: { id: ruleId, userId } });
    if (res.count === 0) throw Errors.notFound('rule not found');
  }

  async pause(userId: string, ruleId: string) {
    const existing = await this.prisma.rule.findFirst({ where: { id: ruleId, userId } });
    if (!existing) throw Errors.notFound('rule not found');
    const row = await this.prisma.rule.update({
      where: { id: ruleId },
      data: { state: 'paused', lastEvaluatedAt: new Date() },
    });
    return toApiRule(row);
  }

  async resume(userId: string, ruleId: string) {
    const existing = await this.prisma.rule.findFirst({ where: { id: ruleId, userId } });
    if (!existing) throw Errors.notFound('rule not found');
    const prices = await this.safeCurrentPrices();
    const state = computeState(existing.whenPriceMinor, prices?.[existing.whenAsset as Asset]);
    const row = await this.prisma.rule.update({
      where: { id: ruleId },
      data: { state, lastEvaluatedAt: new Date() },
    });
    return toApiRule(row);
  }

  async executions(userId: string, ruleId: string) {
    const existing = await this.prisma.rule.findFirst({ where: { id: ruleId, userId } });
    if (!existing) throw Errors.notFound('rule not found');
    const rows = await this.prisma.ruleExecution.findMany({
      where: { ruleId },
      orderBy: { firedAt: 'desc' },
      take: 100,
    });
    return rows.map(toApiExecution);
  }

  // ─── worker helpers ──────────────────────────────────────────────

  /** All rules not paused, ordered for stable iteration. */
  async allActive() {
    return this.prisma.rule.findMany({
      where: { NOT: { state: 'paused' } },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Update lastEvaluatedAt + state for a non-firing rule. */
  async touch(ruleId: string, state: 'sleeping' | 'watching') {
    await this.prisma.rule.update({
      where: { id: ruleId },
      data: { state, lastEvaluatedAt: new Date() },
    });
  }

  /** Decay rules stuck in `fired` after a while so the dashboard recovers. */
  async decayStaleFired(maxAgeMs: number = FIRED_DECAY_MS) {
    const cutoff = new Date(Date.now() - maxAgeMs);
    const stale = await this.prisma.rule.findMany({
      where: { state: 'fired', lastEvaluatedAt: { lt: cutoff } },
    });
    const prices = await this.safeCurrentPrices();
    for (const r of stale) {
      const state = computeState(r.whenPriceMinor, prices?.[r.whenAsset as Asset]);
      await this.prisma.rule.update({
        where: { id: r.id },
        data: { state, lastEvaluatedAt: new Date() },
      });
    }
  }

  // ─── helpers ─────────────────────────────────────────────────────

  private validateActionShape(then: { action: string; amountMinor?: number; currency?: string }) {
    if (then.action === 'buy' || then.action === 'sell') {
      if (then.amountMinor === undefined || then.amountMinor === null) {
        throw Errors.validation('then.amountMinor is required when action is buy/sell');
      }
      if (!then.currency) {
        throw Errors.validation('then.currency is required when action is buy/sell');
      }
    }
  }

  private async safeCurrentPrices() {
    try {
      return await this.prices.current();
    } catch {
      return undefined;
    }
  }
}
