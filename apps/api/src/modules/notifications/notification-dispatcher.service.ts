import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Notification, NotificationDevice, $Enums } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import {
  CompletionWorkTimerHandle,
  startCompletionWorkTimer,
} from '../../shared/completion-work-timer';

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

/**
 * F643: Expo's push endpoint IS a batch API — it documents accepting up to
 * 100 messages per POST. One HTTP request per device, awaited serially, was
 * modeling "send a notification" when the vendor models "send a batch": a
 * release to 5k devices took ~50 minutes to drain sequentially. Owner cap,
 * matching Expo's documented limit exactly (not a tuning guess).
 */
const EXPO_BATCH_SIZE = 100;

interface PushPayload {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data?: Record<string, unknown>;
}

/** Cadence — unchanged from the retired @Cron(EVERY_MINUTE). */
const DISPATCH_INTERVAL_MS = 60 * 1000;

@Injectable()
export class NotificationDispatcherService
  implements OnModuleInit, OnModuleDestroy
{
  /**
   * THE DISPATCHER IS A SELF-OWNED setInterval, NOT AN @Cron (2026-08-31).
   *
   * THE LAW: CRONS_ENABLED means "do not START new discretionary work
   * unattended" — it exists so an environment holding dev vendor keys cannot
   * SPEND. This loop spends nothing: Expo's push service is free (no key, no
   * meter, no api_usage_ledger entry — see sendBatch below, an unauthenticated
   * POST to exp.host), so there is no risk it was ever protecting against.
   *
   * What it IS, is the ONLY path in the codebase that moves a notification to
   * `sent`, and the only owner of retry + `sending`-lease reclaim. Under
   * @Cron, ScheduleModule is registered only when isSchedulerRuntime() —
   * false whenever CRONS_ENABLED is off — so every notification a user had
   * already earned sat pending forever with nothing saying so. Finishing
   * work already queued is not discretionary.
   *
   * Worker runtime (isWorkerRuntime — the worker owns background work; the
   * api process must not race it for the same leases), own explicit
   * off-switch (NOTIFICATION_DISPATCH_ENABLED=false), unref()'d so scripts
   * still exit, cleared on shutdown. Same shape as
   * gemini-batch.service.ts's poller.
   */
  private dispatchTimer: CompletionWorkTimerHandle | null = null;
  private dispatchInFlight = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    this.dispatchTimer = startCompletionWorkTimer({
      intervalMs: DISPATCH_INTERVAL_MS,
      offSwitchEnv: 'NOTIFICATION_DISPATCH_ENABLED',
      run: () => this.runDispatchPass(),
    });
  }

  onModuleDestroy(): void {
    this.dispatchTimer?.stop();
    this.dispatchTimer = null;
  }

  /** Interval/boot entry point: never throws, never stacks (a slow Expo
   *  batch must not have a second pass claiming the same leases). */
  private async runDispatchPass(): Promise<void> {
    if (this.dispatchInFlight) return;
    this.dispatchInFlight = true;
    try {
      await this.dispatchPending();
    } catch (error) {
      this.logger.error('Notification dispatch pass failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.dispatchInFlight = false;
    }
  }

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

    // Permanent, pre-send failures (no token / unpushable type) never touch
    // Expo — sort them out first so only genuinely sendable rows are batched.
    const sendable: Array<{
      notification: Notification & { device: NotificationDevice | null };
      message: PushPayload;
    }> = [];
    for (const notification of pending) {
      if (!notification.device?.expoPushToken) {
        // PERMANENT: no retry can conjure a token. Terminal by exhausting
        // the attempt budget, so the retry predicate needs no second
        // vocabulary.
        await this.markFailed(notification.notificationId, 'missing_token', {
          permanent: true,
        });
        continue;
      }
      const message = this.buildMessage(notification);
      if (!message) {
        // PERMANENT: buildMessage is a pure function of the row (F644) — a
        // retry produces the same null.
        await this.markFailed(notification.notificationId, 'invalid_payload', {
          permanent: true,
        });
        continue;
      }
      sendable.push({ notification, message });
    }

    for (let i = 0; i < sendable.length; i += EXPO_BATCH_SIZE) {
      await this.dispatchBatch(sendable.slice(i, i + EXPO_BATCH_SIZE));
    }
  }

  /**
   * One Expo POST per up-to-100 messages (F643), instead of one request per
   * device awaited serially. The lease/attempt bookkeeping is unchanged —
   * every row in the batch is taken (`sending`, attempts+1) before the
   * request, and settled individually from the response, so a batch-level
   * failure (network error, malformed response) fails every row in it
   * exactly the way an individual failure used to.
   */
  private async dispatchBatch(
    batch: Array<{
      notification: Notification & { device: NotificationDevice | null };
      message: PushPayload;
    }>,
  ): Promise<void> {
    if (batch.length === 0) return;

    await this.prisma.notification.updateMany({
      where: {
        notificationId: { in: batch.map((b) => b.notification.notificationId) },
      },
      data: {
        status: $Enums.NotificationStatus.sending,
        attempts: { increment: 1 },
      },
    });

    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch.map((b) => b.message)),
      });

      const payloadRaw: unknown = await response.json();
      const receipts = this.parseExpoBatchReceipts(payloadRaw, batch.length);

      await Promise.all(
        batch.map((item, index) =>
          this.applyReceipt(
            item.notification.notificationId,
            response.ok,
            response.statusText,
            receipts[index] ?? {},
          ),
        ),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await Promise.all(
        batch.map((item) =>
          this.markFailed(item.notification.notificationId, reason),
        ),
      );
    }
  }

  private async applyReceipt(
    notificationId: string,
    responseOk: boolean,
    responseStatusText: string,
    receipt: { status?: string; message?: string },
  ): Promise<void> {
    if (!responseOk || receipt.status === 'error') {
      await this.markFailed(
        notificationId,
        receipt.message ?? responseStatusText ?? 'unknown_error',
      );
      return;
    }
    await this.prisma.notification.update({
      where: { notificationId },
      data: {
        status: $Enums.NotificationStatus.sent,
        sentAt: new Date(),
        lastError: null,
      },
    });
  }

  /**
   * F644: `NotificationType` is wider than what can be pushed (e.g.
   * `follower_added` is an in-app-feed-only type — see
   * UserNotificationFeedService — and is never enqueued into this push
   * table). The old shape was an `if (type === 'poll_release') … return
   * null`, so ANY future producer that enqueues a new type into THIS table
   * silently mints permanently-failed rows with no signal at the call site
   * that added the producer. A switch over every `NotificationType` member,
   * with an exhaustiveness check in `default`, makes an unhandled type a
   * COMPILE ERROR instead of a runtime shrug: adding a member to the schema
   * enum without adding a case here fails `tsc`, naming this file.
   */
  private buildMessage(
    notification: Notification & { device: NotificationDevice | null },
  ): PushPayload | null {
    if (!notification.device?.expoPushToken) {
      return null;
    }
    const expoPushToken = notification.device.expoPushToken;

    switch (notification.type) {
      case $Enums.NotificationType.poll_release: {
        const payload = notification.payload as {
          placeId?: string | null;
          placeName?: string | null;
          pollIds?: string[];
        } | null;
        const placeLabel = payload?.placeName ?? null;
        return {
          to: expoPushToken,
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
      case $Enums.NotificationType.follower_added:
        // In-app-feed-only type (UserNotificationFeedService); never
        // enqueued into the push table today. Not (yet) pushable.
        return null;
      default: {
        // Exhaustiveness: a new NotificationType enum member that reaches
        // this switch without a case fails HERE at compile time.
        const _exhaustive: never = notification.type;
        return _exhaustive;
      }
    }
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
   * EXPO'S OWN DOCUMENTED SHAPES, INCLUDING THE ARRAY (D36/F642), now read
   * POSITIONALLY (F643): a batch POST gets back `{ data: [receipt, …] }` in
   * REQUEST ORDER — one receipt per message, not "any error fails the
   * whole send" (that collapsing was correct only when every request held
   * exactly one message). Each index is resolved to its own outcome so one
   * bad token in a 100-message batch fails ONLY that row.
   *
   * `isRecord` rejects arrays (`typeof [] === 'object'` is otherwise true)
   * — the F642 defect in one line, still load-bearing here.
   */
  private parseExpoBatchReceipts(
    payload: unknown,
    expectedCount: number,
  ): Array<{ status?: string; message?: string }> {
    if (!this.isRecord(payload)) {
      return Array.from({ length: expectedCount }, () => ({}));
    }

    const dataRaw = payload['data'];
    const receipts = this.asArray(dataRaw);
    if (receipts.length > 0) {
      return receipts.map((receipt) =>
        this.isRecord(receipt)
          ? {
              status: this.getStringField(receipt, 'status'),
              message:
                this.getStringField(receipt, 'message') ??
                this.getStringField(receipt, 'details'),
            }
          : {},
      );
    }

    // `data` came back as a single (non-array) object, or absent. Neither
    // is a valid per-message batch receipt set, so whatever request-level
    // signal exists (a lone receipt, or `errors`) applies to EVERY message
    // in the batch — we cannot tell which one it was about.
    if (this.isRecord(dataRaw)) {
      const single = {
        status: this.getStringField(dataRaw, 'status'),
        message: this.getStringField(dataRaw, 'message'),
      };
      return Array.from({ length: expectedCount }, () => ({ ...single }));
    }
    const errorsRaw = this.asArray(payload['errors']);
    if (errorsRaw.length > 0 && this.isRecord(errorsRaw[0])) {
      const message = this.getStringField(errorsRaw[0], 'message');
      return Array.from({ length: expectedCount }, () => ({
        status: 'error',
        message,
      }));
    }
    return Array.from({ length: expectedCount }, () => ({}));
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
