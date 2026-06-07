import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { BotExchangeDto, TelegramSignInDto } from './auth.dto';
import { InternalSecretGuard } from './internal-secret.guard';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  async telegram(@Body() body: TelegramSignInDto) {
    return this.auth.signInWithTelegram(body.initData);
  }

  /**
   * Bot session exchange. Public from the JWT guard's POV (no Bearer needed),
   * but gated by InternalSecretGuard which requires a matching
   * `X-Internal-Secret` header. The bot caches the returned JWT per user.
   */
  @Public()
  @UseGuards(InternalSecretGuard)
  @Post('bot/exchange')
  @HttpCode(HttpStatus.OK)
  async botExchange(@Body() body: BotExchangeDto) {
    return this.auth.exchangeForBot(body.telegramId, body.username);
  }
}
