import {
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateUserOnboardingDto {
  @IsString()
  @IsIn(['completed'])
  status!: 'completed';

  @IsInt()
  @Min(1)
  onboardingVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  selectedCity?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  previewCity?: string | null;

  @IsOptional()
  @IsObject()
  answers?: Record<string, string | string[] | number | undefined>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string | null;
}
