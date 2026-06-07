import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AiModule } from '../ai/ai.module';
import { SwiftyexModule } from '../swiftyex/swiftyex.module';
import { BotModule } from '../bot/bot.module';
import { PricesModule } from '../prices/prices.module';
import { RulesModule } from '../rules/rules.module';
import { PaymentsModule } from '../payments/payments.module';
import { GiftsModule } from '../gifts/gifts.module';
import { WatcherProcessor } from './watcher.processor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    LedgerModule,
    AiModule,
    SwiftyexModule,
    BotModule,
    PricesModule,
    RulesModule,
    PaymentsModule,
    GiftsModule,
  ],
  providers: [WatcherProcessor],
  exports: [WatcherProcessor],
})
export class WorkerModule {}
