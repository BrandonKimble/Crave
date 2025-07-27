import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
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
  comment_id: string;

  @IsString()
  @IsSafeString()
  content: string;

  @IsString()
  @IsSafeString()
  author: string;

  @IsNumber()
  @Min(0)
  upvotes: number;

  @IsDateString()
  created_at: string;

  @IsOptional()
  @IsString()
  @IsSafeString()
  parent_id?: string | null;

  @IsUrl()
  url: string;
}

/**
 * DTO for LLM post input with validation
 */
export class LLMPostDto {
  @IsString()
  @IsSafeString()
  post_id: string;

  @IsString()
  @IsSafeString()
  title: string;

  @IsString()
  @IsSafeString()
  content: string;

  @IsString()
  @IsSafeString()
  subreddit: string;

  @IsUrl()
  url: string;

  @IsNumber()
  @Min(0)
  upvotes: number;

  @IsDateString()
  created_at: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LLMCommentDto)
  comments: LLMCommentDto[];
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
