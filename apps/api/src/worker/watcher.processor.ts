import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PricesService } from '../prices/prices.service';
import { RulesService } from '../rules/rules.service';
import { SwiftyexService } from '../swiftyex/swiftyex.service';
import { PaymentsService } from '../payments/payments.service';
import { BotPushService } from '../bot/bot-push.service';
import { evaluate } from '../rules/rule-evaluator';
import { prefixedId } from '../common/ids';
import { type Asset } from '../common/assets';
import { type PriceMapMinor } from '../swiftyex/swiftyex.port';
import { formatOrderDetail, orderStatusToOutcome } from '../swiftyex/order-detail';

interface RuleRow {
  id: string;
  userId: string;
  name: string;
  whenAsset: string;
  whenOp: string;
  whenPriceMinor: bigint;
  thenAction: string;
  thenAmountMinor: bigint | null;
  thenCurrency: string | null;
  state: string;
  firedCount: number;
}

const FIRE_OUTCOMES = ['success', 'failed', 'simulated'] as const;
type FireOutcome = (typeof FIRE_OUTCOMES)[number];

@Injectable()
export class WatcherProcessor {
  private readonly logger = new Logger('Watcher');

  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
    private readonly rules: RulesService,
    private readonly swiftyex: SwiftyexService,
    private readonly payments: PaymentsService,
    private readonly botPush: BotPushService,
    private readonly _config: ConfigService,
  ) {}

  /** One tick. Idempotent — safe to run on overlapping schedules. */
  async tick(): Promise<void> {
    const started = Date.now();
    const current = await this.prices.current();
    const previous = await this.prices.previousSnapshot();
    await this.prices.snapshot(current);

    const active = await this.rules.allActive();
    let fired = 0;

    for (const rule of active) {
      const asset = rule.whenAsset as Asset;
      const currentMinor = current[asset];
      if (currentMinor === undefined) continue;

      // Edge-triggered: a rule already in `fired` is not re-evaluated, so a
      // still-true level condition (lt/gt) doesn't re-fire every tick. It re-arms
      // only after decayStaleFired() resets it past the cooldown.
      if (rule.state === 'fired') continue;

      const shouldFire = evaluate({
        op: rule.whenOp as 'lt' | 'gt' | 'crosses_above' | 'crosses_below',
        asset,
        targetMinor: rule.whenPriceMinor,
        currentMinor,
        previousMinor: previous[asset],
      });

      if (!shouldFire) {
        // Recompute display state, save lastEvaluatedAt.
        const drift = absDrift(currentMinor, rule.whenPriceMinor);
        await this.rules.touch(rule.id, drift <= 10_000n ? 'watching' : 'sleeping');
        continue;
      }

      try {
        await this.fire(rule, current);
        fired++;
      } catch (err) {
        this.logger.error(`fire failed for rule ${rule.id}: ${(err as Error).message}`);
      }
    }

    await this.rules.decayStaleFired();

    // Piggy-back the refund sweep onto the watcher tick.
    const refunded = await this.payments.refundExpiredIntents();

    this.logger.log(
      `tick done in ${Date.now() - started}ms (rules=${active.length} fired=${fired} refunded=${refunded})`,
    );
  }

  private async fire(rule: RuleRow, prices: PriceMapMinor) {
    const asset = rule.whenAsset as Asset;
    const priceAtFire = prices[asset];
    const user = await this.prisma.user.findUnique({ where: { id: rule.userId } });

    let outcome: FireOutcome;
    let detail: string;

    if (rule.thenAction === 'alert') {
      outcome = 'success';
      detail = `${rule.whenAsset} ${describeOp(rule.whenOp)} ₦${formatMinor(rule.whenPriceMinor)}`;
    } else if (
      rule.thenAmountMinor !== null &&
      (rule.thenAction === 'buy' || rule.thenAction === 'sell')
    ) {
      // The adapter (sandbox or live) owns the outcome flavour — we just map its
      // status to a ledger outcome and render the detail. No mode check here.
      const result = await this.swiftyex.placeOrder({
        side: rule.thenAction,
        asset,
        amountMinor: rule.thenAmountMinor,
        currency: (rule.thenCurrency as 'NGN' | Asset) ?? 'NGN',
        userId: rule.userId,
      });
      outcome = orderStatusToOutcome(result.status);
      detail = formatOrderDetail(result);
    } else {
      outcome = 'failed';
      detail = 'rule action misconfigured';
    }

    await this.prisma.$transaction([
      this.prisma.ruleExecution.create({
        data: {
          id: prefixedId('e'),
          ruleId: rule.id,
          priceAtFireMinor: priceAtFire,
          outcome,
          detail,
        },
      }),
      this.prisma.rule.update({
        where: { id: rule.id },
        data: {
          state: 'fired',
          firedCount: { increment: 1 },
          lastEvaluatedAt: new Date(),
        },
      }),
    ]);

    if (user) {
      await this.botPush.publish({
        telegramId: Number(user.telegramId),
        type: 'rule_fired',
        data: {
          ruleName: rule.name,
          action: rule.thenAction as 'buy' | 'sell' | 'alert',
          amountMinor:
            rule.thenAmountMinor !== null ? Number(rule.thenAmountMinor) : undefined,
          currency: rule.thenCurrency ?? undefined,
          priceMinor: Number(priceAtFire),
          outcome,
        },
      });
    }
  }
}

function absDrift(a: bigint, b: bigint): bigint {
  if (b === 0n) return 1_000_000n;
  const diff = a > b ? a - b : b - a;
  return (diff * 1_000_000n) / b;
}

function describeOp(op: string): string {
  switch (op) {
    case 'lt': return 'is below';
    case 'gt': return 'is above';
    case 'crosses_above': return 'crossed above';
    case 'crosses_below': return 'crossed below';
    default: return op;
  }
}

function formatMinor(v: bigint): string {
  const major = Number(v) / 100;
  return major.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
