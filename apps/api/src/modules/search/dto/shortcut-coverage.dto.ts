import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  IsBoolean,
  IsInt,
  IsOptional,
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
  // The client projects the FOUR screen corners (search-fresh-bounds-capture.ts:94-99); the service
  // interpolates one ST_MakePoint per point into the SQL text, so an unbounded array is an unbounded
  // SQL string. Cap at 8 — double the real quad, headroom for a richer polygon, no room for abuse.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  viewportPolygon?: Array<[number, number]>;

  @IsOptional()
  @IsBoolean()
  includeTopDish?: boolean;

  // TR5-N (map follows the active variant): the coverage/dots layer applies the SAME filter
  // state as the ranked results, so a filtered rerun (open-now / price / rising) re-shapes the
  // map, not just the cards. Absent fields = unfiltered coverage (byte-identical to before).
  @IsOptional()
  @IsBoolean()
  openNow?: boolean;

  /** DIETARY WALLS: canonical names, same per-projection semantics the ranked
   *  lane applies (venue attribute OR any qualifying dish). Without this the
   *  map keeps every pin while the cards are walled — the exact "map follows
   *  the cards" break found 2026-08-04. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dietary?: string[];

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
