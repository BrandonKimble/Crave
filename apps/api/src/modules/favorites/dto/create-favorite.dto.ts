import { EntityType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateFavoriteDto {
  @IsUUID()
  entityId!: string;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  /** Location-centric saves (master plan §7): the SPECIFIC location this
   *  favorite was saved from. Always sent by current clients; optional so a
   *  dish/entity favorite without location context still saves. */
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
