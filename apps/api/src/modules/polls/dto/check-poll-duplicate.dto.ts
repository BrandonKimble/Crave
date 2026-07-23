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
