import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { type Asset, ASSET_VALUES } from '../common/assets';

export type { Asset };
export type Operator = 'lt' | 'gt' | 'crosses_above' | 'crosses_below';
export type Action = 'buy' | 'sell' | 'alert';

export class RuleConditionDto {
  @IsIn(ASSET_VALUES)
  asset!: Asset;

  @IsIn(['lt', 'gt', 'crosses_above', 'crosses_below'])
  op!: Operator;

  @IsInt()
  @Min(1)
  priceMinor!: number;
}

export class RuleActionDto {
  @IsIn(['buy', 'sell', 'alert'])
  action!: Action;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountMinor?: number;

  @IsOptional()
  @IsIn(['NGN', ...ASSET_VALUES])
  currency?: 'NGN' | Asset;
}

export class CreateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @ValidateNested()
  @Type(() => RuleConditionDto)
  when!: RuleConditionDto;

  @ValidateNested()
  @Type(() => RuleActionDto)
  then!: RuleActionDto;
}

export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RuleConditionDto)
  when?: RuleConditionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => RuleActionDto)
  then?: RuleActionDto;
}
