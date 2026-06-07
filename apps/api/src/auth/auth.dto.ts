import { IsInt, IsOptional, IsString, MaxLength, MinLength, Min } from 'class-validator';

export class TelegramSignInDto {
  @IsString()
  @MinLength(1)
  initData!: string;
}

export class BotExchangeDto {
  @IsInt()
  @Min(1)
  telegramId!: number;

  // The bot forwards the caller's Telegram @handle so bot-only users are still
  // findable by pay-by-username (Mini-App sign-in is the other capture path).
  @IsOptional()
  @IsString()
  @MaxLength(40)
  username?: string;
}
