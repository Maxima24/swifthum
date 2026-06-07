import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateEscrowDto {
  @IsInt()
  @Min(1)
  amountMinor!: number;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  terms?: string;

  @IsOptional()
  @IsIn(['NGN'])
  currency?: 'NGN';
}

export class JoinEscrowDto {
  @IsString()
  @MinLength(10)
  @MaxLength(64)
  joinCode!: string;
}

export class ResolveDisputeDto {
  @IsOptional()
  @IsIn(['release', 'refund'])
  decision?: 'release' | 'refund';

  @IsOptional()
  @IsBoolean()
  aiAssisted?: boolean;
}
