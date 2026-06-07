import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { GiftsController } from './gifts.controller';
import { GiftsService } from './gifts.service';

/**
 * LedgerService + IdempotencyService are global (Stage 1). BotModule provides
 * BotPushService for claim/expiry DMs. GiftsService is exported so the worker
 * can run the expiry sweep.
 */
@Module({
  imports: [BotModule],
  controllers: [GiftsController],
  providers: [GiftsService],
  exports: [GiftsService],
})
export class GiftsModule {}
