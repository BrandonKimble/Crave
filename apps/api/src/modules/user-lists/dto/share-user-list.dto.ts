import { IsBoolean, IsOptional } from 'class-validator';

export class ShareUserListDto {
  @IsOptional()
  @IsBoolean()
  rotate?: boolean;
}
