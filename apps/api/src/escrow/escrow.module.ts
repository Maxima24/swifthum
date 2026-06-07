import { Module } from '@nestjs/common';
import { BotModule } from '../bot/bot.module';
import { AiModule } from '../ai/ai.module';
import { EscrowController } from './escrow.controller';
import { EscrowAdminController } from './escrow-admin.controller';
import { EscrowService } from './escrow.service';

/**
 * Ledger / Receipts / Idempotency are global. BotModule provides BotPushService
 * for state-change DMs; AiModule provides AnthropicService for AI-assisted
 * dispute resolution. EscrowService is exported so the worker runs the expiry
 * sweep.
 */
@Module({
  imports: [BotModule, AiModule],
  controllers: [EscrowController, EscrowAdminController],
  providers: [EscrowService],
  exports: [EscrowService],
})
export class EscrowModule {}
