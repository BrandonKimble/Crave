import { IsString, MinLength } from 'class-validator';

export class UsernameClaimDto {
  @IsString()
  @MinLength(1)
  username!: string;
}
