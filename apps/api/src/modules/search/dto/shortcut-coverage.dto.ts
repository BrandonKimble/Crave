import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
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

  // TR5-N (map follows the active variant): the coverage/dots layer applies the SAME filter
  // state as the ranked results, so a filtered rerun (open-now / price / rising) re-shapes the
  // map, not just the cards. Absent fields = unfiltered coverage (byte-identical to before).
  @IsOptional()
  @IsBoolean()
  openNow?: boolean;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(4, { each: true })
  @Type(() => Number)
  priceLevels?: number[];

  @IsOptional()
  @IsBoolean()
  rising?: boolean;
}
