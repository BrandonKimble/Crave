/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
/**
 * THE PUSH QUEUE, HONESTLY (D36 / F640 + F641 + F642).
 *
 * Three defects, each of which this spec can show RED by reverting exactly one
 * line of notification-dispatcher.service.ts:
 *
 *  1. F642 — `isRecord` accepted an ARRAY (`typeof [] === 'object'`), so Expo's
 *     DOCUMENTED batch error payload `{ data: [ { status: 'error', … } ] }`
 *     parsed to `{ status: undefined }` and, with a 200, was recorded as SENT.
 *     MUTATION: drop `&& !Array.isArray(value)` from isRecord → the first test
 *     goes RED (the row is marked sent).
 *  2. F640 — `failed` was terminal and `attempts` was written but never read.
 *     MUTATION: delete the second OR arm of the dispatchPending predicate →
 *     the retry test goes RED (the failed row is never picked up), and the
 *     bound test goes RED in the other direction if `attempts: { lt: MAX }`
 *     is removed (an exhausted row is retried forever).
 *  3. F641 — a `sending` row whose process died was stranded FOREVER.
 *     MUTATION: remove `sending` from that arm's status list → the reclaim
 *     test goes RED.
 */
import { $Enums } from '@prisma/client';
import { NotificationDispatcherService } from './notification-dispatcher.service';

/** An hour ago — comfortably past the retry backoff / lease window. */
const LONG_AGO = new Date(Date.now() - 60 * 60 * 1000);

function createHarness(opts: {
  rows?: Array<Record<string, unknown>>;
  response?: { ok: boolean; status?: number; body: unknown };
}) {
  const updates: Array<{ notificationId: string; data: any }> = [];
  const findManyArgs: any[] = [];
  const prisma = {
    notification: {
      // The double APPLIES the predicate rather than ignoring it: a fixture
      // that only ever comes back regardless of the WHERE is an always-green
      // instrument, which is the disease this whole spec is about.
      findMany: jest.fn((args: any) => {
        findManyArgs.push(args);
        const matches = (row: any, arm: any): boolean => {
          if (arm.status && !arm.status.in.includes(row.status)) return false;
          if (arm.attempts && !(row.attempts < arm.attempts.lt)) return false;
          if (arm.updatedAt) {
            const updatedAt = row.updatedAt ?? new Date();
            if (!(updatedAt <= arm.updatedAt.lte)) return false;
          }
          if (arm.OR) {
            const scheduled = arm.OR.some(
              (sub: any) =>
                (sub.scheduledFor === null && row.scheduledFor === null) ||
                (sub.scheduledFor?.lte &&
                  row.scheduledFor &&
                  row.scheduledFor <= sub.scheduledFor.lte),
            );
            if (!scheduled) return false;
          }
          return true;
        };
        const arms: any[] = args.where.OR ?? [args.where];
        return Promise.resolve(
          (opts.rows ?? []).filter((row: any) =>
            arms.some((arm) => matches(row, arm)),
          ),
        );
      }),
      update: jest.fn((args: any) => {
        updates.push({
          notificationId: args.where.notificationId,
          data: args.data,
        });
        return Promise.resolve({ attempts: 1 });
      }),
    },
  };
  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const service = new NotificationDispatcherService(
    prisma as never,
    logger as never,
  );
  return { service, prisma, updates, findManyArgs, logger };
}

function pendingRow(over: Record<string, unknown> = {}) {
  return {
    notificationId: 'n1',
    type: 'poll_release',
    status: $Enums.NotificationStatus.pending,
    payload: { placeId: 'p1', placeName: 'Austin', pollIds: ['poll-1'] },
    scheduledFor: null,
    attempts: 0,
    device: { expoPushToken: 'ExponentPushToken[abc]' },
    ...over,
  };
}

describe("parseExpoResponse rejects Expo's documented ARRAY batch shape (F642)", () => {
  it('a 200 carrying { data: [ { status: error } ] } FAILS the send instead of reading as sent', async () => {
    const { service, updates } = createHarness({ rows: [pendingRow()] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          data: [
            {
              status: 'error',
              message:
                '"ExponentPushToken[abc]" is not a registered push notification recipient',
              details: { error: 'DeviceNotRegistered' },
            },
          ],
        }),
    }) as never;

    await service.dispatchPending();

    const statuses = updates.map((u) => u.data.status);
    expect(statuses).toContain($Enums.NotificationStatus.failed);
    expect(statuses).not.toContain($Enums.NotificationStatus.sent);
    const failed = updates.find(
      (u) => u.data.status === $Enums.NotificationStatus.failed,
    );
    expect(failed?.data.lastError).toContain('not a registered push');
  });

  it('the same array shape with a SUCCESS receipt still sends (the guard is not just "arrays fail")', async () => {
    const { service, updates } = createHarness({ rows: [pendingRow()] });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: () =>
        Promise.resolve({ data: [{ status: 'ok', id: 'receipt-1' }] }),
    }) as never;

    await service.dispatchPending();

    expect(updates.map((u) => u.data.status)).toContain(
      $Enums.NotificationStatus.sent,
    );
  });
});

describe('the queue actually retries and reclaims (F640 + F641)', () => {
  it('the dispatch predicate reads `attempts` and includes failed + sending rows past the backoff', async () => {
    const { service, findManyArgs } = createHarness({ rows: [] });
    await service.dispatchPending();

    const where = findManyArgs[0].where;
    const retryArm = where.OR.find((arm: any) => arm.attempts !== undefined);
    expect(retryArm).toBeDefined();
    // `attempts` is CONSULTED — it was previously incremented and read by no
    // code in the repo.
    expect(retryArm.attempts).toEqual({ lt: expect.any(Number) });
    expect(retryArm.status.in).toEqual(
      expect.arrayContaining([
        $Enums.NotificationStatus.failed,
        // The `sending` reclaim: a lease older than the window lost its owner.
        $Enums.NotificationStatus.sending,
      ]),
    );
    expect(retryArm.updatedAt.lte).toBeInstanceOf(Date);
    expect(retryArm.updatedAt.lte.getTime()).toBeLessThan(Date.now());
  });

  it('a failed row inside the attempt budget is redelivered and can reach sent', async () => {
    const { service, updates } = createHarness({
      rows: [
        pendingRow({
          status: $Enums.NotificationStatus.failed,
          attempts: 1,
          updatedAt: LONG_AGO,
        }),
      ],
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: () => Promise.resolve({ data: { status: 'ok' } }),
    }) as never;

    await service.dispatchPending();

    expect(updates.map((u) => u.data.status)).toEqual([
      $Enums.NotificationStatus.sending,
      $Enums.NotificationStatus.sent,
    ]);
  });

  it('a `sending` row whose lease expired is RECLAIMED (F641) — it used to be stranded forever', async () => {
    const { service, updates } = createHarness({
      rows: [
        pendingRow({
          status: $Enums.NotificationStatus.sending,
          attempts: 1,
          updatedAt: LONG_AGO,
        }),
      ],
    });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: () => Promise.resolve({ data: { status: 'ok' } }),
    }) as never;

    await service.dispatchPending();

    expect(updates.map((u) => u.data.status)).toContain(
      $Enums.NotificationStatus.sent,
    );
  });

  it('a row that has SPENT its attempts is not picked up again (the retry is bounded, not a poison-pill loop)', async () => {
    const { service, updates } = createHarness({
      rows: [
        pendingRow({
          status: $Enums.NotificationStatus.failed,
          attempts: 3,
          updatedAt: LONG_AGO,
        }),
      ],
    });
    await service.dispatchPending();
    expect(updates).toHaveLength(0);
  });

  it('a PERMANENT defect (no token) is made terminal by exhausting the budget, not by a second vocabulary', async () => {
    const { service, updates } = createHarness({
      rows: [pendingRow({ device: null })],
    });
    await service.dispatchPending();

    expect(updates).toHaveLength(1);
    expect(updates[0].data.status).toBe($Enums.NotificationStatus.failed);
    expect(updates[0].data.lastError).toBe('missing_token');
    // Without this, a token-less row would be retried every tick forever.
    expect(updates[0].data.attempts).toBeGreaterThan(0);
  });
});
