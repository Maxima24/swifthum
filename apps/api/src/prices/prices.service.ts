import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { SwiftyexService } from '../swiftyex/swiftyex.service';
import { type PriceMapMinor } from '../swiftyex/swiftyex.port';
import { ASSETS, type Asset } from '../common/assets';
import { prefixedId } from '../common/ids';

const CACHE_KEY = 'prices:current';

@Injectable()
export class PricesService {
  private readonly logger = new Logger('Prices');
  private readonly cacheTtlSec: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly swiftyex: SwiftyexService,
    config: ConfigService,
  ) {
    // Longer cache = fewer upstream calls (keeps free CoinGecko/CMC quotas alive).
    this.cacheTtlSec = Number(config.get<string>('PRICES_CACHE_TTL_SEC', '60'));
  }

  /**
   * Current prices for all tracked assets. Reads from Redis cache (10s TTL);
   * on miss, fetches via SwiftyEx and stores. Frontend polls this every ~30s
   * and the worker every 20s — caching keeps upstream load sane.
   */
  async current(): Promise<PriceMapMinor> {
    const cached = await this.redis.client.get(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Record<Asset, string>;
        return {
          USDT: BigInt(parsed.USDT),
          BTC: BigInt(parsed.BTC),
          ETH: BigInt(parsed.ETH),
        };
      } catch {
        // fall through to refetch
      }
    }
    const fresh = await this.swiftyex.currentPrices();
    await this.redis.client.setex(
      CACHE_KEY,
      this.cacheTtlSec,
      JSON.stringify({
        USDT: fresh.USDT.toString(),
        BTC: fresh.BTC.toString(),
        ETH: fresh.ETH.toString(),
      }),
    );
    return fresh;
  }

  /**
   * Writes one snapshot row per asset. Called by the worker each tick so
   * crosses_above / crosses_below operators have a previous value to compare to.
   */
  async snapshot(prices: PriceMapMinor): Promise<void> {
    await this.prisma.priceSnapshot.createMany({
      data: ASSETS.map((asset) => ({
        id: prefixedId('ps'),
        asset,
        priceMinor: prices[asset],
      })),
    });
  }

  /**
   * Most recent snapshot per asset (the one strictly before the latest tick's
   * fresh prices, used by crosses operators).
   */
  async previousSnapshot(): Promise<Partial<PriceMapMinor>> {
    const result: Partial<PriceMapMinor> = {};
    for (const asset of ASSETS) {
      const row = await this.prisma.priceSnapshot.findFirst({
        where: { asset },
        orderBy: { takenAt: 'desc' },
      });
      if (row) result[asset] = row.priceMinor;
    }
    return result;
  }
}
