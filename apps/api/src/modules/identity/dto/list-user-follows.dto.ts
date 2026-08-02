import { IsInt, IsOptional, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ListUserFollowsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // Unbounded page size is a memory/DoS vector — every other paginated
  // DTO in this codebase already caps (audit 2026-08-01).
  @Max(50)
  limit?: number;
}
