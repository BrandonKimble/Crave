import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type { OperatingStatus } from '@crave-search/shared';

import { CoordinateDto } from './search-query.dto';

export class RestaurantStatusPreviewRequestDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  restaurantIds!: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  userLocation?: CoordinateDto;
}

export type RestaurantStatusPreviewDto = {
  restaurantId: string;
  operatingStatus: OperatingStatus | null;
  distanceMiles: number | null;
  locationCount: number | null;
};
