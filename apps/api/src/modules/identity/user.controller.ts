import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Put,
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { UserService } from './user.service';
import { UserProfileDto } from './dto/user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateUserOnboardingDto } from './dto/update-user-onboarding.dto';
import { UsernameCheckDto } from './dto/username-check.dto';
import { UsernameClaimDto } from './dto/username-claim.dto';
import { UsernameSuggestDto } from './dto/username-suggest.dto';
import { UsernameService } from './username.service';
import { UserFollowService } from './user-follow.service';
import { UserBlockService } from './user-block.service';
import { UserReportService } from './user-report.service';
import { ReportUserDto } from './dto/report-user.dto';
import { ListUserFollowsDto } from './dto/list-user-follows.dto';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';

/** Paywall exemption is PER-METHOD here (class-level would silently exempt
 *  every future route — type-list disease in decorator form): self-service
 *  routes (me/onboarding/username) are what a never-subscribed user needs
 *  to reach payment; the SOCIAL GRAPH (follow endpoints) sits behind the
 *  wall like the rest of the product. */
@Controller('users')
@UseGuards(ClerkAuthGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly usernameService: UsernameService,
    private readonly userFollowService: UserFollowService,
    private readonly userBlockService: UserBlockService,
    private readonly userReportService: UserReportService,
  ) {}

  @AllowUnentitled()
  @Get('me')
  async getMe(@CurrentUser() user: User): Promise<UserProfileDto> {
    return this.userService.getProfile(user.userId);
  }

  @AllowUnentitled()
  @Patch('me')
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateUserProfileDto) {
    return this.userService.updateProfile(user.userId, dto);
  }

  @AllowUnentitled()
  @Put('me/onboarding')
  async updateOnboarding(
    @CurrentUser() user: User,
    @Body() dto: UpdateUserOnboardingDto,
  ): Promise<UserProfileDto> {
    return this.userService.updateOnboarding(user.userId, dto);
  }

  @AllowUnentitled()
  @Get('username/check')
  async checkUsername(
    @CurrentUser() user: User,
    @Query() dto: UsernameCheckDto,
  ) {
    return this.usernameService.checkAvailability(dto.username, user.userId);
  }

  @AllowUnentitled()
  @Post('username/claim')
  async claimUsername(
    @CurrentUser() user: User,
    @Body() dto: UsernameClaimDto,
  ) {
    return this.usernameService.claimUsername(user.userId, dto.username);
  }

  @AllowUnentitled()
  @Post('username/suggest')
  suggestUsername(@Body() dto: UsernameSuggestDto) {
    return {
      suggestions: this.usernameService.suggestUsernames(dto.username),
    };
  }

  /** W4 settings (§8.6 privacy): my block list — declared BEFORE the
   *  `:userId/*` param routes ('me' would otherwise hit the UUID pipe). */
  @Get('me/blocks')
  async listMyBlocks(@CurrentUser() user: User) {
    return this.userBlockService.listBlockedUsers(user.userId);
  }

  /** S-B pages (userProfile): the VIEWER's follow edge — pairs with the public
   *  GET :userId/profile (PublicUserController, which is unauthenticated and cannot
   *  carry viewer-scoped facts). Drives the Follow/Following button state. */
  @Get(':userId/follow')
  async getFollowEdge(
    @CurrentUser() user: User,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.userFollowService.getFollowEdge(user.userId, userId);
  }

  @Get(':userId/followers')
  async listFollowers(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListUserFollowsDto,
  ) {
    // §8.6: viewer-relative block filtering.
    return this.userFollowService.listFollowers(userId, {
      ...query,
      viewerUserId: user.userId,
    });
  }

  @Get(':userId/following')
  async listFollowing(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListUserFollowsDto,
  ) {
    return this.userFollowService.listFollowing(userId, {
      ...query,
      viewerUserId: user.userId,
    });
  }

  @Post(':userId/follow')
  async follow(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.userFollowService.followUser(user.userId, userId);
  }

  @Delete(':userId/follow')
  async unfollow(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.userFollowService.unfollowUser(user.userId, userId);
  }

  /** §8.6 blocking (Apple 1.2 UGC). Blocking also severs follow edges. */
  @Post(':userId/block')
  async block(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    const result = await this.userBlockService.blockUser(user.userId, userId);
    // Sever the social edges both ways (idempotent no-ops when absent).
    await this.userFollowService.unfollowUser(user.userId, userId);
    await this.userFollowService.unfollowUser(userId, user.userId);
    return result;
  }

  @Delete(':userId/block')
  async unblock(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.userBlockService.unblockUser(user.userId, userId);
  }

  /** §9b profileActions (Apple 1.2 UGC): report a user. Records only —
   *  human moderation reads the table; dedupe is a quiet no-op. */
  @Post(':userId/report')
  async report(
    @CurrentUser() user: User,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: ReportUserDto,
  ) {
    return this.userReportService.reportUser(user.userId, userId, dto.reason);
  }
}
