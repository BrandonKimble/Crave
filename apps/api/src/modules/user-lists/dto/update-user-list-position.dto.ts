import { IsInt, Min } from 'class-validator';

export class UpdateUserListPositionDto {
  @IsInt()
  @Min(0)
  position!: number;
}
