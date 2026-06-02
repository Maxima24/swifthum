import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/current-user.decorator';
import { SwiftyexService } from './swiftyex.service';
import { LinkAccountDto } from './swiftyex.dto';

/**
 * SwiftyEx account + portfolio endpoints. Additive to the original frontend
 * contract — the Settings "Link SwiftyEx" toggle wires here, and a future
 * holdings view reads GET /swiftyex/holdings.
 */
@Controller('swiftyex')
export class SwiftyexController {
  constructor(private readonly swiftyex: SwiftyexService) {}

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
