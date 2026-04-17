import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import { MapBoundsDto, QueryEntityGroupDto } from './search-query.dto';

export class ShortcutCoverageRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => QueryEntityGroupDto)
  entities?: QueryEntityGroupDto;

  @ValidateNested()
  @Type(() => MapBoundsDto)
  bounds!: MapBoundsDto;

  @IsOptional()
  @IsBoolean()
  includeTopDish?: boolean;

  @IsOptional()
  @IsString()
  marketKey?: string;
}
