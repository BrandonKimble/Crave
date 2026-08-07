import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type { RestaurantStatusPreview } from '@crave-search/shared';

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

/** F3803 (D79 starter): the response row is the SHARED wire shape, not a
 *  hand-maintained twin of the mobile type. The request DTO above keeps its
 *  class-validator decorators — that is the half that cannot be shared. */
export type RestaurantStatusPreviewDto = RestaurantStatusPreview;
