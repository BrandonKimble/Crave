import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateFavoriteListItemDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  /** Toolkit: null clears the note. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(512)
  note?: string | null;

  /** Toolkit: [] clears the tags. Normalized at write. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];
}
