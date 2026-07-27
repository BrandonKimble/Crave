import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { UserListsService } from './user-lists.service';
import { ListUserListsDto } from './dto/list-user-lists.dto';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { OptionalClerkAuthGuard } from '../identity/auth/optional-clerk-auth.guard';
import { UserBlockService } from '../identity/user-block.service';
import { CurrentUser } from '../../shared';

// Exempt from the app-wide paywall (see AllowUnentitled docs for the why).
@AllowUnentitled()
@Controller('users')
export class UserListsPublicController {
  constructor(
    private readonly userListsService: UserListsService,
    private readonly blocks: UserBlockService,
  ) {}

  /** The profile Lists view source (page-registry §8.12/§8.14/§8.16):
   *  PUBLIC lists only, owner pins first, then reverse-chronological; each
   *  summary carries `city` (majority market of its items) for the client's
   *  city-header grouping. Auth is OPTIONAL (public surface), but when a
   *  viewer is present a blocked pair sees nothing (§8.6). */
  @Get(':userId/lists')
  @UseGuards(OptionalClerkAuthGuard)
  async listPublicLists(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListUserListsDto,
    @CurrentUser() viewer?: User | null,
  ) {
    if (
      viewer?.userId &&
      (await this.blocks.isBlockedPair(viewer.userId, userId))
    ) {
      return [];
    }
    return this.userListsService.listPublicForUser(userId, query);
  }
}
