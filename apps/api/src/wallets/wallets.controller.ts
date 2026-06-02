import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { WalletsService } from './wallets.service';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Get('me')
  async getMine(@CurrentUser() user: JwtPayload) {
    const w = await this.wallets.getForUser(user.sub);
    return { balanceMinor: w.balanceMinor, currency: w.currency };
  }
}
