import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateIntentDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;
}

export class ParsePaymentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(280)
  text!: string;
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
