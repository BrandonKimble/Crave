import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { EntityType } from '@prisma/client';
import type {
  FilterClause as SharedFilterClause,
  FoodResult as SharedFoodResult,
  QueryFormat as SharedQueryFormat,
  QueryPlan as SharedQueryPlan,
  RestaurantFoodSnippet as SharedRestaurantFoodSnippet,
  RestaurantResult as SharedRestaurantResult,
  SearchResponse as SharedSearchResponse,
  SearchResponseMetadata as SharedSearchResponseMetadata,
} from '@crave-search/shared';

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
  @ValidateNested()
  @Type(() => QueryEntityGroupDto)
  entities!: QueryEntityGroupDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MapBoundsDto)
  bounds?: MapBoundsDto;

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
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  sourceQuery?: string;
}

export const EntityScope = {
  RESTAURANT: 'restaurant',
  FOOD: 'food',
  FOOD_ATTRIBUTE: 'food_attribute',
  RESTAURANT_ATTRIBUTE: 'restaurant_attribute',
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
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  sourceQuery?: string;
}

export class SearchResultClickDto {
  @IsUUID()
  entityId!: string;

  @IsEnum(EntityType)
  entityType!: EntityType;
}
