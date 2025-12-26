import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string;
}
