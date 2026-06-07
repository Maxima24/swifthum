import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateGiftDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  message?: string;

  // The Mini App may send `currency: 'NGN'`; accept it so forbidNonWhitelisted
  // doesn't reject the request. Gifts always settle in NGN.
  @IsOptional()
  @IsIn(['NGN'])
  currency?: 'NGN';
}

export class ClaimGiftDto {
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  claimCode!: string;
}
