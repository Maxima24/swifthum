import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsEmail, IsOptional, MaxLength } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { ReceiptsService } from './receipts.service';

class EmailReceiptDto {
  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}

@Controller()
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** The caller's receipts (sent + received) with shareable links. */
  @Get('receipts')
  list(@CurrentUser() user: JwtPayload) {
    return this.receipts.listForUser(user.sub);
  }

  /** Email a receipt to the caller (their saved email, or one passed in the body). */
  @Post('receipts/:id/email')
  emailReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: EmailReceiptDto,
  ) {
    return this.receipts.emailReceipt(user.sub, id, dto.email);
  }

  /**
   * Public verification — anyone with a shared receipt link hits this. Re-checks
   * the token signature server-side and returns the masked receipt (or invalid).
   * No auth: the whole point is third-party verifiability. The bot passes its
   * bearer too, which @Public harmlessly ignores.
   */
  @Public()
  @Get('receipts/verify')
  verify(@Query('token') token?: string) {
    return this.receipts.verifyToken(token ?? '');
  }
}
