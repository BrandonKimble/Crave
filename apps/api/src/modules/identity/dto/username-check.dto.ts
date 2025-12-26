import { IsString, MinLength } from 'class-validator';

export class UsernameCheckDto {
  @IsString()
  @MinLength(1)
  username!: string;
}
