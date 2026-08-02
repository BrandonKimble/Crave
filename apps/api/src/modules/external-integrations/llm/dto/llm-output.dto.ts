import { Type } from 'class-transformer';
import {
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { IsSafeString } from '../../../../shared/pipes/custom-validators';

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
  restaurant: string;

  // Enhanced food fields for compound term processing
  @IsOptional()
  @IsString()
  @IsSafeString()
  food?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsSafeString({ each: true })
  food_categories?: string[] | null;

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
  food_attributes?: string[] | null;

  // Core processing fields (VITAL)
  @IsBoolean()
  general_praise: boolean;

  @IsString()
  @IsSafeString()
  source_id: string;
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
