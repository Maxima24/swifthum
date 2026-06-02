import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { CreateIntentDto, RedeemDto, TransactionsQueryDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('intents')
  createIntent(@CurrentUser() user: JwtPayload, @Body() dto: CreateIntentDto) {
    return this.payments.createIntent(user.sub, dto.amountMinor);
  }

  @Post('redeem')
  redeem(@CurrentUser() user: JwtPayload, @Body() dto: RedeemDto) {
    return this.payments.redeem(user.sub, dto.token);
  }

  @Get('transactions')
  list(@CurrentUser() user: JwtPayload, @Query() query: TransactionsQueryDto) {
    return this.payments.listTransactions(user.sub, query.cursor, query.limit);
  }
}
