import { Controller, Get, Param } from '@nestjs/common';
import { UserListsService } from './user-lists.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('favorites/lists/share')
export class UserListsShareController {
  constructor(private readonly userListsService: UserListsService) {}

  @Get(':shareSlug')
  async getSharedList(@Param('shareSlug') shareSlug: string) {
    return this.userListsService.getSharedList(shareSlug);
  }
}
