import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PollTopicType } from '@prisma/client';

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

export class CreatePollDto {
  /**
   * Free-text poll question ("best breakfast sandwich in LES"). When present, the
   * poll-subject prompt infers mode + axis (Phase 3B); `topicType`/target fields are
   * ignored. Omit it to use the structured path (topicType + target).
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(280)
  question?: string;

  @IsOptional()
  @IsEnum(PollTopicType)
  topicType?: PollTopicType;

  @IsOptional()
  @IsString()
  marketKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BoundsDto)
  bounds?: BoundsDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsUUID()
  targetDishId?: string;

  @IsOptional()
  @IsUUID()
  targetRestaurantId?: string;

  @IsOptional()
  @IsUUID()
  targetFoodAttributeId?: string;

  @IsOptional()
  @IsUUID()
  targetRestaurantAttributeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  targetDishName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  targetRestaurantName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  targetFoodAttributeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  targetRestaurantAttributeName?: string;

  @IsOptional()
  @IsString()
  sessionToken?: string;
}
