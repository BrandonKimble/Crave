import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { EntityType } from '@prisma/client';
import type {
  DishResult as SharedDishResult,
  DishRestaurantData as SharedDishRestaurantData,
  DishRestaurantLocation as SharedDishRestaurantLocation,
  FilterClause as SharedFilterClause,
  FoodResult as SharedFoodResult,
  QueryFormat as SharedQueryFormat,
  QueryPlan as SharedQueryPlan,
  RestaurantFoodSnippet as SharedRestaurantFoodSnippet,
  RestaurantProfile as SharedRestaurantProfile,
  RestaurantResult as SharedRestaurantResult,
  SearchResponse as SharedSearchResponse,
  SearchResponseMetadata as SharedSearchResponseMetadata,
} from '@crave-search/shared';

export class SearchSubmissionContextDto {
  @IsOptional()
  @IsString()
  typedPrefix?: string;

  @IsOptional()
  @IsString()
  @IsIn(['entity', 'query'])
  matchType?: 'entity' | 'query';

  @IsOptional()
  @IsUUID()
  selectedEntityId?: string;

  @IsOptional()
  @IsEnum(EntityType)
  selectedEntityType?: EntityType;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => UnresolvedEntityGroupDto)
  unresolvedEntities?: UnresolvedEntityGroupDto[];
}

export class UnresolvedEntityGroupDto {
  @IsEnum(EntityType)
  type!: EntityType;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  terms!: string[];
}

export class QueryEntityDto {
  @IsString()
  @IsNotEmpty()
  normalizedName!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  entityIds!: string[];

  @IsOptional()
  @IsString()
  originalText?: string | null;
}

export class QueryEntityGroupDto {
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QueryEntityDto)
  restaurants?: QueryEntityDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QueryEntityDto)
  food?: QueryEntityDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QueryEntityDto)
  foodAttributes?: QueryEntityDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QueryEntityDto)
  restaurantAttributes?: QueryEntityDto[];

  /** Ingredient lane: linked when a food-classified term resolves to an
   *  ingredient entity instead of a dish ("burrata"). */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QueryEntityDto)
  ingredients?: QueryEntityDto[];

  /** Excluded-ingredient lane: "no egg", "without cilantro", allergy phrasing.
   *  Applied as a conservative NOT across either ingredient tier
   *  (testimony-knowledge doctrine rule 3). */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => QueryEntityDto)
  excludedIngredients?: QueryEntityDto[];
}

export class CoordinateDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

export class MapBoundsDto {
  @ValidateNested()
  @Type(() => CoordinateDto)
  northEast!: CoordinateDto;

  @ValidateNested()
  @Type(() => CoordinateDto)
  southWest!: CoordinateDto;
}

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class SearchQueryRequestDto {
  /**
   * "Include similar" scope toggle (owner-settled product shape): false/absent →
   * exact + category-member instances only; true → dense sibling dishes join the
   * pool (pure Crave-Score ranking either way). When PRESENT this overrides the
   * server's SEARCH_DENSE_SIBLINGS_MODE default — including suppressing the
   * silent thin-results widening when explicitly false.
   */
  @IsOptional()
  @IsBoolean()
  includeSimilar?: boolean;

  @ValidateNested()
  @Type(() => QueryEntityGroupDto)
  entities!: QueryEntityGroupDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MapBoundsDto)
  bounds?: MapBoundsDto;

  // Screen-accurate viewport polygon as [lng, lat] pairs (pitch/twist-aware visible quad). When
  // present, the search filters by the exact polygon (ST_Covers) instead of the AABB `bounds` box.
  // Shape is validated rigorously in the query builder's extractPolygonPayload.
  @IsOptional()
  @IsArray()
  viewportPolygon?: Array<[number, number]>;

  @IsOptional()
  @IsBoolean()
  openNow?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination?: PaginationDto;

  @IsOptional()
  @IsBoolean()
  includeSqlPreview?: boolean;

  @IsOptional()
  @IsBoolean()
  compactResponse?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  userLocation?: CoordinateDto;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(4, { each: true })
  priceLevels?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumVotes?: number;

  @IsOptional()
  @IsBoolean()
  risingActive?: boolean;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  sourceQuery?: string;

  @IsOptional()
  @IsUUID()
  searchRequestId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['manual', 'recent', 'autocomplete', 'shortcut'])
  submissionSource?: 'manual' | 'recent' | 'autocomplete' | 'shortcut';

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchSubmissionContextDto)
  submissionContext?: SearchSubmissionContextDto;
}

export class SearchCacheAttributionDto {
  @IsDefined()
  @IsUUID()
  originalBackendSearchRequestId!: string;

  @IsDefined()
  @IsUUID()
  cacheRevealRequestId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cacheAgeMs?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  resultsDataKey?: string;

  @IsOptional()
  @IsString()
  @IsIn(['manual', 'recent', 'autocomplete', 'shortcut'])
  submissionSource?: 'manual' | 'recent' | 'autocomplete' | 'shortcut';

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchSubmissionContextDto)
  submissionContext?: SearchSubmissionContextDto;
}

export const EntityScope = {
  RESTAURANT: 'restaurant',
  FOOD: 'food',
  FOOD_ATTRIBUTE: 'food_attribute',
  RESTAURANT_ATTRIBUTE: 'restaurant_attribute',
  INGREDIENT: 'ingredient',
  CONNECTION: 'connection',
} as const satisfies Record<string, SharedFilterClause['entityType']>;

export type EntityScope = (typeof EntityScope)[keyof typeof EntityScope];
export type QueryFormat = SharedQueryFormat;
export type FilterClause = SharedFilterClause;
export type QueryPlan = SharedQueryPlan;

export interface SearchPlanResponseDto {
  plan: QueryPlan;
  sqlPreview?: string | null;
}

export interface FoodResultDto extends SharedFoodResult {
  restaurantLocationId?: string;
  restaurantDistanceMiles?: number | null;
}

export type RestaurantFoodSnippetDto = SharedRestaurantFoodSnippet;

export interface RestaurantResultDto extends SharedRestaurantResult {
  distanceMiles?: number | null;
}

export type RestaurantProfileDto = SharedRestaurantProfile;

export type DishRestaurantLocationDto = SharedDishRestaurantLocation;
export type DishRestaurantDataDto = SharedDishRestaurantData;
export type DishResultDto = SharedDishResult;

export type SearchResponseMetadataDto = SharedSearchResponseMetadata;
export type SearchResponseDto = SharedSearchResponse;

export class NaturalSearchRequestDto {
  @IsString()
  @IsNotEmpty()
  query!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MapBoundsDto)
  bounds?: MapBoundsDto;

  // Screen-accurate viewport polygon as [lng, lat] pairs (pitch/twist-aware visible quad). When
  // present, the search filters by the exact polygon (ST_Covers) instead of the AABB `bounds` box.
  // Shape is validated rigorously in the query builder's extractPolygonPayload.
  @IsOptional()
  @IsArray()
  viewportPolygon?: Array<[number, number]>;

  @IsOptional()
  @IsBoolean()
  openNow?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination?: PaginationDto;

  @IsOptional()
  @IsBoolean()
  includeSqlPreview?: boolean;

  @IsOptional()
  @IsBoolean()
  compactResponse?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  userLocation?: CoordinateDto;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(4, { each: true })
  priceLevels?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumVotes?: number;

  @IsOptional()
  @IsBoolean()
  risingActive?: boolean;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  sourceQuery?: string;

  @IsOptional()
  @IsUUID()
  searchRequestId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['manual', 'recent', 'autocomplete', 'shortcut'])
  submissionSource?: 'manual' | 'recent' | 'autocomplete' | 'shortcut';

  @IsOptional()
  @ValidateNested()
  @Type(() => SearchSubmissionContextDto)
  submissionContext?: SearchSubmissionContextDto;
}
