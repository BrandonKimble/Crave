import { PollTopicType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateManualPollDto {
  @IsString()
  @MaxLength(500)
  question!: string;

  @IsEnum(PollTopicType)
  topicType!: PollTopicType;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  allowUserAdditions?: boolean;

  @IsOptional()
  @IsBoolean()
  notifySubscribers?: boolean;

  @IsOptional()
  @IsUUID()
  targetDishId?: string;

  @IsOptional()
  @IsUUID()
  targetRestaurantId?: string;
}
