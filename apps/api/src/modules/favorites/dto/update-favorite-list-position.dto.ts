import { IsInt, Min } from 'class-validator';

export class UpdateFavoriteListPositionDto {
  @IsInt()
  @Min(0)
  position!: number;
}
