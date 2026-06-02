import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateIntentDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;
}

export class RedeemDto {
  @IsString()
  @MinLength(10)
  token!: string;
}

export class TransactionsQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
