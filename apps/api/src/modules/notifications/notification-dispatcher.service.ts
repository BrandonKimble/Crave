import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Notification, NotificationDevice, $Enums } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data?: Record<string, unknown>;
}

@Injectable()
export class NotificationDispatcherService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async dispatchPending(): Promise<void> {
    const now = new Date();
    const pending = await this.prisma.notification.findMany({
      where: {
        status: {
          in: [
            $Enums.NotificationStatus.pending,
            $Enums.NotificationStatus.scheduled,
          ],
        },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
      },
      include: { device: true },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });

    for (const notification of pending) {
      await this.dispatchNotification(notification);
    }
  }

  private async dispatchNotification(
    notification: Notification & { device: NotificationDevice | null },
  ): Promise<void> {
    if (!notification.device?.expoPushToken) {
      await this.markFailed(notification.notificationId, 'missing_token');
      return;
    }

    const message = this.buildMessage(notification);
    if (!message) {
      await this.markFailed(notification.notificationId, 'invalid_payload');
      return;
    }

    try {
      await this.prisma.notification.update({
        where: { notificationId: notification.notificationId },
        data: {
          status: $Enums.NotificationStatus.sending,
          attempts: { increment: 1 },
        },
      });

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      const payloadRaw: unknown = await response.json();
      const payload = this.parseExpoResponse(payloadRaw);
      if (!response.ok || payload.status === 'error') {
        const errorMessage =
          payload.message ?? payload.errorMessage ?? response.statusText;
        throw new Error(errorMessage);
      }

      await this.prisma.notification.update({
        where: { notificationId: notification.notificationId },
        data: {
          status: $Enums.NotificationStatus.sent,
          sentAt: new Date(),
          lastError: null,
        },
      });
    } catch (error) {
      await this.markFailed(
        notification.notificationId,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private buildMessage(
    notification: Notification & { device: NotificationDevice | null },
  ): PushPayload | null {
    if (!notification.device?.expoPushToken) {
      return null;
    }

    if (notification.type === 'poll_release') {
      const payload = notification.payload as {
        city?: string | null;
        pollIds?: string[];
      } | null;
      const city = payload?.city;
      return {
        to: notification.device.expoPushToken,
        sound: 'default',
        title: city ? `📊 ${city} polls are live` : '📊 Weekly polls are live',
        body: 'Vote on this week’s dishes and see what’s trending now.',
        data: {
          type: 'poll_release',
          pollIds: payload?.pollIds ?? [],
          city,
        },
      };
    }

    return null;
  }

  private async markFailed(notificationId: string, reason: string) {
    await this.prisma.notification.update({
      where: { notificationId },
      data: {
        status: $Enums.NotificationStatus.failed,
        lastError: reason,
      },
    });
    this.logger.warn('Notification delivery failed', {
      notificationId,
      reason,
    });
  }

  private parseExpoResponse(payload: unknown): {
    status?: string;
    message?: string;
    errorMessage?: string;
  } {
    if (!this.isRecord(payload)) {
      return {};
    }

    const dataRaw = payload['data'];
    const data = this.isRecord(dataRaw) ? dataRaw : undefined;
    const status = data ? this.getStringField(data, 'status') : undefined;
    const message = data ? this.getStringField(data, 'message') : undefined;

    const errorsRaw = this.asArray(payload['errors']);
    let errorMessage: string | undefined;
    if (errorsRaw.length > 0) {
      const firstError = errorsRaw[0];
      if (this.isRecord(firstError)) {
        errorMessage = this.getStringField(firstError, 'message');
      }
    }

    return {
      status,
      message,
      errorMessage,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private getStringField(
    record: Record<string, unknown>,
    field: string,
  ): string | undefined {
    const value = record[field];
    return typeof value === 'string' ? value : undefined;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }
}
