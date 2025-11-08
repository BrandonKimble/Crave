import { IsOptional, IsUrl } from 'class-validator';

export class CreatePortalSessionDto {
  @IsUrl()
  @IsOptional()
  returnUrl?: string;
}
