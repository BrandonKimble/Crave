import { FavoriteListVisibility } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateFavoriteListDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(FavoriteListVisibility)
  visibility?: FavoriteListVisibility;

  /** Profile-gallery pin (page-registry §8.14 long-press modal). */
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}
