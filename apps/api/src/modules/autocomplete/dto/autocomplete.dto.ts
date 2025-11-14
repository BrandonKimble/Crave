import { EntityType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AutocompleteRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  query!: string;

  @IsOptional()
  @IsEnum(EntityType)
  entityType?: EntityType;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  enableOnDemand?: boolean;
}

export class AutocompleteMatchDto {
  entityId!: string;
  entityType!: EntityType;
  name!: string;
  confidence!: number;
  aliases!: string[];
}

export class AutocompleteResponseDto {
  matches!: AutocompleteMatchDto[];
  query!: string;
  normalizedQuery!: string;
  onDemandQueued?: boolean;
  onDemandReason?: string;
}
