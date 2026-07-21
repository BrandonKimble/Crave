import 'reflect-metadata';
import { PollLeaderboardSubjectType } from '@prisma/client';
import { PollsService } from './polls.service';
import { SignalsService } from '../signals/signals.service';

// DUAL-WRITE milestone spec (master plan §22): a poll endorsement records a
// §3 poll_vote signal whose META carries the endorsed candidate itself — the
// mutable pollEndorsement row can be deleted, so the append-only ledger must
// hold WHAT was voted for, not just which poll (red-team finding D).

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACTOR_ID = '22222222-2222-2222-2222-222222222222';
const POLL_ID = '33333333-3333-3333-3333-333333333333';
const TARGET_DISH_ID = '44444444-4444-4444-4444-444444444444';
const ENDORSED_SUBJECT_ID = '55555555-5555-5555-5555-555555555555';

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

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

type SignalCreateArgs = [{ data: Record<string, unknown> }];

function createHarness(
  options: { alreadyEndorsed?: boolean; pollPlaceId?: string | null } = {},
) {
  const signalsPrisma = {
    signal: {
      create: jest
        .fn<Promise<unknown>, SignalCreateArgs>()
        .mockResolvedValue({}),
    },
    signalActor: {
      upsert: jest.fn().mockResolvedValue({ actorId: ACTOR_ID }),
    },
    market: {
      findFirst: jest.fn().mockResolvedValue({
        bboxNeLat: '30.4',
        bboxNeLng: '-97.6',
        bboxSwLat: '30.1',
        bboxSwLng: '-97.9',
        centerLatitude: '30.27',
        centerLongitude: '-97.74',
      }),
    },
    place: {
      findUnique: jest.fn().mockResolvedValue({
        bboxMinLat: '29.5',
        bboxMinLng: '-98.2',
        bboxMaxLat: '30.9',
        bboxMaxLng: '-97.2',
        centroidLat: '30.27',
        centroidLng: '-97.74',
      }),
    },
  };
  const signals = new SignalsService(
    signalsPrisma as never,
    createLogger() as never,
  );
  const pollsPrisma = {
    poll: {
      findUnique: jest.fn().mockResolvedValue({
        state: 'active',
        question: 'Best birria in Austin?',
        marketKey: 'austin',
        placeId: options.pollPlaceId ?? null,
        topic: {
          targetDishId: TARGET_DISH_ID,
          targetRestaurantId: null,
          targetFoodAttributeId: null,
          targetRestaurantAttributeId: null,
        },
      }),
    },
    pollLeaderboardEntry: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ subjectId: ENDORSED_SUBJECT_ID }),
    },
    pollEndorsement: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.alreadyEndorsed ? { userId: USER_ID } : null,
        ),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new PollsService(
    pollsPrisma as never, // prisma
    createLogger() as never, // loggerService
    {} as never, // sanitizer
    {} as never, // moderation
    {} as never, // pollEntitySeedService
    {} as never, // gateway
    {} as never, // userEventService
    {} as never, // llmService
    {} as never, // entityTextSearch
    signals, // signals ledger (§3 dual-write)
    {} as never, // placesCatalog (feed-only; unused in this spec)
    {
      enqueue: jest.fn().mockResolvedValue(undefined),
      noteHeaderAnswer: jest.fn(),
    } as never, // placesPromotions
  );
  const internals = service as unknown as {
    rebuildPollLeaderboard: (pollId: string) => Promise<void>;
    getPollLeaderboard: (
      pollId: string,
      viewerUserId?: string | null,
    ) => Promise<unknown>;
  };
  jest.spyOn(internals, 'rebuildPollLeaderboard').mockResolvedValue(undefined);
  jest.spyOn(internals, 'getPollLeaderboard').mockResolvedValue({
    entries: [],
  });
  return { service, signalsPrisma, pollsPrisma };
}

describe('poll endorsement dual-write (§3 poll_vote signal)', () => {
  it('meta carries the endorsed candidate (pollId + endorsedSubjectId/Type), subject stays the poll topic', async () => {
    // Every poll is place-keyed (legacy-poll expiry backfill) — the signal's
    // geo comes from the poll's place bbox.
    const { service, signalsPrisma } = createHarness({
      pollPlaceId: '88888888-8888-8888-8888-888888888888',
    });

    const result = await service.togglePollEndorsement(
      POLL_ID,
      ENDORSED_SUBJECT_ID,
      USER_ID,
      PollLeaderboardSubjectType.entity,
    );
    await flush();

    expect(result.endorsed).toBe(true);
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('poll_vote');
    // Subject = the poll's single target entity (unchanged).
    expect(data.subjectType).toBe('entity');
    expect(data.subjectId).toBe(TARGET_DISH_ID);
    // Finding D: the vote's content survives pollEndorsement deletion.
    expect(data.meta).toEqual({
      pollId: POLL_ID,
      endorsedSubjectId: ENDORSED_SUBJECT_ID,
      endorsedSubjectType: PollLeaderboardSubjectType.entity,
    });
  });

  it('a vote on a PLACE-keyed poll writes the signal with the PLACE bbox (red-team 3e: the closed loop for the 98.8% of places with no market)', async () => {
    const PLACE_ID = '99999999-9999-9999-9999-999999999999';
    const { service, signalsPrisma } = createHarness({
      pollPlaceId: PLACE_ID,
    });

    await service.togglePollEndorsement(
      POLL_ID,
      ENDORSED_SUBJECT_ID,
      USER_ID,
      PollLeaderboardSubjectType.entity,
    );
    await flush();

    expect(signalsPrisma.place.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { placeId: PLACE_ID } }),
    );
    // The legacy market path is never consulted for a placeId poll.
    expect(signalsPrisma.market.findFirst).not.toHaveBeenCalled();
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('poll_vote');
    expect(data).toMatchObject({
      geoMinLat: 29.5,
      geoMinLng: -98.2,
      geoMaxLat: 30.9,
      geoMaxLng: -97.2,
    });
  });

  it('un-endorsing (toggle off) writes NO signal — the ledger is append-only', async () => {
    const { service, signalsPrisma, pollsPrisma } = createHarness({
      alreadyEndorsed: true,
    });

    const result = await service.togglePollEndorsement(
      POLL_ID,
      ENDORSED_SUBJECT_ID,
      USER_ID,
      PollLeaderboardSubjectType.entity,
    );
    await flush();

    expect(result.endorsed).toBe(false);
    expect(pollsPrisma.pollEndorsement.delete).toHaveBeenCalledTimes(1);
    expect(signalsPrisma.signal.create).not.toHaveBeenCalled();
  });
});
