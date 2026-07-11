import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { UserService } from './user.service';
import { UserBlockService } from './user-block.service';
import { OptionalClerkAuthGuard } from './auth/optional-clerk-auth.guard';
import { PublicUserProfileDto } from './dto/user-profile.dto';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { CurrentUser } from '../../shared';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('users')
export class PublicUserController {
  constructor(
    private readonly userService: UserService,
    private readonly blocks: UserBlockService,
  ) {}

  /** §8.6 enforcement point: auth is OPTIONAL (public surface — anonymous
   *  reads get the full public payload unchanged), but an AUTHED viewer in a
   *  blocked pair (either direction) gets the same shape with a minimal
   *  payload + `unavailable: true`. Not a 403 — the client already renders
   *  the unavailable body from edge flags; the profile read itself is
   *  simply made honest so blocked data never leaks. */
  @Get(':userId/profile')
  @UseGuards(OptionalClerkAuthGuard)
  async getPublicProfile(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() viewer?: User | null,
  ): Promise<PublicUserProfileDto> {
    const profile = await this.userService.getPublicProfile(userId);
    if (
      viewer?.userId &&
      (await this.blocks.isBlockedPair(viewer.userId, userId))
    ) {
      return {
        userId: profile.userId,
        username: null,
        displayName: null,
        avatarUrl: null,
        stats: {
          pollsCreatedCount: 0,
          pollsContributedCount: 0,
          followersCount: 0,
          followingCount: 0,
          favoriteListsCount: 0,
          favoritesTotalCount: 0,
        },
        unavailable: true,
      };
    }
    return profile;
  }
}
