import { IsString, MinLength } from 'class-validator';

export class UsernameSuggestDto {
  @IsString()
  @MinLength(1)
  username!: string;
}
