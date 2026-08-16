import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class AddUserListItemDto {
  @ValidateIf((value: AddUserListItemDto) => !value.connectionId)
  @IsUUID()
  placeId?: string;

  @ValidateIf((value: AddUserListItemDto) => !value.placeId)
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
