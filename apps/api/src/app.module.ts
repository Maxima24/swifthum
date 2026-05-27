import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AiModule } from './ai/ai.module';
import { SwiftyexModule } from './swiftyex/swiftyex.module';
import { BotModule } from './bot/bot.module';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt.guard';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { PricesModule } from './prices/prices.module';
import { RulesModule } from './rules/rules.module';
import { InsightsModule } from './insights/insights.module';
import { PaymentsModule } from './payments/payments.module';

import { GlobalExceptionFilter } from './common/exception.filter';
import { BigintSerializeInterceptor } from './common/serialize.interceptor';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    PrismaModule,
    RedisModule,
    AiModule,
    SwiftyexModule,
    BotModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    PricesModule,
    RulesModule,
    InsightsModule,
    PaymentsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: BigintSerializeInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
