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
  ValidateNested,
  MaxLength,
  Min,
} from 'class-validator';
import { CoordinateDto, MapBoundsDto } from '../../search/dto/search-query.dto';

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

  @IsOptional()
  @ValidateNested()
  @Type(() => MapBoundsDto)
  bounds?: MapBoundsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  userLocation?: CoordinateDto;
}

export class AutocompleteMatchDto {
  entityId!: string;
  entityType!: EntityType | 'query';
  name!: string;
  confidence!: number;
  aliases!: string[];
  matchType?: 'entity' | 'query';
  badges?: {
    favorite?: boolean;
    viewed?: boolean;
    recentQuery?: boolean;
  };
  querySuggestionSource?: 'personal' | 'global';
}

export class AutocompleteResponseDto {
  matches!: AutocompleteMatchDto[];
  query!: string;
  normalizedQuery!: string;
  onDemandQueued?: boolean;
  onDemandReason?: string;
  querySuggestions?: string[];
}
