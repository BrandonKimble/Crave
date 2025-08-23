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
  @IsString()
  @IsSafeString()
  name: string;

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
 * DTO for LLM flat mention structure with validation
 * Flattened structure for better LLM performance while preserving ALL properties
 */
export class LLMMentionDto {
  @IsString()
  @IsSafeString()
  temp_id: string;

  // Restaurant fields (REQUIRED)
  @IsString()
  @IsSafeString()
  restaurant_name: string;

  @IsString()
  @IsSafeString()
  restaurant_temp_id: string;

  // Enhanced food fields for compound term processing
  @IsOptional()
  @IsString()
  @IsSafeString()
  food_name?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsSafeString({ each: true })
  food_categories?: string[] | null;

  @IsOptional()
  @IsString()
  @IsSafeString()
  food_temp_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_menu_item?: boolean | null;

  // Attributes (simplified - all non-food descriptors)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsSafeString({ each: true })
  restaurant_attributes?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsSafeString({ each: true })
  food_attributes_selective?: string[] | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsSafeString({ each: true })
  food_attributes_descriptive?: string[] | null;

  // Core processing fields (VITAL)
  @IsBoolean()
  general_praise: boolean;

  // Source tracking with enhanced fields
  @IsString()
  @IsIn(['post', 'comment'])
  source_type: 'post' | 'comment';

  @IsString()
  @IsSafeString()
  source_id: string;

  @IsString()
  @IsSafeString()
  source_content: string;

  @IsNumber()
  @Min(0)
  source_ups: number;

  @IsString()
  @IsSafeString()
  source_url: string;

  @IsDateString()
  source_created_at: string;
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
