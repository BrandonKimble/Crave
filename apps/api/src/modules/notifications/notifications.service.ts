import { Injectable } from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { NotificationDeviceService } from './notification-device.service';

export interface PollReleaseNotificationPayload {
  city?: string | null;
  pollIds: string[];
  scheduledFor?: Date | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger: LoggerService;

  constructor(
    loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly devices: NotificationDeviceService,
  ) {
    this.logger = loggerService.setContext('NotificationsService');
  }

  async queuePollReleaseNotification(
    payload: PollReleaseNotificationPayload,
  ): Promise<void> {
    const devices = await this.devices.findDevices({
      city: payload.city ?? undefined,
    });
    if (!devices.length) {
      this.logger.warn('No devices registered for poll release notification', {
        city: payload.city,
      });
      return;
    }

    const scheduledFor =
      payload.scheduledFor && payload.scheduledFor > new Date()
        ? payload.scheduledFor
        : new Date();
    const status =
      scheduledFor.getTime() > Date.now()
        ? $Enums.NotificationStatus.scheduled
        : $Enums.NotificationStatus.pending;

    const payloadData: Prisma.JsonObject = {
      city: payload.city ?? null,
      pollIds: payload.pollIds,
    };

    const data = devices.map((device) => ({
      type: $Enums.NotificationType.poll_release,
      status,
      payload: payloadData,
      scheduledFor,
      deviceId: device.deviceId,
    }));

    await this.prisma.notification.createMany({ data });

    this.logger.info('Queued poll release notifications', {
      city: payload.city,
      pollCount: payload.pollIds.length,
      deviceCount: devices.length,
    });
  }
}
