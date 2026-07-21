import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PollState } from '@prisma/client';

export enum UserPollActivity {
  created = 'created',
  commented = 'commented',
  participated = 'participated',
}

export class ListUserPollsDto {
  @IsOptional()
  @IsEnum(UserPollActivity)
  activity?: UserPollActivity;

  @IsOptional()
  @IsEnum(PollState)
  state?: PollState;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
