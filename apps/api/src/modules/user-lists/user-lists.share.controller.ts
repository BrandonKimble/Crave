import { Controller, Get, Param } from '@nestjs/common';
import { UserListsService } from './user-lists.service';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { RateLimitTier } from '../infrastructure/throttler/throttler.decorator';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('lists/share')
export class UserListsShareController {
  constructor(private readonly userListsService: UserListsService) {}

  // The slug is 72 bits of entropy, so it is not enumerable — but an
  // unauthenticated read that hits Postgres still needs a ceiling.
  @Get(':shareSlug')
  @RateLimitTier('publicRead')
  async getSharedList(@Param('shareSlug') shareSlug: string) {
    return this.userListsService.getSharedList(shareSlug);
  }
}
