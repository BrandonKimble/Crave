import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * Vote-integrity device observation (plans/vote-integrity-ladder.md): the
 * auth guards' sync seam is the server's observation moment for "this user
 * showed up on this device". Fire-and-forget upsert into user_devices —
 * NEVER blocks or fails the request, mirroring SignalsService.record()'s
 * never-throw law. "One device carries N accounts" is then a GROUP BY read
 * by the sybil clustering report — a signal, never a gate.
 */

// §16 class: K7 plumbing constants — write-suppression plumbing, not behavior:
// no read changes meaning at any value. last_seen is day-grain evidence in the
// clustering report, so refreshing it more than hourly is pure write waste.
const LAST_SEEN_WRITE_INTERVAL_MS = 60 * 60 * 1000;
// Memory ceiling for the per-process throttle map (K3-shaped capacity bound;
// eviction merely costs one extra upsert). Sized far above realistic
// concurrent (user, device) pairs per replica.
const THROTTLE_MAP_MAX = 50_000;

// Device keys are client-supplied: accept only UUID-shaped material (8-64
// chars of [A-Za-z0-9-]) so junk can't land in the table.
const DEVICE_KEY_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

@Injectable()
export class UserDevicesService {
  private readonly logger: LoggerService;
  /** "<userId>:<deviceKey>" -> epoch ms of the last accepted write. */
  private readonly lastWriteAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('UserDevicesService');
  }

  /** Normalize the raw x-device-key header value; null when absent/invalid. */
  static extractDeviceKey(headerValue: unknown): string | null {
    const raw: unknown = Array.isArray(headerValue)
      ? (headerValue as unknown[])[0]
      : headerValue;
    if (typeof raw !== 'string') {
      return null;
    }
    const trimmed = raw.trim();
    return DEVICE_KEY_PATTERN.test(trimmed) ? trimmed : null;
  }

  /**
   * Record "userId was seen on deviceKey". Fire-and-forget: validates,
   * throttles repeat writes to once per interval per (user, device), and
   * swallows every failure with a warn log.
   */
  recordObservation(userId: string, headerValue: unknown): void {
    try {
      const deviceKey = UserDevicesService.extractDeviceKey(headerValue);
      if (!deviceKey || !userId) {
        return;
      }
      const throttleKey = `${userId}:${deviceKey}`;
      const now = Date.now();
      const last = this.lastWriteAt.get(throttleKey);
      if (last !== undefined && now - last < LAST_SEEN_WRITE_INTERVAL_MS) {
        return;
      }
      // FIFO-ish eviction: Map preserves insertion order; dropping the oldest
      // entry only means one extra (idempotent) upsert for that pair.
      if (this.lastWriteAt.size >= THROTTLE_MAP_MAX) {
        const first = this.lastWriteAt.keys().next();
        const oldest = first.done ? undefined : first.value;
        if (oldest !== undefined) {
          this.lastWriteAt.delete(oldest);
        }
      }
      this.lastWriteAt.set(throttleKey, now);
      void this.prisma.userDevice
        .upsert({
          where: { userId_deviceKey: { userId, deviceKey } },
          create: { userId, deviceKey },
          update: { lastSeen: new Date() },
        })
        .catch((error: unknown) => {
          // Allow a retry sooner than the interval after a failed write.
          this.lastWriteAt.delete(throttleKey);
          this.logger.warn('user_devices upsert failed (request unaffected)', {
            error: {
              message: error instanceof Error ? error.message : String(error),
            },
          });
        });
    } catch (error) {
      this.logger.warn('user_devices observation failed synchronously', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
