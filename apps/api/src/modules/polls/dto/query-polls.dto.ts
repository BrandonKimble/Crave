import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
  IsLatitude,
  IsLongitude,
} from 'class-validator';
import {
  PollListSort,
  PollListState,
  PollListTime,
  PollListType,
} from './list-polls.dto';

class CoordinateDto {
  // Abuse audit 2026-08-01: bare @IsNumber accepted lat 1e308 / lng -99999,
  // which flowed into ST_MakeEnvelope and became the world-envelope seq scan
  // on an UNAUTHENTICATED endpoint. Every other geo DTO in the codebase uses
  // the range validators; these three did not.
  @IsLatitude()
  lat!: number;

  @IsLongitude()
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
 * pagination. `bounds` is the request's real subject (the legacy marketKey
 * arm died with the legacy-poll-expiry leg; post-cut mobile sends bounds).
 */
export class QueryPollsDto {
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
   * §6 place slicer (server-truth): constrain the feed to this place's DAG
   * SUBTREE (self + descendants), intersected with the viewport membership.
   * Omit for the unfiltered feed. `placeOptions` in the response is ALWAYS
   * computed over the unfiltered membership.
   */
  @IsOptional()
  @IsUUID()
  placeFilterId?: string;

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
