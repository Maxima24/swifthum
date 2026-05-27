import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Errors } from '../common/errors';
import { UsersService } from '../users/users.service';
import { verifyInitData } from './init-data';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async signInWithTelegram(initData: string) {
    const botToken = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!botToken) throw Errors.invalidInitData('telegram bot token not configured');
    const maxAge = Number(this.config.get<string>('TELEGRAM_INITDATA_MAX_AGE_SEC', '3600'));

    const verified = verifyInitData(initData, botToken, maxAge);
    if (!verified) throw Errors.invalidInitData('initData failed HMAC check or is stale');

    const seed = BigInt(this.config.get<string>('WALLET_SEED_NGN_MINOR', '2500000'));
    const user = await this.users.upsertByTelegram(verified.user, seed);

    const sessionToken = await this.jwt.signAsync({
      sub: user.id,
      telegramId: Number(user.telegramId),
    });

    return {
      sessionToken,
      user: {
        id: user.id,
        telegramId: Number(user.telegramId),
        displayName: user.displayName,
      },
    };
  }
}
