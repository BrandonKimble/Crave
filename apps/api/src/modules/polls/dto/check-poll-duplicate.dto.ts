import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class CoordinateDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
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
 * question against active polls of the same PLACE (Phase C re-key — the place
 * resolves from `bounds`; `marketKey` survives only for pre-cut clients),
 * BEFORE any LLM resolution. Favors precision (high threshold) so only
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

  @IsOptional()
  @IsString()
  marketKey?: string;
}
