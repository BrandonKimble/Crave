import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  PollListSort,
  PollListState,
  PollListTime,
  PollListType,
} from './list-polls.dto';

class CoordinateDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

class BoundsDto {
  @IsObject()
  @ValidateNested()
  @Type(() => CoordinateDto)
  northEast!: CoordinateDto;

  @IsObject()
  @ValidateNested()
  @Type(() => CoordinateDto)
  southWest!: CoordinateDto;
}

/**
 * §6 polls feed request: the feed is VIEWPORT-scoped (polls of places in
 * view + descendants of the commensurate subject) with keyset cursor
 * pagination. `bounds` is the request's real subject; the legacy fields
 * below are accepted for pre-cut mobile clients only.
 */
export class QueryPollsDto {
  /**
   * LEGACY (pre-cut mobile): a cached marketKey sent INSTEAD of bounds.
   * Served by treating the market's stored bbox as the view (one interim
   * seam — dies with the mobile feed cut + the Phase C market purge).
   */
  @IsOptional()
  @IsString()
  marketKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BoundsDto)
  bounds?: BoundsDto;

  /**
   * LEGACY (pre-cut mobile): accepted and IGNORED — the old market-election
   * read used it; the viewport feed does not (mobile only ever sent it
   * alongside bounds).
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  userLocation?: CoordinateDto;

  @IsOptional()
  @IsEnum(PollListState)
  state?: PollListState;

  @IsOptional()
  @IsEnum(PollListSort)
  sort?: PollListSort;

  @IsOptional()
  @IsEnum(PollListType)
  type?: PollListType;

  @IsOptional()
  @IsEnum(PollListTime)
  time?: PollListTime;

  /** Opaque keyset cursor from a previous page's `nextCursor`. */
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Page size — a DTO-validated client choice (§16), bounded HERE at the API
   * boundary exactly like search's PaginationDto.pageSize (@Max(100)).
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}
