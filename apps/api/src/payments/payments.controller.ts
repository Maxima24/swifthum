import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import {
  CreateIntentDto,
  ParsePaymentDto,
  RedeemDto,
  SendToUserDto,
  TransactionsQueryDto,
} from './payments.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Direct wallet → wallet send to a @username (no QR/gift link). */
  @Post('transfers')
  sendToUser(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendToUserDto,
    @Headers('idempotency-key') idemKey?: string,
  ) {
    const key = idemKey ? `transfer:${user.sub}:${idemKey}` : undefined;
    return this.idempotency.run(key, () =>
      this.payments.sendToUser(user.sub, dto.recipientUsername, dto.amountMinor),
    );
  }

  @Post('intents')
  createIntent(@CurrentUser() user: JwtPayload, @Body() dto: CreateIntentDto) {
    return this.payments.createIntent(user.sub, dto.amountMinor);
  }

  /** Sender polls their intent for the receiver's scan ("Paid ✓" confirmation). */
  @Get('intents/:id')
  intentStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.payments.getIntentStatus(user.sub, id);
  }

  /** Sender cancels an unredeemed intent and is refunded immediately. */
  @Post('intents/:id/cancel')
  cancelIntent(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.payments.cancelIntent(user.sub, id);
  }

  /**
   * Natural-language → payment intent parse. Pure read/inference; doesn't
   * touch the wallet. The caller (bot) renders a confirmation card; the
   * actual intent is created via POST /intents once the user confirms.
   */
  @Post('payments/parse')
  parse(@CurrentUser() user: JwtPayload, @Body() dto: ParsePaymentDto) {
    return this.payments.parseText(user.sub, dto.text);
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
