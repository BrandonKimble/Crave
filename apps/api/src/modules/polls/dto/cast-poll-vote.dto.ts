import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CastPollVoteDto {
  @IsUUID()
  optionId!: string;

  @IsString()
  @IsNotEmpty()
  userId!: string;
}
