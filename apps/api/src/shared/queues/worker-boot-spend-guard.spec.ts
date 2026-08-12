import {
  guardSpendBearingQueuesAtBoot,
  takeBootSpendGuardVerdicts,
  resumeCommandFor,
  PRE_BOOT_BACKLOG_GRACE,
  QueueBacklogPort,
} from './worker-boot-spend-guard';
import { createBullQueueBacklogPort } from './bull-queue-backlog.adapter';

/**
 * The guard exists because a freshly booted worker drained ~1,100 fossil
 * grounding/cuisine jobs and spent ~$25 of Google Places on work nobody had
 * asked for that day. Each test below is one clause of the law.
 */

const BOOT_AT = 1_000_000;

/** A fake queue of jobs with real enqueue timestamps, so "pre-boot" is
 *  measured the way the adapter measures it, not asserted. */
const fakePort = (
  jobsByQueue: Record<string, number[]>,
  overrides: Partial<QueueBacklogPort> = {},
) => {
  const paused = new Set<string>();
  const pauseCalls: string[] = [];
  const port: QueueBacklogPort = {
    countPreBootBacklog: (queueName, bootAt) =>
      Promise.resolve(
        (jobsByQueue[queueName] ?? []).filter((ts) => ts < bootAt).length,
      ),
    isPaused: (queueName) => Promise.resolve(paused.has(queueName)),
    pause: (queueName) => {
      pauseCalls.push(queueName);
      paused.add(queueName);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { port, paused, pauseCalls };
};

describe('worker boot spend guard', () => {
  beforeEach(() => {
    takeBootSpendGuardVerdicts();
  });

  it('PAUSES a spend-bearing queue holding a fossil backlog, and records the alert verdict', async () => {
    const fossils = Array.from(
      { length: 1100 },
      (_, i) => BOOT_AT - 90_000 - i,
    );
    const { port, paused, pauseCalls } = fakePort({
      'restaurant-primary-enrichment': fossils,
    });

    const verdicts = await guardSpendBearingQueuesAtBoot({
      port,
      bootAt: BOOT_AT,
      queueNames: ['restaurant-primary-enrichment'],
    });

    expect(pauseCalls).toEqual(['restaurant-primary-enrichment']);
    expect(paused.has('restaurant-primary-enrichment')).toBe(true);
    expect(verdicts).toEqual([
      {
        queueName: 'restaurant-primary-enrichment',
        outcome: 'paused',
        backlog: 1100,
        resumeCommand: resumeCommandFor('restaurant-primary-enrichment'),
      },
    ]);
    // The alert service drains exactly these.
    expect(takeBootSpendGuardVerdicts()).toEqual(verdicts);
  });

  it('lets FRESH jobs — enqueued after boot — be processed: no pause', async () => {
    const { port, pauseCalls } = fakePort({
      // 900 jobs, all enqueued AFTER this worker booted. This is a busy,
      // healthy worker, not a fossil backlog.
      'restaurant-primary-enrichment': Array.from(
        { length: 900 },
        (_, i) => BOOT_AT + 1 + i,
      ),
    });

    const verdicts = await guardSpendBearingQueuesAtBoot({
      port,
      bootAt: BOOT_AT,
      queueNames: ['restaurant-primary-enrichment'],
    });

    expect(pauseCalls).toEqual([]);
    expect(verdicts[0]).toMatchObject({ outcome: 'within-grace', backlog: 0 });
  });

  it('tolerates normal redeploy churn up to the grace, and freezes one job past it', async () => {
    const atGrace = fakePort({
      'restaurant-cuisine-extraction': Array.from(
        { length: PRE_BOOT_BACKLOG_GRACE },
        () => BOOT_AT - 10,
      ),
    });
    await guardSpendBearingQueuesAtBoot({
      port: atGrace.port,
      bootAt: BOOT_AT,
      queueNames: ['restaurant-cuisine-extraction'],
    });
    expect(atGrace.pauseCalls).toEqual([]);

    const overGrace = fakePort({
      'restaurant-cuisine-extraction': Array.from(
        { length: PRE_BOOT_BACKLOG_GRACE + 1 },
        () => BOOT_AT - 10,
      ),
    });
    await guardSpendBearingQueuesAtBoot({
      port: overGrace.port,
      bootAt: BOOT_AT,
      queueNames: ['restaurant-cuisine-extraction'],
    });
    expect(overGrace.pauseCalls).toEqual(['restaurant-cuisine-extraction']);
  });

  it('NEVER touches a non-spend queue, however large its fossil backlog', async () => {
    const { port, pauseCalls } = fakePort({
      'chronological-collection': Array.from(
        { length: 5000 },
        () => BOOT_AT - 10,
      ),
    });

    // Both the default sweep and an explicit (wrong) request must leave it
    // alone: the classification decides, not the caller.
    const swept = await guardSpendBearingQueuesAtBoot({
      port,
      bootAt: BOOT_AT,
    });
    const asked = await guardSpendBearingQueuesAtBoot({
      port,
      bootAt: BOOT_AT,
      queueNames: ['chronological-collection'],
    });

    expect(pauseCalls).toEqual([]);
    expect(asked).toEqual([]);
    expect(swept.map((v) => v.queueName)).not.toContain(
      'chronological-collection',
    );
  });

  it('sweeps every spend-bearing queue by default', async () => {
    const { port } = fakePort({});
    const verdicts = await guardSpendBearingQueuesAtBoot({
      port,
      bootAt: BOOT_AT,
    });
    expect(verdicts.map((v) => v.queueName).sort()).toEqual(
      [
        'attribute-ontology-adjudication',
        'archive-batch-processing-queue',
        'chronological-batch-processing-queue',
        'keyword-batch-processing-queue',
        'restaurant-cuisine-extraction',
        'restaurant-primary-enrichment',
        'restaurant-secondary-location-expansion',
      ].sort(),
    );
  });

  it('leaves an already-paused queue paused (a restart must not resume it)', async () => {
    const { port, pauseCalls } = fakePort({}, {});
    await port.pause('restaurant-primary-enrichment');
    pauseCalls.length = 0;

    const verdicts = await guardSpendBearingQueuesAtBoot({
      port,
      bootAt: BOOT_AT,
      queueNames: ['restaurant-primary-enrichment'],
    });

    expect(pauseCalls).toEqual([]);
    expect(verdicts[0].outcome).toBe('already-paused');
  });

  it('FAILS CLOSED: an unmeasurable backlog pauses rather than drains', async () => {
    const { port, pauseCalls } = fakePort(
      {},
      {
        countPreBootBacklog: () => Promise.reject(new Error('redis exploded')),
      },
    );

    const verdicts = await guardSpendBearingQueuesAtBoot({
      port,
      bootAt: BOOT_AT,
      queueNames: ['restaurant-primary-enrichment'],
    });

    expect(pauseCalls).toEqual(['restaurant-primary-enrichment']);
    expect(verdicts[0]).toMatchObject({
      outcome: 'measurement-failed',
      detail: 'redis exploded',
    });
  });
});

describe('bull queue backlog port', () => {
  it('counts only waiting/paused/delayed jobs enqueued before boot', async () => {
    const getJobs = jest
      .fn()
      .mockResolvedValue([
        { timestamp: BOOT_AT - 5 },
        { timestamp: BOOT_AT - 1 },
        { timestamp: BOOT_AT },
        { timestamp: BOOT_AT + 10 },
      ]);
    const pause = jest.fn().mockResolvedValue(undefined);
    const port = createBullQueueBacklogPort(
      () =>
        ({
          getJobs,
          pause,
          isPaused: jest.fn().mockResolvedValue(false),
          close: jest.fn().mockResolvedValue(undefined),
        }) as never,
    );

    await expect(
      port.countPreBootBacklog('restaurant-primary-enrichment', BOOT_AT),
    ).resolves.toBe(2);
    expect(getJobs).toHaveBeenCalledWith(['waiting', 'paused', 'delayed']);

    // The pause must be GLOBAL (isLocal=false) or it dies with this process
    // and the next boot drains the fossils anyway.
    await port.pause('restaurant-primary-enrichment');
    expect(pause).toHaveBeenCalledWith(false, true);
  });
});
