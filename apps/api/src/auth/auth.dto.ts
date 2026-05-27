import { IsString, MinLength } from 'class-validator';

export class TelegramSignInDto {
  @IsString()
  @MinLength(1)
  initData!: string;
}
