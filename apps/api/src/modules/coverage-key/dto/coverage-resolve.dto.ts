import { Type } from 'class-transformer';
import {
  IsNumber,
  IsObject,
  IsOptional,
  ValidateNested,
} from 'class-validator';

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

export class CoverageResolveDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BoundsDto)
  bounds?: BoundsDto;
}
