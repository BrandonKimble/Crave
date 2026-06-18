import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;

  @IsOptional()
  @IsUUID()
  parentCommentId?: string;
}

export class EditCommentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body!: string;
}

export class ListCommentsQueryDto {
  /** `top` (by like count, default) or `new` (most recent). */
  @IsOptional()
  @IsIn(['top', 'new'])
  sort?: 'top' | 'new';
}
