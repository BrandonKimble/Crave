import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Notification, NotificationDevice, $Enums } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * THE QUEUE IS NOW ACTUALLY A QUEUE (D36 / F640+F641).
 *
 * NotificationsService called this row "the durable dispatch queue … sends
 * pending rows WITH RETRY". It did not: `markFailed` wrote a TERMINAL
 * `failed`, nothing anywhere moved a row back, `attempts` was incremented and
 * read by no code in the repo, and a process death between pending→`sending`
 * and the fetch stranded the row in `sending` FOREVER (nothing selected that
 * state). Two one-way drains to limbo out of a three-state machine — one
 * transient Expo blip permanently lost a user's push.
 *
 * The claim is now true, in the smallest honest way:
 *   - a `failed` row is retried while `attempts < MAX_DELIVERY_ATTEMPTS`,
 *     no sooner than RETRY_BACKOFF_MS after its last try (`updatedAt`);
 *   - a `sending` row older than the same window is RECLAIMED — the lease
 *     expired, so the process that took it is gone;
 *   - a row that exhausts its attempts stays `failed` with `lastError`, which
 *     is a terminal state that was REACHED rather than one that was the only
 *     door.
 * `attempts` is therefore read, not just written, and the bound is what makes
 * the retry finite instead of a poison-pill loop.
 */
const MAX_DELIVERY_ATTEMPTS = 3;

/** Also the `sending` lease: a row held longer than this lost its owner. */
const RETRY_BACKOFF_MS = 5 * 60 * 1000;

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
    const retryCutoff = new Date(now.getTime() - RETRY_BACKOFF_MS);
    const pending = await this.prisma.notification.findMany({
      where: {
        OR: [
          {
            status: {
              in: [
                $Enums.NotificationStatus.pending,
                $Enums.NotificationStatus.scheduled,
              ],
            },
            OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
          },
          {
            // RETRY + `sending` RECLAIM (F640/F641). `updatedAt` is stamped by
            // both the lease take and markFailed, so it is the last-try clock
            // for either state.
            status: {
              in: [
                $Enums.NotificationStatus.failed,
                $Enums.NotificationStatus.sending,
              ],
            },
            attempts: { lt: MAX_DELIVERY_ATTEMPTS },
            updatedAt: { lte: retryCutoff },
          },
        ],
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
      // PERMANENT: no retry can conjure a token. Terminal by exhausting the
      // attempt budget, so the retry predicate needs no second vocabulary.
      await this.markFailed(notification.notificationId, 'missing_token', {
        permanent: true,
      });
      return;
    }

    const message = this.buildMessage(notification);
    if (!message) {
      // PERMANENT: buildMessage is a pure function of the row (F644) — a
      // retry produces the same null.
      await this.markFailed(notification.notificationId, 'invalid_payload', {
        permanent: true,
      });
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
        placeId?: string | null;
        placeName?: string | null;
        pollIds?: string[];
      } | null;
      const placeLabel = payload?.placeName ?? null;
      return {
        to: notification.device.expoPushToken,
        sound: 'default',
        title: placeLabel
          ? `📊 ${placeLabel} polls are live`
          : '📊 Weekly polls are live',
        body: 'Vote on this week’s dishes and see what’s trending now.',
        data: {
          type: 'poll_release',
          pollIds: payload?.pollIds ?? [],
          placeId: payload?.placeId ?? null,
          placeName: placeLabel,
        },
      };
    }

    return null;
  }

  /**
   * `failed` is RETRYABLE until the attempt bound is spent (F640) — the row
   * carries its own attempt count, so this method needs no memory. It reads
   * the count it is about to make terminal so the log says which it was.
   */
  private async markFailed(
    notificationId: string,
    reason: string,
    opts?: { permanent?: boolean },
  ) {
    const row = await this.prisma.notification.update({
      where: { notificationId },
      data: {
        status: $Enums.NotificationStatus.failed,
        lastError: reason,
        ...(opts?.permanent ? { attempts: MAX_DELIVERY_ATTEMPTS } : {}),
      },
      select: { attempts: true },
    });
    const terminal = row.attempts >= MAX_DELIVERY_ATTEMPTS;
    this.logger.warn(
      terminal
        ? 'Notification delivery failed — attempts exhausted, giving up'
        : 'Notification delivery failed — will retry',
      { notificationId, reason, attempts: row.attempts, terminal },
    );
  }

  /**
   * EXPO'S OWN DOCUMENTED SHAPES, INCLUDING THE ARRAY (D36/F642).
   *
   * `isRecord` used to accept an ARRAY (`typeof [] === 'object'`), so the
   * documented BATCH response — `{ data: [ { status: 'error', … } ] }` —
   * parsed to `{ status: undefined }` and, with a 200, was recorded as SENT.
   * A failure detector that reads success on the vendor's own error payload is
   * an always-green instrument. Arrays are now rejected AS RECORDS and handled
   * explicitly: any receipt reporting `error` fails the send.
   */
  private parseExpoResponse(payload: unknown): {
    status?: string;
    message?: string;
    errorMessage?: string;
  } {
    if (!this.isRecord(payload)) {
      return {};
    }

    const dataRaw = payload['data'];
    // The batch form: data is an ARRAY of per-message receipts. One error in
    // it is an error for this send (we post one message per request).
    const receipts = this.asArray(dataRaw);
    if (receipts.length > 0) {
      const errored = receipts.find(
        (receipt) =>
          this.isRecord(receipt) &&
          this.getStringField(receipt, 'status') === 'error',
      );
      if (this.isRecord(errored)) {
        return {
          status: 'error',
          message:
            this.getStringField(errored, 'message') ??
            this.getStringField(errored, 'details'),
        };
      }
      const first = receipts[0];
      return {
        status: this.isRecord(first)
          ? this.getStringField(first, 'status')
          : undefined,
      };
    }
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

  /** An ARRAY is not a record — the F642 defect in one line. */
  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
