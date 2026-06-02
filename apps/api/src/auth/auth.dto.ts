import { IsInt, IsString, MinLength, Min } from 'class-validator';

export class TelegramSignInDto {
  @IsString()
  @MinLength(1)
  initData!: string;
}

export class BotExchangeDto {
  @IsInt()
  @Min(1)
  telegramId!: number;
}
