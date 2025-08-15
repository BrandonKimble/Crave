import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsBoolean,
  ValidateNested,
  IsUrl,
  IsDateString,
  Min,
} from 'class-validator';
import {
  IsSafeString,
  IsNonEmptyArray,
} from '../../../../shared/pipes/custom-validators';

/**
 * DTO for LLM comment input with validation
 */
export class LLMCommentDto {
  @IsString()
  @IsSafeString()
  id: string;

  @IsString()
  @IsSafeString()
  content: string;

  @IsString()
  @IsSafeString()
  author: string;

  @IsNumber()
  @Min(0)
  score: number;

  @IsDateString()
  created_at: string;

  @IsString({ message: 'parent_id must be a string when provided' })
  @IsSafeString()
  @IsOptional()
  parent_id: string | null;

  @IsUrl()
  url: string;
}

/**
 * DTO for LLM post input with validation
 */
export class LLMPostDto {
  @IsString()
  @IsSafeString()
  id: string;

  @IsString()
  @IsSafeString()
  title: string;

  @IsString()
  @IsSafeString()
  content: string;

  @IsString()
  @IsSafeString()
  subreddit: string;

  @IsString()
  @IsSafeString()
  author: string;

  @IsUrl()
  url: string;

  @IsNumber()
  @Min(0)
  score: number;

  @IsDateString()
  created_at: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LLMCommentDto)
  comments: LLMCommentDto[];

  @IsBoolean()
  @IsOptional()
  extract_from_post?: boolean;
}

/**
 * DTO for LLM input structure with validation
 * Implements PRD Section 6.3.1 input validation
 */
export class LLMInputDto {
  @IsArray()
  @IsNonEmptyArray()
  @ValidateNested({ each: true })
  @Type(() => LLMPostDto)
  posts: LLMPostDto[];
}
