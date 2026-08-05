import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import type { User } from '@prisma/client';
import { CurrentUser } from '../../shared';
import { ClerkAuthGuard } from '../identity/auth/clerk-auth.guard';
import { AllowUnentitled } from '../entitlements/entitlement-enforcement.interceptor';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UnregisterDeviceDto } from './dto/unregister-device.dto';
import { NotificationDeviceService } from './notification-device.service';
import { UserNotificationFeedService } from './user-notification-feed.service';
import { NoSignal } from '../signals/records-signal.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly deviceService: NotificationDeviceService,
    private readonly feedService: UserNotificationFeedService,
  ) {}

  // RT-15 (red-team 2026-07-10): register is AUTHED and the binding derives from the
  // session — a client-supplied userId let any caller bind a victim's userId to an
  // attacker-controlled push token. Unregister is authed and owner-scoped too
  // as of 2026-08-01 (see below).
  @AllowUnentitled()
  @UseGuards(ClerkAuthGuard)
  @Post('devices/register')
  // D36/F645: this route escaped the ledger requirement for months because
  // the audit exempted @AllowUnentitled (a PAYWALL exemption) rather than
  // asking whether a known person acts here. They do — and the honest answer
  // is that a push-token binding is device plumbing, not demand for a place.
  @NoSignal('device/push plumbing; not demand for a subject')
  async registerDevice(
    @CurrentUser() user: User,
    @Body() dto: RegisterDeviceDto,
  ) {
    await this.deviceService.registerDevice(dto, user.userId);
    return { status: 'ok' };
  }

  // AUTHENTICATED + OWNER-SCOPED (audit 2026-08-01). This was an
  // unauthenticated, unthrottled DESTRUCTIVE write: anyone holding (or
  // guessing) a push token could delete that device row. The register side
  // was hardened; unregister was left as capability-by-token, and push
  // tokens are not treated as secrets anywhere else in this codebase.
  @Post('devices/unregister')
  @NoSignal('device/push plumbing; not demand for a subject')
  // Unentitled too: logging out must never be gated on a subscription.
  @AllowUnentitled()
  @UseGuards(ClerkAuthGuard)
  async unregisterDevice(
    @CurrentUser() user: User,
    @Body() dto: UnregisterDeviceDto,
  ) {
    await this.deviceService.unregisterDevice(dto.token, user.userId);
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
  // Marking one's own notification feed read is a UI-state write about US,
  // not an act on a subject.
  @NoSignal('own notification-feed read state; not demand for a subject')
  async markFeedRead(@CurrentUser() user: User) {
    return this.feedService.markAllRead(user.userId);
  }
}
