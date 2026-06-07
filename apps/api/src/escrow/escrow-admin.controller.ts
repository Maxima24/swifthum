import { Body, Controller, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { InternalSecretGuard } from '../auth/internal-secret.guard';
import { Public } from '../auth/public.decorator';
import { ResolveDisputeDto } from './escrow.dto';
import { EscrowService } from './escrow.service';

/**
 * Admin/internal escrow operations. `@Public()` from the JWT guard's POV (no
 * Bearer), but gated by InternalSecretGuard (`X-Internal-Secret`) — the same
 * shared secret the bot exchange uses. The demo presenter resolves disputes by
 * calling this with the internal secret.
 */
@Controller('admin/escrows')
export class EscrowAdminController {
  constructor(private readonly escrow: EscrowService) {}

  @Public()
  @UseGuards(InternalSecretGuard)
  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@Param('id') id: string, @Body() dto: ResolveDisputeDto) {
    return this.escrow.resolveDispute(id, {
      decision: dto.decision,
      aiAssisted: dto.aiAssisted ?? true,
    });
  }
}
