import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ActivityLevel, EntityType } from '@prisma/client';

export enum EntityScope {
  RESTAURANT = 'restaurant',
  FOOD = 'food',
  FOOD_ATTRIBUTE = 'food_attribute',
  RESTAURANT_ATTRIBUTE = 'restaurant_attribute',
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
}

export type QueryFormat = 'single_list' | 'dual_list';

export type FilterStage = 'restaurant' | 'connection';

export interface FilterClause {
  scope: FilterStage;
  description: string;
  entityType: EntityScope;
  entityIds: string[];
  payload?: Record<string, unknown>;
}

export interface QueryPlan {
  format: QueryFormat;
  restaurantFilters: FilterClause[];
  connectionFilters: FilterClause[];
  ranking: {
    foodOrder: string;
    restaurantOrder: string;
  };
  diagnostics: {
    missingEntities: EntityScope[];
    notes: string[];
  };
}

export interface SearchPlanResponseDto {
  plan: QueryPlan;
  sqlPreview?: string | null;
}

export interface FoodResultDto {
  connectionId: string;
  foodId: string;
  foodName: string;
  foodAliases: string[];
  restaurantId: string;
  restaurantName: string;
  restaurantAliases: string[];
  qualityScore: number;
  activityLevel: ActivityLevel;
  mentionCount: number;
  totalUpvotes: number;
  recentMentionCount: number;
  lastMentionedAt?: string | null;
  categories: string[];
  foodAttributes: string[];
}

export interface RestaurantFoodSnippetDto {
  connectionId: string;
  foodId: string;
  foodName: string;
  qualityScore: number;
  activityLevel: ActivityLevel;
}

export interface RestaurantResultDto {
  restaurantId: string;
  restaurantName: string;
  restaurantAliases: string[];
  contextualScore: number;
  restaurantQualityScore?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  topFood: RestaurantFoodSnippetDto[];
}

export interface SearchResponseDto {
  format: QueryFormat;
  plan: QueryPlan;
  food: FoodResultDto[];
  restaurants?: RestaurantResultDto[];
  sqlPreview?: string | null;
  metadata: {
    totalFoodResults: number;
    totalRestaurantResults: number;
    queryExecutionTimeMs: number;
    boundsApplied: boolean;
    openNowApplied: boolean;
    openNowSupportedRestaurants: number;
    openNowUnsupportedRestaurants: number;
    openNowFilteredOut: number;
    page: number;
    pageSize: number;
    perRestaurantLimit: number;
    unresolvedEntities?: Array<{
      type: EntityType;
      terms: string[];
    }>;
    sourceQuery?: string;
    analysisMetadata?: Record<string, unknown>;
  };
}

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
}

export class SearchResultClickDto {
  @IsUUID()
  entityId!: string;

  @IsEnum(EntityType)
  entityType!: EntityType;
}
