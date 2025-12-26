import { FavoriteListType, FavoriteListVisibility } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFavoriteListDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(FavoriteListType)
  listType!: FavoriteListType;

  @IsOptional()
  @IsEnum(FavoriteListVisibility)
  visibility?: FavoriteListVisibility;
}
