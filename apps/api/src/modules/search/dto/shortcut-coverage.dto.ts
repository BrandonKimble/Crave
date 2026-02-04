import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';

import { MapBoundsDto, QueryEntityGroupDto } from './search-query.dto';

export class ShortcutCoverageRequestDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => QueryEntityGroupDto)
  entities?: QueryEntityGroupDto;

  @ValidateNested()
  @Type(() => MapBoundsDto)
  bounds!: MapBoundsDto;
}
