import { IsUUID } from 'class-validator';

export class CastPollVoteDto {
  @IsUUID()
  optionId!: string;
}
