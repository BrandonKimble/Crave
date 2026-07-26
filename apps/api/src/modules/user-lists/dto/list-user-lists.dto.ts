import { UserListType, UserListVisibility } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListUserListsDto {
  @IsOptional()
  @IsEnum(UserListType)
  listType?: UserListType;

  @IsOptional()
  @IsEnum(UserListVisibility)
  visibility?: UserListVisibility;
}
