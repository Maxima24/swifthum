import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { Errors } from '../common/errors';
import { SwiftyexService } from './swiftyex.service';
import { SwiftyexMiniAppService } from './miniapp.service';
import { LinkAccountDto } from './swiftyex.dto';

/**
 * SwiftyEx account + portfolio endpoints. Additive to the original frontend
 * contract — the Settings "Link SwiftyEx" toggle wires here, and a future
 * holdings view reads GET /swiftyex/holdings.
 *
 * The `/swiftyex/{rates,wallets,me,sx-transactions}` routes proxy the real
 * SwiftyEx Mini App API. Per-user ones forward the caller's Telegram initData
 * (sent by the Mini App as `X-Telegram-InitData`); the response is passed through
 * untouched. Gated on SWIFTYEX_MINIAPP_BASE_URL → `{ configured:false }` so the UI
 * can show a "Connect SwiftyEx" state instead of erroring.
 */
@Controller('swiftyex')
export class SwiftyexController {
  constructor(
    private readonly swiftyex: SwiftyexService,
    private readonly miniApp: SwiftyexMiniAppService,
  ) {}

  @Get('rates')
  async rates() {
    if (!this.miniApp.isConfigured()) return { configured: false };
    return { configured: true, rates: await this.miniApp.getRates() };
  }

  @Get('wallets')
  async wallets(@Headers('x-telegram-initdata') initData?: string) {
    if (!this.miniApp.isConfigured()) return { configured: false };
    return { configured: true, wallets: await this.miniApp.getWallets(this.requireInitData(initData)) };
  }

  @Get('me')
  async me(@Headers('x-telegram-initdata') initData?: string) {
    if (!this.miniApp.isConfigured()) return { configured: false };
    return { configured: true, profile: await this.miniApp.getMe(this.requireInitData(initData)) };
  }

  @Get('sx-transactions')
  async sxTransactions(
    @Headers('x-telegram-initdata') initData?: string,
    @Query('page') page?: string,
    @Query('wallet_type') walletType?: string,
  ) {
    if (!this.miniApp.isConfigured()) return { configured: false };
    const txns = await this.miniApp.getTransactions(
      this.requireInitData(initData),
      page ? Number(page) : 1,
      walletType ?? '',
    );
    return { configured: true, transactions: txns };
  }

  private requireInitData(initData?: string): string {
    // Empty string is allowed (SwiftyEx DEBUG mode → first chat); only a missing
    // header is an error.
    if (initData === undefined) throw Errors.validation('initData required');
    return initData;
  }

  @Get('account')
  account(@CurrentUser() user: JwtPayload) {
    return this.swiftyex.getAccount(user.sub);
  }

  @Post('link')
  link(@CurrentUser() user: JwtPayload, @Body() dto: LinkAccountDto) {
    return this.swiftyex.linkAccount(user.sub, dto.apiKey);
  }

  @Delete('link')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@CurrentUser() user: JwtPayload) {
    await this.swiftyex.unlinkAccount(user.sub);
  }

  @Get('holdings')
  holdings(@CurrentUser() user: JwtPayload) {
    return this.swiftyex.getHoldings(user.sub);
  }
}
