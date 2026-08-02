import 'reflect-metadata';
import { CentralizedRateLimiter } from './centralized-rate-limiter.service';

// REDIS DOWN USED TO MEAN NO LLM RATE LIMIT AT ALL.
//
// The reservation path caught its own failure, slept ~1.5s, and returned
// `guaranteed: false`. The caller copied that flag into a log payload and
// called Gemini anyway. So an outage turned the distributed limiter into a
// 1.5s speed bump in front of unlimited concurrency — N workers each waited,
// then all fired. The Places coordinator already had an in-process minute
// counter for exactly this; the LLM path never got one.
//
// These tests drive the PRIVATE guard directly because the public path
// requires a live Redis to fail in the first place; the guard is the whole
// behaviour under test.

type Guard = {
  reserveLocallyDuringOutage: (now: number) => {
    reservationTime: number;
    waitMs: number;
    usage: number;
    limit: number;
    throttled: boolean;
  };
  safeRPM: number;
  logger: unknown;
  outageMinuteCounters: Map<number, { count: number; expiresAt: number }>;
};

function makeGuard(safeRPM: number, replicas?: string): Guard {
  const instance = Object.create(CentralizedRateLimiter.prototype) as Guard;
  Object.assign(instance, {
    safeRPM,
    logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
    outageMinuteCounters: new Map(),
  });
  if (replicas === undefined) delete process.env.LLM_EXPECTED_REPLICAS;
  else process.env.LLM_EXPECTED_REPLICAS = replicas;
  return instance;
}

describe('LLM rate limiter: outage guard', () => {
  const saved = process.env.LLM_EXPECTED_REPLICAS;
  afterEach(() => {
    if (saved === undefined) delete process.env.LLM_EXPECTED_REPLICAS;
    else process.env.LLM_EXPECTED_REPLICAS = saved;
  });

  it('admits up to the local ceiling, then HOLDS — it does not just sleep and fire', () => {
    const guard = makeGuard(60);
    const now = 1_000_000 * 60; // aligned to a minute boundary
    const admitted: ReturnType<Guard['reserveLocallyDuringOutage']>[] = [];
    for (let i = 0; i < 60; i++) {
      admitted.push(guard.reserveLocallyDuringOutage(now));
    }
    expect(admitted.every((r) => !r.throttled)).toBe(true);
    expect(admitted[59].usage).toBe(60);

    // The 61st in the same minute must be held to the next window, not
    // released after a fixed nap.
    const overflow = guard.reserveLocallyDuringOutage(now);
    expect(overflow.throttled).toBe(true);
    expect(overflow.waitMs).toBeGreaterThan(0);
    expect(overflow.reservationTime).toBe(now + 60_000);
  });

  it('divides the ceiling across replicas so N processes do not each get the full rate', () => {
    const single = makeGuard(600);
    expect(single.reserveLocallyDuringOutage(0).limit).toBe(600);

    const four = makeGuard(600, '4');
    expect(four.reserveLocallyDuringOutage(0).limit).toBe(150);
  });

  it('defaults to one replica — a single-process deployment is the honest default', () => {
    const guard = makeGuard(600, undefined);
    expect(guard.reserveLocallyDuringOutage(0).limit).toBe(600);
  });

  it('never admits an unlimited burst even with an absurd replica count', () => {
    const guard = makeGuard(10, '10000');
    // The ceiling floors at 1 rather than 0 — a zero limit would hold
    // everything forever and turn a Redis blip into a total outage.
    expect(guard.reserveLocallyDuringOutage(0).limit).toBe(1);
  });

  it('the window rolls: a new minute restores the allowance', () => {
    const guard = makeGuard(1);
    const minuteOne = 60_000;
    expect(guard.reserveLocallyDuringOutage(minuteOne).throttled).toBe(false);
    expect(guard.reserveLocallyDuringOutage(minuteOne).throttled).toBe(true);
    expect(guard.reserveLocallyDuringOutage(minuteOne + 60_000).throttled).toBe(
      false,
    );
  });

  it('prunes expired buckets so a long outage does not grow the map', () => {
    const guard = makeGuard(5);
    guard.reserveLocallyDuringOutage(60_000);
    expect(guard.outageMinuteCounters.size).toBe(1);
    guard.reserveLocallyDuringOutage(60_000 * 500);
    expect(guard.outageMinuteCounters.size).toBe(1);
  });
});
