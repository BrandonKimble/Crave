import { EntityType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
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
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(EntityType, { each: true })
  @Type(() => String)
  entityTypes?: EntityType[];

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
  entityType!: EntityType | 'query';
  name!: string;
  confidence!: number;
  aliases!: string[];
  matchType?: 'entity' | 'query';
}

export class AutocompleteResponseDto {
  matches!: AutocompleteMatchDto[];
  query!: string;
  normalizedQuery!: string;
  onDemandQueued?: boolean;
  onDemandReason?: string;
  querySuggestions?: string[];
}
