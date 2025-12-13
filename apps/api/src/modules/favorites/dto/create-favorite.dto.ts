import { EntityType } from '@prisma/client';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';

export class CreateFavoriteDto {
  @IsUUID()
  entityId!: string;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;
}
