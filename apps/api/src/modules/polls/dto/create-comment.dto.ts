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

/** §9b reportContent — the comment-report reasons (mirrors PHOTO_REPORT_REASONS shape). */
export const COMMENT_REPORT_REASONS = [
  'spam',
  'harassment',
  'off_topic',
  'other',
] as const;

export class ReportCommentDto {
  @IsIn(COMMENT_REPORT_REASONS)
  reason!: (typeof COMMENT_REPORT_REASONS)[number];
}

export class ListCommentsQueryDto {
  /** `top` (by like count, default) or `new` (most recent). */
  @IsOptional()
  @IsIn(['top', 'new'])
  sort?: 'top' | 'new';
}
