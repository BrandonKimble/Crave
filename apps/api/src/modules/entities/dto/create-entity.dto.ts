import { IsNotEmpty, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { EntityType } from '@prisma/client';
import {
  IsEntityType,
  IsSafeString,
  IsPositiveNumber,
} from '../../../shared/pipes/custom-validators';

/**
 * Location data for restaurant entities
 */
export class LocationDto {
  @ValidateNested()
  @Type(() => CoordinatesDto)
  coordinates: CoordinatesDto;

  @IsSafeString()
  @IsNotEmpty()
  address: string;

  @IsSafeString()
  @IsNotEmpty()
  city: string;

  @IsSafeString()
  @IsNotEmpty()
  state: string;

  @IsSafeString()
  @IsNotEmpty()
  zipCode: string;
}

/**
 * Coordinates for location data
 */
export class CoordinatesDto {
  @IsPositiveNumber()
  lat: number;

  @IsPositiveNumber()
  lng: number;
}

/**
 * DTO for creating entities
 */
export class CreateEntityDto {
  @IsEntityType()
  entityType: EntityType;

  @IsSafeString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsSafeString()
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;

  @IsOptional()
  metadata?: Record<string, any>;
}
