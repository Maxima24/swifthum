import { IsBoolean, IsEmail, IsOptional, MaxLength } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;
}
