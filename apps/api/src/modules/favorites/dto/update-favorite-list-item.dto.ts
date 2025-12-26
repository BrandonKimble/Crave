import { IsInt, Min } from 'class-validator';

export class UpdateFavoriteListItemDto {
  @IsInt()
  @Min(0)
  position!: number;
}
