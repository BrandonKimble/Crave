import { IsInt, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';

export class AddFavoriteListItemDto {
  @ValidateIf((value: AddFavoriteListItemDto) => !value.connectionId)
  @IsUUID()
  restaurantId?: string;

  @ValidateIf((value: AddFavoriteListItemDto) => !value.restaurantId)
  @IsUUID()
  connectionId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
