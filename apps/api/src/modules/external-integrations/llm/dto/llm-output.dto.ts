import { Type } from 'class-transformer';
import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  ValidateNested,
  IsUrl,
  IsDateString,
  IsBoolean,
  IsIn,
  Min,
} from 'class-validator';
import { IsSafeString } from '../../../../shared/pipes/custom-validators';

/**
 * DTO for LLM dish attribute with validation
 */
export class LLMDishAttributeDto {
  @IsString()
  @IsSafeString()
  attribute: string;

  @IsString()
  @IsIn(['selective', 'descriptive'])
  type: 'selective' | 'descriptive';
}

/**
 * DTO for LLM entity reference with validation
 */
export class LLMEntityRefDto {
  @IsOptional()
  @IsString()
  @IsSafeString()
  normalized_name?: string | null;

  @IsOptional()
  @IsString()
  @IsSafeString()
  original_text?: string | null;

  @IsString()
  @IsSafeString()
  temp_id: string;
}

/**
 * DTO for LLM source reference with validation
 */
export class LLMSourceDto {
  @IsString()
  @IsIn(['post', 'comment'])
  type: 'post' | 'comment';

  @IsString()
  @IsSafeString()
  id: string;

  @IsUrl()
  url: string;

  @IsNumber()
  @Min(0)
  upvotes: number;

  @IsDateString()
  created_at: string;
}

/**
 * DTO for LLM mention with validation
 */
export class LLMMentionDto {
  @IsString()
  @IsSafeString()
  temp_id: string;

  @ValidateNested()
  @Type(() => LLMEntityRefDto)
  restaurant: LLMEntityRefDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsSafeString({ each: true })
  restaurant_attributes?: string[] | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => LLMEntityRefDto)
  dish_or_category?: LLMEntityRefDto | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LLMDishAttributeDto)
  dish_attributes?: LLMDishAttributeDto[] | null;

  @IsBoolean()
  is_menu_item: boolean;

  @IsBoolean()
  general_praise: boolean;

  @ValidateNested()
  @Type(() => LLMSourceDto)
  source: LLMSourceDto;
}

/**
 * DTO for LLM output structure with validation
 * Implements PRD Section 6.3.2 output validation
 */
export class LLMOutputDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LLMMentionDto)
  mentions: LLMMentionDto[];
}
