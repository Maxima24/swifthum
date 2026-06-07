import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { ClaimGiftDto, CreateGiftDto } from './gifts.dto';
import { GiftsService } from './gifts.service';

@Controller()
export class GiftsController {
  constructor(
    private readonly gifts: GiftsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Create a gift link. Optional `Idempotency-Key` header dedupes client retries
   * (the response is cached); the ledger's unique key is the hard money guard.
   */
  @Post('gifts')
  createGift(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGiftDto,
    @Headers('idempotency-key') idemKey?: string,
  ) {
    const key = idemKey ? `gifts_create:${user.sub}:${idemKey}` : undefined;
    return this.idempotency.run(key, () =>
      this.gifts.createGift(user.sub, dto.amountMinor, dto.message),
    );
  }

  /** Recipient claims a gift by its code (called by the bot deep-link handler). */
  @Post('gifts/claim')
  claimGift(@CurrentUser() user: JwtPayload, @Body() dto: ClaimGiftDto) {
    return this.gifts.claimGift(user.sub, dto.claimCode);
  }

  /** The caller's sent gifts with claim links + state. */
  @Get('gifts')
  listGifts(@CurrentUser() user: JwtPayload) {
    return this.gifts.listGifts(user.sub);
  }

  /** Sender reclaims an unclaimed gift; funds return to their wallet. */
  @Post('gifts/:id/cancel')
  cancelGift(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.gifts.cancelGift(user.sub, id);
  }
}
