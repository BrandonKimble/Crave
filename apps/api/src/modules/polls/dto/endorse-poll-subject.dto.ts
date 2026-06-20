import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PollLeaderboardSubjectType } from '@prisma/client';

/** Toggle a viewer's direct endorsement of a leaderboard candidate (tap-to-endorse). */
export class EndorsePollSubjectDto {
  @IsUUID()
  subjectId!: string;

  @IsOptional()
  @IsIn(Object.values(PollLeaderboardSubjectType))
  subjectType?: PollLeaderboardSubjectType;
}
