import { FavoriteListType, FavoriteListVisibility } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListFavoriteListsDto {
  @IsOptional()
  @IsEnum(FavoriteListType)
  listType?: FavoriteListType;

  @IsOptional()
  @IsEnum(FavoriteListVisibility)
  visibility?: FavoriteListVisibility;
}
