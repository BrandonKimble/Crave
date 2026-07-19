import {
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

  /** Location-centric saves (master plan §7): the SPECIFIC saved location —
   *  ListDetail renders exactly this pin. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  /** Save-funnel toolkit: the owner's personal note (authored lists). */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  note?: string;
}
