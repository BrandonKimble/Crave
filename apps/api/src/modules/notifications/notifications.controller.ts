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

  // RT-15 (red-team 2026-07-10): register is AUTHED and the binding derives from the
  // session — a client-supplied userId let any caller bind a victim's userId to an
  // attacker-controlled push token. Unregister stays capability-by-token.
  @AllowUnentitled()
  @UseGuards(ClerkAuthGuard)
  @Post('devices/register')
  async registerDevice(
    @CurrentUser() user: User,
    @Body() dto: RegisterDeviceDto,
  ) {
    await this.deviceService.registerDevice({ ...dto, userId: user.userId });
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
    // RT-9: NaN/negative pagination params reached Prisma as skip/take (500s).
    const parsePage = (
      raw: string | undefined,
      max: number,
    ): number | undefined => {
      if (raw == null) return undefined;
      const value = Number(raw);
      return Number.isInteger(value) && value >= 0 && value <= max
        ? value
        : undefined;
    };
    return this.feedService.listFeed(user.userId, {
      offset: parsePage(offset, 100000),
      limit: parsePage(limit, 100),
    });
  }

  @AllowUnentitled()
  @UseGuards(ClerkAuthGuard)
  @Post('feed/read')
  async markFeedRead(@CurrentUser() user: User) {
    return this.feedService.markAllRead(user.userId);
  }
}
