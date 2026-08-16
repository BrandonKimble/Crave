import 'reflect-metadata';
import { CentralizedRateLimiter } from './centralized-rate-limiter.service';
import { SmartLLMProcessor } from './smart-llm-processor.service';
import type { LLMService } from '../llm.service';
import type { LLMModelInput } from '../llm.types';

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
    // No overflow in between — a HELD request would rightly own the next
    // minute's slot (see the boundary-burst test below).
    expect(guard.reserveLocallyDuringOutage(minuteOne + 60_000).throttled).toBe(
      false,
    );
  });

  // F3000 (D71 acceptance): the reservation OWNS ITS LANDING SLOT. Before the
  // fix, a throttled reservation incremented nothing and the caller
  // slept-then-fired, so limit+k requests landed in minute N+1 while N+1
  // separately admitted its own full limit — up to 2x the ceiling in one
  // synchronized boundary burst.
  it('held requests are booked into the minute they fire in: total releases landing in minute N+1 <= limit', () => {
    const limit = 5;
    const k = 3;
    const guard = makeGuard(limit);
    const minuteN = 60_000;

    // Drive limit+k calls in minute N: k are held, and each hold must be
    // booked into its landing minute.
    const held: ReturnType<Guard['reserveLocallyDuringOutage']>[] = [];
    for (let i = 0; i < limit + k; i++) {
      const r = guard.reserveLocallyDuringOutage(minuteN);
      if (r.throttled) held.push(r);
    }
    expect(held).toHaveLength(k);
    const minuteN1 = minuteN + 60_000;
    const heldLandingInN1 = held.filter(
      (r) =>
        r.reservationTime >= minuteN1 && r.reservationTime < minuteN1 + 60_000,
    ).length;

    // At the N+1 boundary, drive limit more calls: fresh admissions plus the
    // held releases landing in N+1 must not exceed the limit.
    let admittedAtBoundary = 0;
    for (let i = 0; i < limit; i++) {
      const r = guard.reserveLocallyDuringOutage(minuteN1);
      if (!r.throttled) admittedAtBoundary += 1;
    }
    expect(heldLandingInN1 + admittedAtBoundary).toBeLessThanOrEqual(limit);
  });

  it('holds cascade: once the next minute is fully booked, further holds land in the minute after', () => {
    const guard = makeGuard(1);
    const minuteN = 60_000;
    expect(guard.reserveLocallyDuringOutage(minuteN).throttled).toBe(false);
    const firstHold = guard.reserveLocallyDuringOutage(minuteN);
    const secondHold = guard.reserveLocallyDuringOutage(minuteN);
    expect(firstHold.reservationTime).toBe(minuteN + 60_000);
    expect(secondHold.reservationTime).toBe(minuteN + 120_000);
  });

  it('prunes expired buckets so a long outage does not grow the map', () => {
    const guard = makeGuard(5);
    guard.reserveLocallyDuringOutage(60_000);
    expect(guard.outageMinuteCounters.size).toBe(1);
    guard.reserveLocallyDuringOutage(60_000 * 500);
    expect(guard.outageMinuteCounters.size).toBe(1);
  });
});

// THE ARITHMETIC IS NOT THE PROPERTY. The tests above drive the private guard
// directly, so severing its one call site — restoring the original bug exactly
// — left them all green (red team 2026-08-02). What actually matters is that
// the OUTAGE PATH consults it and the caller sleeps on the result.
//
// F3003 (D71): the previous version of this describe was a SOURCE SCANNER —
// /(sleep|setTimeout|delay)/i matched anywhere in an 880-line file (the 429
// retry path alone satisfied it), and the catch-scan anchored to the file's
// FIRST catch block. Severing the outage-path sleep left it green. Replaced
// with the behavioral stub-and-spy proofs below; the scanner died with it.
describe('the outage path is wired to the guard (behavioral)', () => {
  it('a Redis failure in reserveRequestSlot consults the local guard — the emergency booking actually lands', async () => {
    const instance = Object.create(CentralizedRateLimiter.prototype) as {
      reserveRequestSlot: CentralizedRateLimiter['reserveRequestSlot'];
      outageMinuteCounters: Map<number, { count: number; expiresAt: number }>;
    };
    Object.assign(instance, {
      redis: { eval: jest.fn().mockRejectedValue(new Error('redis is down')) },
      logger: {
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        info: jest.fn(),
      },
      safeRPM: 60,
      safeTPM: 100_000,
      minSpacingMs: 0,
      workerTimeSlotMs: 0,
      outageMinuteCounters: new Map(),
    });
    delete process.env.LLM_EXPECTED_REPLICAS;

    const reservation = await instance.reserveRequestSlot('worker-test', 100);

    // The outage reservation is the guard's, not a naked 1.5s nap: it is
    // unguaranteed AND it occupies a slot in the local minute counter.
    expect(reservation.guaranteed).toBe(false);
    const totalBooked = [...instance.outageMinuteCounters.values()].reduce(
      (sum, entry) => sum + entry.count,
      0,
    );
    expect(totalBooked).toBe(1);
  });

  it('the caller actually SLEEPS the outage waitMs before calling the LLM — a returned delay nobody sleeps on is not a limit', async () => {
    const order: string[] = [];
    const outageWaitMs = 40_000;
    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const rateLimiter = {
      reserveRequestSlot: jest.fn().mockResolvedValue({
        reservationTime: Date.now() + outageWaitMs,
        waitMs: outageWaitMs,
        guaranteed: false,
        metrics: { error: 'reservation_failed', fallbackMode: true },
        reservationMember: '',
      }),
      confirmReservation: jest.fn().mockResolvedValue(undefined),
      finalizeTokenReservation: jest.fn().mockResolvedValue(undefined),
      recordTokenUsage: jest.fn().mockResolvedValue(undefined),
      getRPMAnalysis: jest.fn().mockResolvedValue({
        currentRPM: 1,
        utilizationPercent: 1,
        availableCapacity: 99,
      }),
      getTPMAnalysis: jest.fn().mockResolvedValue({
        currentTPM: 10,
        reservedTPM: 0,
        windowTokens: 10,
        utilizationPercent: 1,
        projectedTPM: 10,
        avgTokensPerRequest: 10,
        bottleneckType: 'none',
      }),
    };
    const processor = new SmartLLMProcessor(
      logger as never,
      rateLimiter as never,
    );
    processor.onModuleInit();
    const sleptMs: number[] = [];
    (processor as unknown as { sleep: (ms: number) => Promise<void> }).sleep = (
      ms: number,
    ) => {
      order.push(`sleep:${ms}`);
      sleptMs.push(ms);
      return Promise.resolve();
    };
    const llm = {
      processContent: jest.fn().mockImplementation(() => {
        order.push('llm');
        return Promise.resolve({ places: [] });
      }),
    } as unknown as LLMService;

    await processor.processContent(
      { posts: [] } as unknown as LLMModelInput,
      llm,
      'worker-test',
    );

    // The processor awaited a sleep of at least the guard's waitMs BEFORE
    // the LLM fired (jitter may add up to 500ms).
    expect(sleptMs.length).toBeGreaterThanOrEqual(1);
    expect(sleptMs[0]).toBeGreaterThanOrEqual(outageWaitMs);
    expect(order.indexOf(`sleep:${sleptMs[0]}`)).toBeLessThan(
      order.indexOf('llm'),
    );
  });
});
