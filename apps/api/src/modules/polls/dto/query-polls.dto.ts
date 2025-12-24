import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { PollListState } from './list-polls.dto';

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
  coverageKey?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BoundsDto)
  bounds?: BoundsDto;

  @IsOptional()
  @IsEnum(PollListState)
  state?: PollListState;
}
