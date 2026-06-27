import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum PollListState {
  active = 'active',
  scheduled = 'scheduled',
  closed = 'closed',
}

export enum PollListSort {
  // chronological (default) — newest launched first
  new = 'new',
  // total engagement — distinct users who voted or commented
  top = 'top',
  // decayed engagement velocity (heat) — recent momentum dominates
  trending = 'trending',
}

export enum PollListType {
  // everything (default)
  all = 'all',
  // ranked polls only (voting axis + bars) → PollMode.ranked
  polls = 'polls',
  // free-form discussions only (no bars) → PollMode.discussion
  discussions = 'discussions',
}

export enum PollListTime {
  // no time filter (default)
  all_time = 'all_time',
  // launched within the last 7 days
  this_week = 'this_week',
}

export class ListPollsQueryDto {
  @IsOptional()
  @IsString()
  marketKey?: string;

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
