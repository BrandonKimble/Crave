import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class FavoriteListResultsUserLocationDto {
  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

export class FavoriteListResultsPaginationDto {
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

/**
 * v1 request body for POST /favorites/lists/:listId/results.
 * Intentionally its OWN DTO (NOT the search DTO, whose searchRequestId is
 * @IsUUID — favorites synthesize a non-UUID searchRequestId). All fields are
 * optional. There is deliberately NO bounds/viewport field: v1 fits the map to
 * the list's own extent, so omitting bounds avoids silently dropping off-screen
 * favorites.
 */
export class FavoriteListResultsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => FavoriteListResultsUserLocationDto)
  userLocation?: FavoriteListResultsUserLocationDto;

  @IsOptional()
  @IsBoolean()
  openNow?: boolean;

  /**
   * Leg 10 (primitive defect #4): the ListDetail strip's Price chip — the same
   * vocabulary as the search DTO (Google price_level 0–4); rides the executor's
   * existing price filter (priceFilterApplied metadata already flows through).
   */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(4, { each: true })
  priceLevels?: number[];

  /**
   * Leg 11 (leg-9 primitive defect: Market chip had no data path): the
   * ListDetail strip's Market chip (§8.16 — the virtual All list is "sliced by
   * city"). Rides the executor's existing activeMarketKey directive (the
   * core_markets geometry-covers filter) — same additive pattern as
   * openNow/priceLevels above.
   */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  marketKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => FavoriteListResultsPaginationDto)
  pagination?: FavoriteListResultsPaginationDto;

  /**
   * RT-18 slug-as-capability: non-owner/non-collaborator access requires
   * presenting the CURRENT share slug (rotation = revocation).
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  shareSlug?: string;

  /**
   * Row ordering (spec B.1.4): 'custom' = the saver's position order,
   * 'recent' = newest saves first, 'best' = crave score (executor default).
   * Omitted = the list's defaultSort ('custom' iff a custom order exists).
   */
  @IsOptional()
  @IsIn(['custom', 'best', 'recent'])
  sort?: 'custom' | 'best' | 'recent';

  /**
   * Virtual All-list only (spec B.1.6): whose All to resolve. Omitted =
   * the viewer's own; another user = their PUBLIC lists' union.
   */
  @IsOptional()
  @IsUUID()
  targetUserId?: string;
}
