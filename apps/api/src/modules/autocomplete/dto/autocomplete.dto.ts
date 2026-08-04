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
  Max,
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
  // Unbounded page size is a memory/DoS vector — every other paginated
  // DTO in this codebase already caps (audit 2026-08-01).
  @Max(25)
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
  entityType!: EntityType | 'query' | 'poll' | 'user';
  /**
   * THE DISPLAY STRING — localized (N10). Never send this back to the server
   * as a query: see `submitToken`.
   */
  name!: string;
  /**
   * THE CANONICAL STRING the client must submit when this row is tapped.
   *
   * The attribute-tap flow submits a row's text as the next search string. As
   * soon as `name` is localized ("vegetariano"), submitting it would ask the
   * gazetteer a question it cannot answer in that language yet — a match
   * break that LOOKS like a search-quality bug. So display and matching stop
   * being the same field: `name` is for the eye, `submitToken` is for the
   * matcher. Always present, equal to `name` whenever nothing was localized.
   */
  submitToken?: string;
  confidence!: number;
  aliases!: string[];
  matchType?: 'entity' | 'query' | 'poll' | 'user';
  // Person rows (user lane): the handle shown under the display name.
  username?: string | null;
  // How this entity matched (exact / prefix / contains / name / alias / fuzzy /
  // edit / embedding). Forwarded from the recall core so the client can distinguish an
  // exact hit from a weak guess — the signal the profile-jump gate needs. Absent
  // for non-entity rows (query suggestions, polls) and injected personal lanes.
  evidenceTier?: TextMatchEvidence;
  badges?: {
    favorite?: boolean;
    viewed?: boolean;
    recentQuery?: boolean;
  };
  querySuggestionSource?: 'personal' | 'global';
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
