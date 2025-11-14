import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @MaxLength(255)
  token!: string;

  @IsOptional()
  @IsString()
  userId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string | null;
}
