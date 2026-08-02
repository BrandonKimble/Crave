import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  IsLatitude,
  IsLongitude,
} from 'class-validator';

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
  @ValidateNested()
  @Type(() => CoordinateDto)
  northEast!: CoordinateDto;

  @ValidateNested()
  @Type(() => CoordinateDto)
  southWest!: CoordinateDto;
}

/**
 * Stage-1 dedup at creation: a fast `word_similarity` check of the free-text
 * question against active polls of the same PLACE (the place resolves from
 * `bounds`; the legacy marketKey arm is dead), BEFORE any LLM resolution. Favors precision (high threshold) so only
 * obvious duplicates are surfaced.
 */
export class CheckPollDuplicateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  question: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BoundsDto)
  bounds?: BoundsDto;
}
