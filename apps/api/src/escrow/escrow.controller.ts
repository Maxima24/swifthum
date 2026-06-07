import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateEscrowDto, JoinEscrowDto } from './escrow.dto';
import { EscrowService } from './escrow.service';

@Controller()
export class EscrowController {
  constructor(
    private readonly escrow: EscrowService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /** Buyer creates + funds an escrow. Optional Idempotency-Key dedupes retries. */
  @Post('escrows')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateEscrowDto,
    @Headers('idempotency-key') idemKey?: string,
  ) {
    const key = idemKey ? `escrow_create:${user.sub}:${idemKey}` : undefined;
    return this.idempotency.run(key, () =>
      this.escrow.createEscrow(user.sub, dto.amountMinor, dto.terms),
    );
  }

  /** Counterparty binds to an escrow via its join code (bot deep-link). */
  @Post('escrow/join')
  join(@CurrentUser() user: JwtPayload, @Body() dto: JoinEscrowDto) {
    return this.escrow.joinEscrow(user.sub, dto.joinCode);
  }

  @Get('escrows')
  list(@CurrentUser() user: JwtPayload) {
    return this.escrow.listForUser(user.sub);
  }

  @Get('escrows/:id')
  detail(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.escrow.getDetail(user.sub, id);
  }

  @Post('escrows/:id/accept')
  accept(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.escrow.accept(user.sub, id);
  }

  @Post('escrows/:id/decline')
  decline(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.escrow.decline(user.sub, id);
  }

  @Post('escrows/:id/cancel')
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.escrow.cancel(user.sub, id);
  }

  @Post('escrows/:id/mark-paid')
  markPaid(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.escrow.markPaid(user.sub, id);
  }

  @Post('escrows/:id/release')
  release(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.escrow.release(user.sub, id);
  }

  @Post('escrows/:id/dispute')
  dispute(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.escrow.dispute(user.sub, id);
  }
}
