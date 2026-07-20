import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { PollWeeklyRitualService } from './poll-weekly-ritual.service';
import { PollSupplyEstimators } from './poll-supply-estimators';

// §4 weekly ritual: one tick per place at Sunday 09:00 LOCAL; publish is
// ATOMIC (tick + poll rows + archived birth-certificate topics + supply
// state + notification queue rows) with (placeId, weekOf-local) as the
// idempotency key. Cohort closure + evidence consumption are judged on
// weekOf LABELS (red-team 1a/2b); cooldowns GATE, not just rank (2d); a
// place with no state and no warrant leaves no rows (1c/2a).

const PLACE_ID = '99999999-9999-9999-9999-999999999999';
const DISH_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
// Sunday 2026-07-19 09:30 in America/Chicago (14:30Z).
const SUNDAY_0930_LOCAL = new Date('2026-07-19T14:30:00Z');
// Wednesday 2026-07-15 09:30 local.
const WEDNESDAY = new Date('2026-07-15T14:30:00Z');
const WEEK_OF = '2026-07-19';
const LAST_WEEK_OF = '2026-07-12';
const TWO_WEEKS_AGO_OF = '2026-07-05';

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('unique', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

interface HarnessOptions {
  existingTicks?: { placeId: string; weekOf: string }[];
  subjects?: {
    placeId: string;
    subjectId: string;
    entityType: 'food' | 'restaurant';
    entityName: string;
    mass: number;
    currentMass: number;
    baselineWeeklyMass: number;
  }[];
  mass?: number;
  tickCreateRejects?: boolean;
  /** Rows for prisma.poll.findMany (the cohort harvest). */
  harvestPolls?: Record<string, unknown>[];
  /** Rows for prisma.pollTopic.findMany (the cooldown memory). */
  cooldownTopics?: Record<string, unknown>[];
  /** Row for prisma.pollPlaceSupply.findMany (existing supply state). */
  supplyState?: Record<string, unknown> | null;
}

function createHarness(options: HarnessOptions = {}) {
  const tx = {
    pollWeeklyTick: {
      create: options.tickCreateRejects
        ? jest.fn().mockRejectedValue(uniqueViolation())
        : jest.fn().mockResolvedValue({}),
    },
    pollTopic: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    poll: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    pollPlaceSupply: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    pollPlaceSupply: {
      findMany: jest
        .fn()
        .mockResolvedValue(options.supplyState ? [options.supplyState] : []),
    },
    place: {
      findMany: jest.fn().mockResolvedValue([
        {
          placeId: PLACE_ID,
          name: 'Austin',
          timeZone: 'America/Chicago',
          centroidLat: new Prisma.Decimal(30.27),
          centroidLng: new Prisma.Decimal(-97.74),
        },
      ]),
      findUnique: jest.fn().mockResolvedValue({
        centroidLat: new Prisma.Decimal(30.27),
        centroidLng: new Prisma.Decimal(-97.74),
      }),
    },
    pollWeeklyTick: {
      findMany: jest.fn().mockResolvedValue(options.existingTicks ?? []),
    },
    poll: { findMany: jest.fn().mockResolvedValue(options.harvestPolls ?? []) },
    pollTopic: {
      findMany: jest.fn().mockResolvedValue(options.cooldownTopics ?? []),
    },
    pollComment: { groupBy: jest.fn().mockResolvedValue([]) },
    market: { findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const demandMass = {
    placesWithAnySignal: jest.fn().mockResolvedValue([PLACE_ID]),
    placeDemandMass: jest
      .fn()
      .mockResolvedValue([{ placeId: PLACE_ID, mass: options.mass ?? 120 }]),
    subjectDemandMass: jest.fn().mockResolvedValue(options.subjects ?? []),
  };
  const notifications = {
    queuePollReleaseForPlace: jest.fn().mockResolvedValue(undefined),
  };
  const service = new PollWeeklyRitualService(
    prisma as never,
    demandMass as never,
    new PollSupplyEstimators(),
    notifications as never,
    createLogger() as never,
  );
  service.sleep = jest.fn().mockResolvedValue(undefined);
  return { service, prisma, tx, demandMass, notifications };
}

function topicCreateManyRows(
  tx: ReturnType<typeof createHarness>['tx'],
): Record<string, unknown>[] {
  return tx.pollTopic.createMany.mock.calls.flatMap(
    ([args]: [{ data: Record<string, unknown>[] }]) => args.data,
  );
}

function pollCreateManyRows(
  tx: ReturnType<typeof createHarness>['tx'],
): Record<string, unknown>[] {
  return tx.poll.createMany.mock.calls.flatMap(
    ([args]: [{ data: Record<string, unknown>[] }]) => args.data,
  );
}

const SUBJECT = {
  placeId: PLACE_ID,
  subjectId: DISH_ID,
  entityType: 'food' as const,
  entityName: 'breakfast taco',
  mass: 40,
  currentMass: 12,
  baselineWeeklyMass: 4,
};

/** The launch-time mass every fixture cohort was published with — the value
 *  the birth certificate stamped (poll-supply swap: harvest reads the stamp,
 *  never re-evaluates history). */
const STAMPED_LAUNCH_MASS = 100;

function harvestPoll(overrides: Record<string, unknown> = {}) {
  return {
    pollId: '30303030-3030-3030-3030-303030303030',
    placeId: PLACE_ID,
    launchedAt: new Date('2026-07-12T14:30:30Z'),
    graduatedAt: null,
    metadata: {
      weekOf: LAST_WEEK_OF,
      birthCertificate: {
        kind: 'subject',
        controller: { weeklyDemandMass: STAMPED_LAUNCH_MASS },
      },
    },
    ...overrides,
  };
}

describe('PollWeeklyRitualService — the §4 weekly ritual', () => {
  it('publishes ATOMICALLY through one transaction: tick row + archived birth-certificate topics + active polls + supply state + notification rows', async () => {
    const { service, prisma, tx, notifications } = createHarness({
      subjects: [SUBJECT],
    });
    await service.runTick(SUNDAY_0930_LOCAL);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Idempotency row first, inside the SAME transaction as everything else.
    const [{ data: tickData }] = tx.pollWeeklyTick.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(tickData.placeId).toBe(PLACE_ID);
    expect(tickData.weekOf).toBe(WEEK_OF);
    // Birth certificate: written AT publish, ALREADY archived (no ready pool).
    const [topicData] = topicCreateManyRows(tx);
    expect(topicData.status).toBe('archived');
    expect(topicData.placeId).toBe(PLACE_ID);
    expect(
      (topicData.metadata as { birthCertificate: unknown }).birthCertificate,
    ).toMatchObject({
      kind: 'subject',
      demandMass: 40,
      cooldownAvailability: 1,
    });
    // The poll itself: place-keyed, active, 7-day window (K1).
    const [pollData] = pollCreateManyRows(tx);
    expect(pollData.placeId).toBe(PLACE_ID);
    expect(pollData.state).toBe('active');
    expect(
      (pollData.metadata as { closeWindowDays: number }).closeWindowDays,
    ).toBe(7);
    expect((pollData.metadata as { weekOf: string }).weekOf).toBe(WEEK_OF);
    // The poll row references its topic through the client-minted id pair.
    expect(pollData.topicId).toBe(topicCreateManyRows(tx)[0].topicId);
    // Supply state (spend included) committed in the same transaction.
    expect(tx.pollPlaceSupply.upsert).toHaveBeenCalledTimes(1);
    // Red-team 1c: the notification queue rows are written THROUGH the same
    // transaction client — a crash can never publish polls but lose the push.
    expect(notifications.queuePollReleaseForPlace).toHaveBeenCalledTimes(1);
    const [payload, dbClient] = notifications.queuePollReleaseForPlace.mock
      .calls[0] as [{ placeId: string; pollIds: string[] }, unknown];
    expect(payload).toMatchObject({ placeId: PLACE_ID });
    expect(payload.pollIds).toEqual(
      pollCreateManyRows(tx).map((row) => row.pollId),
    );
    expect(dbClient).toBe(tx);
  });

  it('IDEMPOTENT (pre-filter): an existing (placeId, weekOf) tick publishes nothing', async () => {
    const { service, prisma } = createHarness({
      subjects: [SUBJECT],
      existingTicks: [{ placeId: PLACE_ID, weekOf: WEEK_OF }],
    });
    await service.runTick(SUNDAY_0930_LOCAL);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('IDEMPOTENT (race): the unique tick key aborts the transaction before any poll row is written', async () => {
    const { service, tx } = createHarness({
      subjects: [SUBJECT],
      tickCreateRejects: true,
    });
    await expect(service.runTick(SUNDAY_0930_LOCAL)).resolves.toBeUndefined();
    expect(tx.pollTopic.createMany).not.toHaveBeenCalled();
    expect(tx.poll.createMany).not.toHaveBeenCalled();
    expect(tx.pollPlaceSupply.upsert).not.toHaveBeenCalled();
  });

  it('fires ONLY inside the local Sunday ritual window', async () => {
    const { service, prisma } = createHarness({ subjects: [SUBJECT] });
    await service.runTick(WEDNESDAY);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips the candidate scan entirely in hours where NO zone on earth is inside the Sunday window (red-team 3a)', async () => {
    const { service, demandMass, prisma } = createHarness({
      subjects: [SUBJECT],
    });
    await service.runTick(WEDNESDAY);
    expect(demandMass.placesWithAnySignal).not.toHaveBeenCalled();
    expect(prisma.place.findMany).not.toHaveBeenCalled();
  });

  it('credit with NO ranked subject publishes the structural bootstrap poll', async () => {
    const { service, tx } = createHarness({ subjects: [], mass: 30 });
    await service.runTick(SUNDAY_0930_LOCAL);

    const [topicData] = topicCreateManyRows(tx);
    expect(topicData.topicType).toBe('best_restaurants');
    expect(topicData.title).toBe('Best restaurants in Austin');
    const [pollData] = pollCreateManyRows(tx);
    expect(pollData.axis).toMatchObject({
      targetType: 'restaurant',
      marketHint: 'Austin',
    });
  });

  it('warm start sizes the cohort from the §4 prediction (mass 120 at priors → 8 polls, subjects permitting)', async () => {
    const subjects = Array.from({ length: 12 }, (_, i) => ({
      ...SUBJECT,
      subjectId: `${i}`.padStart(8, '0') + '-0000-0000-0000-000000000000',
      mass: 40 - i,
    }));
    const { service, tx } = createHarness({ subjects, mass: 120 });
    await service.runTick(SUNDAY_0930_LOCAL);
    expect(pollCreateManyRows(tx)).toHaveLength(8);
    // Highest-scoring subject first (demandMass × cooldown × resurgence).
    const firstTopic = topicCreateManyRows(tx)[0].metadata as {
      birthCertificate: { rank: number };
    };
    expect(firstTopic.birthCertificate.rank).toBe(1);
  });

  it('§17 ONE SEARCHER NEVER SEEDS (red-team 2a/1c): a stateless place with sub-1 creditRate writes NO rows at all — no tick, no supply state, no polls', async () => {
    // mass 1 = a single actor's single act; creditRate = 1/15 << 1.
    const { service, prisma, notifications } = createHarness({
      subjects: [SUBJECT],
      mass: 1,
    });
    await service.runTick(SUNDAY_0930_LOCAL);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(notifications.queuePollReleaseForPlace).not.toHaveBeenCalled();
  });

  describe('cohort closure is a weekOf-LABEL judgment (red-team 1a)', () => {
    it('a cohort launched last Sunday closes at this Sunday tick even when < 7·24h of wall-clock has elapsed', async () => {
      const { service } = createHarness({
        // Launched 30s AFTER this tick's wall-clock hour ⇒ elapsed
        // 6d23h59m30s < 7d — the old wall-clock close missed this forever.
        harvestPolls: [
          harvestPoll({ launchedAt: new Date('2026-07-12T14:30:30Z') }),
        ],
      });
      const outcomes = await (
        service as unknown as {
          harvestCohortOutcomes: (
            now: Date,
          ) => Promise<{ placeId: string; weekOf: string }[]>;
        }
      ).harvestCohortOutcomes(SUNDAY_0930_LOCAL);
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0]).toMatchObject({
        placeId: PLACE_ID,
        weekOf: LAST_WEEK_OF,
      });
    });

    it('DST spring-forward Sunday still closes the cohort (labels are calendar math, not ms)', async () => {
      // US spring-forward 2026-03-08: the wall-clock week is 6d23h.
      const { service } = createHarness({
        harvestPolls: [
          harvestPoll({
            launchedAt: new Date('2026-03-01T15:00:00Z'), // 09:00 CST
            metadata: { weekOf: '2026-03-01' },
          }),
        ],
      });
      const outcomes = await (
        service as unknown as {
          harvestCohortOutcomes: (now: Date) => Promise<{ weekOf: string }[]>;
        }
      ).harvestCohortOutcomes(new Date('2026-03-08T14:30:00Z')); // 09:30 CDT
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].weekOf).toBe('2026-03-01');
    });

    it('HARVEST READS STAMPS, NOT HISTORY (poll-supply swap): attentionMass comes from the birth certificate; no launch-time mass re-evaluation', async () => {
      const { service, demandMass } = createHarness({
        harvestPolls: [harvestPoll()],
      });
      const outcomes = await (
        service as unknown as {
          harvestCohortOutcomes: (
            now: Date,
          ) => Promise<{ attentionMass: number }[]>;
        }
      ).harvestCohortOutcomes(SUNDAY_0930_LOCAL);
      expect(outcomes[0].attentionMass).toBe(STAMPED_LAUNCH_MASS);
      // The retired historical read is GONE from the reader surface — the
      // harvest cannot re-evaluate history even by accident.
      expect(
        (demandMass as Record<string, unknown>).placeDemandMassAt,
      ).toBeUndefined();
      expect(demandMass.placeDemandMass).not.toHaveBeenCalled();
    });

    it('a stampless legacy cohort observes attentionMass 0 (conversion/yield observation skipped, never fabricated)', async () => {
      const { service } = createHarness({
        harvestPolls: [harvestPoll({ metadata: { weekOf: LAST_WEEK_OF } })],
      });
      const outcomes = await (
        service as unknown as {
          harvestCohortOutcomes: (
            now: Date,
          ) => Promise<{ attentionMass: number }[]>;
        }
      ).harvestCohortOutcomes(SUNDAY_0930_LOCAL);
      expect(outcomes[0].attentionMass).toBe(0);
    });

    it('a cohort launched THIS ritual week is not closed yet', async () => {
      const { service } = createHarness({
        harvestPolls: [
          harvestPoll({
            launchedAt: new Date('2026-07-19T14:30:10Z'),
            metadata: { weekOf: WEEK_OF },
          }),
        ],
      });
      const outcomes = await (
        service as unknown as {
          harvestCohortOutcomes: (now: Date) => Promise<unknown[]>;
        }
      ).harvestCohortOutcomes(SUNDAY_0930_LOCAL);
      expect(outcomes).toHaveLength(0);
    });
  });

  it('median-test evidence is consumed ONCE: five tick cycles with no NEW cohort hold the frontier (red-team 2b)', async () => {
    // One stale cohort (weekOf 2026-07-05) that the 2026-07-12 tick already
    // consumed (creditUpdatedAt in week 2026-07-12). Every later tick must
    // treat it as old news: frontier held at 4 for five straight weeks.
    let state: Record<string, unknown> = {
      placeId: PLACE_ID,
      frontier: 4,
      phase: 'learned',
      credit: new Prisma.Decimal(10),
      creditUpdatedAt: new Date('2026-07-12T14:30:00Z'),
    };
    const subjects = Array.from({ length: 6 }, (_, i) => ({
      ...SUBJECT,
      subjectId: `${i}`.padStart(8, '0') + '-0000-0000-0000-000000000000',
    }));
    const frontiers: number[] = [];
    for (let week = 0; week < 5; week += 1) {
      const { service, tx, prisma } = createHarness({
        subjects,
        mass: 100,
        harvestPolls: [
          harvestPoll({
            launchedAt: new Date('2026-07-05T14:30:00Z'),
            metadata: {
              weekOf: TWO_WEEKS_AGO_OF,
              birthCertificate: {
                controller: { weeklyDemandMass: STAMPED_LAUNCH_MASS },
              },
            },
          }),
        ],
        supplyState: state,
      });
      const now = new Date(
        SUNDAY_0930_LOCAL.getTime() + week * 7 * 24 * 60 * 60 * 1000,
      );
      await service.runTick(now);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      const [{ where, create, update }] = tx.pollPlaceSupply.upsert.mock
        .calls[0] as [
        {
          where: { placeId: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        },
      ];
      expect(where.placeId).toBe(PLACE_ID);
      frontiers.push(update.frontier as number);
      expect(create.frontier).toBe(update.frontier);
      state = {
        placeId: PLACE_ID,
        frontier: update.frontier,
        phase: update.phase,
        credit: update.credit,
        creditUpdatedAt: now,
      };
    }
    expect(frontiers).toEqual([4, 4, 4, 4, 4]);
  });

  describe('the cooldown GATES, not just ranks (red-team 2d)', () => {
    const lastWeekTopic = {
      placeId: PLACE_ID,
      topicType: 'best_dish',
      targetDishId: DISH_ID,
      targetRestaurantId: null,
      createdAt: new Date('2026-07-12T14:30:00Z'),
      metadata: { weekOf: LAST_WEEK_OF },
    };

    it('a subject-pool-of-1 place does NOT re-poll the same subject the next week (falls to bootstrap)', async () => {
      const { service, tx } = createHarness({
        subjects: [SUBJECT],
        mass: 30,
        cooldownTopics: [lastWeekTopic],
      });
      await service.runTick(SUNDAY_0930_LOCAL);
      const topics = topicCreateManyRows(tx);
      expect(topics).toHaveLength(1);
      expect(topics[0].topicType).toBe('best_restaurants'); // not the subject
    });

    it('the subject becomes available again once the ramp recovers (one full window past close — two weeks at weekly cadence)', async () => {
      const { service, tx } = createHarness({
        subjects: [SUBJECT],
        mass: 30,
        cooldownTopics: [
          {
            ...lastWeekTopic,
            createdAt: new Date('2026-07-05T14:30:00Z'),
            metadata: { weekOf: TWO_WEEKS_AGO_OF },
          },
        ],
      });
      await service.runTick(SUNDAY_0930_LOCAL);
      const topics = topicCreateManyRows(tx);
      expect(topics).toHaveLength(1);
      expect(topics[0].topicType).toBe('best_dish');
      expect(topics[0].targetDishId).toBe(DISH_ID);
    });

    it('the bootstrap obeys the SAME gate: no weekly re-publish while the prior bootstrap window just closed', async () => {
      const { service, tx, notifications } = createHarness({
        subjects: [],
        mass: 30,
        cooldownTopics: [
          {
            placeId: PLACE_ID,
            topicType: 'best_restaurants',
            targetDishId: null,
            targetRestaurantId: null,
            createdAt: new Date('2026-07-12T14:30:00Z'),
            metadata: { weekOf: LAST_WEEK_OF },
          },
        ],
      });
      await service.runTick(SUNDAY_0930_LOCAL);
      // Publish 0 — but the tick + supply bookkeeping still commit.
      expect(tx.pollTopic.createMany).not.toHaveBeenCalled();
      expect(tx.poll.createMany).not.toHaveBeenCalled();
      expect(notifications.queuePollReleaseForPlace).not.toHaveBeenCalled();
      const [{ data: tickData }] = tx.pollWeeklyTick.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(tickData.publishedCount).toBe(0);
    });

    it('the bootstrap re-publishes once ITS ramp recovers', async () => {
      const { service, tx } = createHarness({
        subjects: [],
        mass: 30,
        cooldownTopics: [
          {
            placeId: PLACE_ID,
            topicType: 'best_restaurants',
            targetDishId: null,
            targetRestaurantId: null,
            createdAt: new Date('2026-07-05T14:30:00Z'),
            metadata: { weekOf: TWO_WEEKS_AGO_OF },
          },
        ],
      });
      await service.runTick(SUNDAY_0930_LOCAL);
      const topics = topicCreateManyRows(tx);
      expect(topics).toHaveLength(1);
      expect(topics[0].topicType).toBe('best_restaurants');
    });
  });
});
