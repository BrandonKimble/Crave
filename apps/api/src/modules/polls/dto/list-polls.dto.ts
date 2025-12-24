import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum PollListState {
  active = 'active',
  scheduled = 'scheduled',
  closed = 'closed',
}

export class ListPollsQueryDto {
  @IsOptional()
  @IsString()
  coverageKey?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsEnum(PollListState)
  state?: PollListState;
}
