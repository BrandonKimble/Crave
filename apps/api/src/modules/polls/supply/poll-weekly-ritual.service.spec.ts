import 'reflect-metadata';
import { Prisma } from '@prisma/client';
import { PollWeeklyRitualService } from './poll-weekly-ritual.service';
import { PollSupplyEstimators } from './poll-supply-estimators';

// §4 weekly ritual: one tick per place at Sunday 09:00 LOCAL; publish is
// ATOMIC (tick + poll rows + archived birth-certificate topics + supply
// state) with (placeId, weekOf-local) as the idempotency key.

const PLACE_ID = '99999999-9999-9999-9999-999999999999';
const DISH_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
// Sunday 2026-07-19 09:30 in America/Chicago (14:30Z).
const SUNDAY_0930_LOCAL = new Date('2026-07-19T14:30:00Z');
// Wednesday 2026-07-15 09:30 local.
const WEDNESDAY = new Date('2026-07-15T14:30:00Z');
const WEEK_OF = '2026-07-19';

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

function createHarness(
  options: {
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
  } = {},
) {
  const tx = {
    pollWeeklyTick: {
      create: options.tickCreateRejects
        ? jest.fn().mockRejectedValue(uniqueViolation())
        : jest.fn().mockResolvedValue({}),
    },
    pollTopic: {
      create: jest
        .fn()
        .mockResolvedValue({ topicId: '10101010-1010-1010-1010-101010101010' }),
    },
    poll: {
      create: jest
        .fn()
        .mockResolvedValue({ pollId: '20202020-2020-2020-2020-202020202020' }),
    },
    pollPlaceSupply: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    pollPlaceSupply: { findMany: jest.fn().mockResolvedValue([]) },
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
    poll: { findMany: jest.fn().mockResolvedValue([]) },
    pollTopic: { findMany: jest.fn().mockResolvedValue([]) },
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

const SUBJECT = {
  placeId: PLACE_ID,
  subjectId: DISH_ID,
  entityType: 'food' as const,
  entityName: 'breakfast taco',
  mass: 40,
  currentMass: 12,
  baselineWeeklyMass: 4,
};

describe('PollWeeklyRitualService — the §4 weekly ritual', () => {
  it('publishes ATOMICALLY through one transaction: tick row + archived birth-certificate topic + active poll + supply state', async () => {
    const { service, prisma, tx } = createHarness({ subjects: [SUBJECT] });
    await service.runTick(SUNDAY_0930_LOCAL);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Idempotency row first, inside the SAME transaction as everything else.
    const [{ data: tickData }] = tx.pollWeeklyTick.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(tickData.placeId).toBe(PLACE_ID);
    expect(tickData.weekOf).toBe(WEEK_OF);
    // Birth certificate: written AT publish, ALREADY archived (no ready pool).
    const [{ data: topicData }] = tx.pollTopic.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
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
    const [{ data: pollData }] = tx.poll.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(pollData.placeId).toBe(PLACE_ID);
    expect(pollData.state).toBe('active');
    expect(
      (pollData.metadata as { closeWindowDays: number }).closeWindowDays,
    ).toBe(7);
    expect((pollData.metadata as { weekOf: string }).weekOf).toBe(WEEK_OF);
    // Supply state (spend included) committed in the same transaction.
    expect(tx.pollPlaceSupply.upsert).toHaveBeenCalledTimes(1);
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
    expect(tx.pollTopic.create).not.toHaveBeenCalled();
    expect(tx.poll.create).not.toHaveBeenCalled();
    expect(tx.pollPlaceSupply.upsert).not.toHaveBeenCalled();
  });

  it('fires ONLY inside the local Sunday ritual window', async () => {
    const { service, prisma } = createHarness({ subjects: [SUBJECT] });
    await service.runTick(WEDNESDAY);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('credit with NO ranked subject publishes the structural bootstrap poll', async () => {
    const { service, tx } = createHarness({ subjects: [], mass: 30 });
    await service.runTick(SUNDAY_0930_LOCAL);

    const [{ data: topicData }] = tx.pollTopic.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(topicData.topicType).toBe('best_restaurants');
    expect(topicData.title).toBe('Best restaurants in Austin');
    const [{ data: pollData }] = tx.poll.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
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
    expect(tx.poll.create).toHaveBeenCalledTimes(8);
    // Highest-scoring subject first (demandMass × cooldown × resurgence).
    const firstTopic = (
      tx.pollTopic.create.mock.calls[0] as [{ data: { metadata: unknown } }]
    )[0].data.metadata as { birthCertificate: { rank: number } };
    expect(firstTopic.birthCertificate.rank).toBe(1);
  });
});
