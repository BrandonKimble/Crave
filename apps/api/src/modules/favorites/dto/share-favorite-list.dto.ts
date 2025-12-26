import { IsBoolean, IsOptional } from 'class-validator';

export class ShareFavoriteListDto {
  @IsOptional()
  @IsBoolean()
  rotate?: boolean;
}
