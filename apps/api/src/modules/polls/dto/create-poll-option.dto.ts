import { EntityType } from '@prisma/client';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePollOptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  label!: string;

  @IsOptional()
  @IsUUID()
  entityId?: string;

  @IsOptional()
  @IsUUID()
  restaurantId?: string;

  @IsOptional()
  @IsUUID()
  dishEntityId?: string;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;
}
