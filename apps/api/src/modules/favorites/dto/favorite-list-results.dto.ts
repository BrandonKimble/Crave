import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  Max,
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

  @IsOptional()
  @ValidateNested()
  @Type(() => FavoriteListResultsPaginationDto)
  pagination?: FavoriteListResultsPaginationDto;
}
