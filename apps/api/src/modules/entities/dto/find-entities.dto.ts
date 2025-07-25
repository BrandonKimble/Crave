import { IsOptional, IsEnum, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { IsPositiveNumber } from '../../../shared/pipes/custom-validators';

/**
 * DTO for location-based restaurant queries
 */
export class LocationQueryDto {
  @ValidateNested()
  @Type(() => CenterPointDto)
  centerPoint: CenterPointDto;

  @IsPositiveNumber()
  @Max(50) // Reasonable limit for radius searches
  radiusKm: number;

  @IsOptional()
  includeInactive?: boolean;
}

/**
 * Center point coordinates for location queries
 */
export class CenterPointDto {
  @IsPositiveNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsPositiveNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

/**
 * DTO for attribute filtering
 */
export class AttributeFilterDto {
  @IsOptional()
  @IsEnum(['dish_attribute', 'restaurant_attribute'])
  entityType?: 'dish_attribute' | 'restaurant_attribute';

  @IsOptional()
  @IsPositiveNumber()
  @Min(0)
  skip?: number;

  @IsOptional()
  @IsPositiveNumber()
  @Min(1)
  @Max(100)
  take?: number;
}
