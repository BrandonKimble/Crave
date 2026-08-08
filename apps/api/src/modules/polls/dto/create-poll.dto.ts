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
  IsLatitude,
  IsLongitude,
} from 'class-validator';
import { PollTopicType } from '@prisma/client';

class CoordinateDto {
  // Abuse audit 2026-08-01: bare @IsNumber accepted lat 1e308 / lng -99999,
  // which flowed into ST_MakeEnvelope and became the world-envelope seq scan
  // on an UNAUTHENTICATED endpoint. Every other geo DTO in the codebase uses
  // the range validators; these three did not.
  @IsLatitude()
  lat!: number;

  @IsLongitude()
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
  @ValidateNested()
  @Type(() => BoundsDto)
  bounds?: BoundsDto;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  // User-chosen close window in days (§5). Clamped server-side to [3,14] (default 7);
  // app/seeded polls omit it and use the global window.
  @IsOptional()
  @IsNumber()
  closeWindowDays?: number;

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
}
