import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { NotificationDeviceService } from './notification-device.service';
import { UserNotificationFeedService } from './user-notification-feed.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly deviceService: NotificationDeviceService,
    private readonly feedService: UserNotificationFeedService,
  ) {}

  @Post('devices/register')
  async registerDevice(@Body() dto: RegisterDeviceDto) {
    await this.deviceService.registerDevice(dto);
    return { status: 'ok' };
  }

  @Post('devices/unregister')
  async unregisterDevice(@Body() dto: UnregisterDeviceDto) {
    await this.deviceService.unregisterDevice(dto.token);
    return { status: 'ok' };
  }

  // ── The in-app feed (the notifications PAGE; exempt from the paywall like profile) ──

  @AllowUnentitled()
  @UseGuards(ClerkAuthGuard)
  @Get('feed')
  async getFeed(
    @CurrentUser() user: User,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.feedService.listFeed(user.userId, {
      offset: offset ? Number(offset) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @AllowUnentitled()
  @UseGuards(ClerkAuthGuard)
  @Post('feed/read')
  async markFeedRead(@CurrentUser() user: User) {
    return this.feedService.markAllRead(user.userId);
  }
}
