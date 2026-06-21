import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { MapBoundsDto, QueryEntityGroupDto } from './search-query.dto';

export class ShortcutCoverageRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => QueryEntityGroupDto)
  entities?: QueryEntityGroupDto;

  @ValidateNested()
  @Type(() => MapBoundsDto)
  bounds!: MapBoundsDto;

  // Screen-accurate viewport polygon ([lng, lat] pairs). When present the coverage/dots query filters
  // by the exact polygon (ST_Covers) on top of the bounds bbox pre-filter. Shape validated in service.
  @IsOptional()
  @IsArray()
  viewportPolygon?: Array<[number, number]>;

  @IsOptional()
  @IsBoolean()
  includeTopDish?: boolean;

  @IsOptional()
  @IsString()
  marketKey?: string;
}
