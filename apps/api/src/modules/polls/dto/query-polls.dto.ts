import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  PollListSort,
  PollListState,
  PollListTime,
  PollListType,
} from './list-polls.dto';

class CoordinateDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;
}

class BoundsDto {
  @IsObject()
  @ValidateNested()
  @Type(() => CoordinateDto)
  northEast!: CoordinateDto;

  @IsObject()
  @ValidateNested()
  @Type(() => CoordinateDto)
  southWest!: CoordinateDto;
}

export class QueryPollsDto {
  @IsOptional()
  @IsString()
  marketKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BoundsDto)
  bounds?: BoundsDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoordinateDto)
  userLocation?: CoordinateDto;

  @IsOptional()
  @IsEnum(PollListState)
  state?: PollListState;

  @IsOptional()
  @IsEnum(PollListSort)
  sort?: PollListSort;

  @IsOptional()
  @IsEnum(PollListType)
  type?: PollListType;

  @IsOptional()
  @IsEnum(PollListTime)
  time?: PollListTime;
}
