import { Module } from '@nestjs/common';
import { BotPushService } from './bot-push.service';

@Module({
  providers: [BotPushService],
  exports: [BotPushService],
})
export class BotModule {}
