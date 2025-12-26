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
  UseGuards,
} from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { UserService } from './user.service';
import { UserProfileDto, UserEntitlementDto } from './dto/user-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UsernameCheckDto } from './dto/username-check.dto';
import { UsernameClaimDto } from './dto/username-claim.dto';
import { UsernameSuggestDto } from './dto/username-suggest.dto';
import { UsernameService } from './username.service';
import { UserFollowService } from './user-follow.service';
import { ListUserFollowsDto } from './dto/list-user-follows.dto';

@Controller('users')
@UseGuards(ClerkAuthGuard)
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly usernameService: UsernameService,
    private readonly userFollowService: UserFollowService,
  ) {}

  @Get('me')
  async getMe(@CurrentUser() user: User): Promise<UserProfileDto> {
    return this.userService.getProfile(user.userId);
  }

  @Patch('me')
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateUserProfileDto) {
    return this.userService.updateProfile(user.userId, dto);
  }

  @Get('me/entitlements')
  async getEntitlements(
    @CurrentUser() user: User,
  ): Promise<UserEntitlementDto[]> {
    return this.userService.listEntitlements(user.userId);
  }

  @Get('username/check')
  async checkUsername(
    @CurrentUser() user: User,
    @Query() dto: UsernameCheckDto,
  ) {
    return this.usernameService.checkAvailability(dto.username, user.userId);
  }

  @Post('username/claim')
  async claimUsername(
    @CurrentUser() user: User,
    @Body() dto: UsernameClaimDto,
  ) {
    return this.usernameService.claimUsername(user.userId, dto.username);
  }

  @Post('username/suggest')
  suggestUsername(@Body() dto: UsernameSuggestDto) {
    return {
      suggestions: this.usernameService.suggestUsernames(dto.username),
    };
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
