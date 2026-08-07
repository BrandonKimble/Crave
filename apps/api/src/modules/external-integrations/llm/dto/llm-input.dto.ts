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

  // null = author unobserved (F4906); @IsOptional lets null pass validation.
  @IsString()
  @IsSafeString()
  @IsOptional()
  author: string | null;

  @IsNumber()
  @Min(0)
  score: number;

  // null = creation time unknown (F4905); @IsOptional lets null pass.
  @IsDateString()
  @IsOptional()
  created_at: string | null;

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

  // null = author unobserved (F4906); @IsOptional lets null pass validation.
  @IsString()
  @IsSafeString()
  @IsOptional()
  author: string | null;

  @IsUrl()
  url: string;

  @IsNumber()
  @Min(0)
  score: number;

  // null = creation time unknown (F4905); @IsOptional lets null pass.
  @IsDateString()
  @IsOptional()
  created_at: string | null;

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
