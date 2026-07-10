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
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListUserFollowsDto,
  ) {
    return this.userFollowService.listFollowers(userId, query);
  }

  @Get(':userId/following')
  async listFollowing(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: ListUserFollowsDto,
  ) {
    return this.userFollowService.listFollowing(userId, query);
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
}
