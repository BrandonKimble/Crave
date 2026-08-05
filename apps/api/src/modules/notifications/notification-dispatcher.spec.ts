/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
/**
 * THE PUSH QUEUE, HONESTLY (D36 / F640 + F641 + F642; F643 + F644 Phase 3).
 *
 * Defects this spec can show RED by reverting exactly one line/shape of
 * notification-dispatcher.service.ts:
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
 *  4. F643 — one HTTP request per device, awaited serially, was the shape.
 *     Below, "batches by token" proves the fetch body is a single JSON
 *     ARRAY of every sendable message, not N separate POSTs; "a bad
 *     receipt at one index fails only that row" proves per-message
 *     resolution survived batching (F642's positional fix, generalized).
 *  5. F644 — buildMessage was `if (type === 'poll_release') … return null`.
 *     MUTATION: delete the `follower_added` case (or the `default`
 *     exhaustiveness check) → `tsc --noEmit` fails at the switch, not at
 *     runtime.
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
      // The batch take (F643): one call moves every row in the batch to
      // `sending` — recorded per-id so existing per-notification assertions
      // (built around the old one-`update`-per-row shape) still hold.
      updateMany: jest.fn((args: any) => {
        const ids: string[] = args.where.notificationId.in;
        for (const notificationId of ids) {
          updates.push({ notificationId, data: args.data });
        }
        return Promise.resolve({ count: ids.length });
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

describe('batching by token (F643)', () => {
  it('sends every device in ONE POST as a JSON array, not one request per device', async () => {
    const rows = [
      pendingRow({ notificationId: 'n1', device: { expoPushToken: 'tok-1' } }),
      pendingRow({ notificationId: 'n2', device: { expoPushToken: 'tok-2' } }),
      pendingRow({ notificationId: 'n3', device: { expoPushToken: 'tok-3' } }),
    ];
    const { service } = createHarness({ rows });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          data: [{ status: 'ok' }, { status: 'ok' }, { status: 'ok' }],
        }),
    });
    global.fetch = fetchMock as never;

    await service.dispatchPending();

    // RED under the reverted (serial, one-per-device) defect: fetch would be
    // called 3 times with a single-object body each, not once with an array.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
    expect(body.map((m: any) => m.to)).toEqual(['tok-1', 'tok-2', 'tok-3']);
  });

  it('a bad receipt at one index fails ONLY that row — the other two still send', async () => {
    const rows = [
      pendingRow({ notificationId: 'n1', device: { expoPushToken: 'tok-1' } }),
      pendingRow({ notificationId: 'n2', device: { expoPushToken: 'tok-2' } }),
      pendingRow({ notificationId: 'n3', device: { expoPushToken: 'tok-3' } }),
    ];
    const { service, updates } = createHarness({ rows });
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          data: [
            { status: 'ok' },
            { status: 'error', message: 'DeviceNotRegistered' },
            { status: 'ok' },
          ],
        }),
    }) as never;

    await service.dispatchPending();

    const byId = (id: string) =>
      updates.filter((u) => u.notificationId === id).map((u) => u.data.status);
    expect(byId('n1')).toContain($Enums.NotificationStatus.sent);
    expect(byId('n2')).toContain($Enums.NotificationStatus.failed);
    expect(byId('n3')).toContain($Enums.NotificationStatus.sent);
    const n2Failure = updates.find(
      (u) =>
        u.notificationId === 'n2' &&
        u.data.status === $Enums.NotificationStatus.failed,
    );
    expect(n2Failure?.data.lastError).toBe('DeviceNotRegistered');
  });

  it('more than 100 sendable rows are split into multiple POSTs of ≤100', async () => {
    const rows = Array.from({ length: 101 }, (_, i) =>
      pendingRow({
        notificationId: `n${i}`,
        device: { expoPushToken: `tok-${i}` },
      }),
    );
    const { service } = createHarness({ rows });
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      statusText: 'OK',
      json: () =>
        Promise.resolve({
          data: Array.from({ length: 100 }, () => ({ status: 'ok' })),
        }),
    });
    global.fetch = fetchMock as never;

    await service.dispatchPending();

    // 101 sendable rows -> two batches (100 + 1), never one request of 101.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sizes = fetchMock.mock.calls.map(
      ([, options]: [string, RequestInit]) =>
        JSON.parse(options.body as string).length,
    );
    expect(sizes.every((n: number) => n <= 100)).toBe(true);
    expect(sizes).toEqual([100, 1]);
  });
});

describe('exhaustive buildMessage switch (F644)', () => {
  it('an in-app-feed-only type (follower_added) fails LOUD via an explicit case, not the poll_release fallthrough', async () => {
    const { service, updates } = createHarness({
      rows: [pendingRow({ type: $Enums.NotificationType.follower_added })],
    });
    await service.dispatchPending();

    expect(updates).toHaveLength(1);
    expect(updates[0].data.status).toBe($Enums.NotificationStatus.failed);
    expect(updates[0].data.lastError).toBe('invalid_payload');
  });
});
