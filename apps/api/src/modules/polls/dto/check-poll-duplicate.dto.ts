import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Stage-1 dedup at creation: a fast `word_similarity` check of the free-text
 * question against active polls in the same market, BEFORE any LLM resolution.
 * Favors precision (high threshold) so only obvious duplicates are surfaced.
 */
export class CheckPollDuplicateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  question: string;

  @IsOptional()
  @IsString()
  marketKey?: string;
}
