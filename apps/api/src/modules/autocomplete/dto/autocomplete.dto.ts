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
import type { RestaurantStatusPreviewDto } from '../../search/dto/restaurant-status-preview.dto';
import type { TextMatchEvidence } from '../../entity-text-search/entity-text-search.service';

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
  // For polls, `entityId` is the pollId and `name` is the poll question.
  entityId!: string;
  entityType!: EntityType | 'query' | 'poll';
  name!: string;
  confidence!: number;
  aliases!: string[];
  matchType?: 'entity' | 'query' | 'poll';
  // How this entity matched (exact / prefix / name / alias / fuzzy / phonetic /
  // embedding). Forwarded from the recall core so the client can distinguish an
  // exact hit from a weak guess — the signal the profile-jump gate needs. Absent
  // for non-entity rows (query suggestions, polls) and injected personal lanes.
  evidenceTier?: TextMatchEvidence;
  badges?: {
    favorite?: boolean;
    viewed?: boolean;
    recentQuery?: boolean;
  };
  querySuggestionSource?: 'personal' | 'global';
  locationCount?: number;
  statusPreview?: RestaurantStatusPreviewDto | null;
}

export class AutocompleteResponseDto {
  matches!: AutocompleteMatchDto[];
  query!: string;
  normalizedQuery!: string;
  onDemandQueued?: boolean;
  onDemandReason?: string;
  querySuggestions?: string[];
}
