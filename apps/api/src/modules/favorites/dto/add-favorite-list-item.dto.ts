import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

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

  /** Save-funnel toolkit: the owner's personal note (authored lists). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;

  /** Friction-free micro-notes; later toggle-strip filters. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
