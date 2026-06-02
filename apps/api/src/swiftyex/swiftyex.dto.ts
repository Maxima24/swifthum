import { IsString, MinLength } from 'class-validator';

export class LinkAccountDto {
  @IsString()
  @MinLength(1)
  apiKey!: string;
}
