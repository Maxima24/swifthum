import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { ReceiptsService } from './receipts.service';

@Controller()
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  /** The caller's receipts (sent + received) with shareable links. */
  @Get('receipts')
  list(@CurrentUser() user: JwtPayload) {
    return this.receipts.listForUser(user.sub);
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
