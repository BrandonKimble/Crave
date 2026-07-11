import { Transform } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class RestaurantMentionsQueryDto {
  /** `top` (by comment score, default) or `new` (most recent). */
  @IsOptional()
  @IsIn(['top', 'new'])
  sort?: 'top' | 'new';

  /** Text search over this restaurant's mention comments. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Multi-select tag filter — CSV of entity ids (any-match). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @IsUUID(undefined, { each: true })
  tags?: string[];
}
