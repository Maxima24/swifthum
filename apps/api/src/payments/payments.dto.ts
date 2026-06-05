import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateIntentDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  // The Mini App sends `currency: 'NGN'`; accept it so forbidNonWhitelisted
  // doesn't reject the request. The service always settles in NGN regardless.
  @IsOptional()
  @IsIn(['NGN'])
  currency?: 'NGN';
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
