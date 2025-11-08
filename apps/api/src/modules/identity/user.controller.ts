import { Controller, Get, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from './auth/clerk-auth.guard';
import { UserService } from './user.service';
import { UserProfileDto, UserEntitlementDto } from './dto/user-profile.dto';

@Controller('users')
@UseGuards(ClerkAuthGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getMe(@CurrentUser() user: User): Promise<UserProfileDto> {
    return this.userService.getProfile(user.userId);
  }

  @Get('me/entitlements')
  async getEntitlements(
    @CurrentUser() user: User,
  ): Promise<UserEntitlementDto[]> {
    return this.userService.listEntitlements(user.userId);
  }
}
