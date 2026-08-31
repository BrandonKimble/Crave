import 'reflect-metadata';
import { PollLeaderboardSubjectType, Prisma } from '@prisma/client';
import { PollsService } from './polls.service';
import { judgedVocabularyDouble } from '../../shared/testing/judged-vocabulary-double';
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
      // markPollInteraction: the interaction touch that makes the safety-net
      // sweep's updatedAt filter able to see comment/vote activity.
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn().mockResolvedValue({
        state: 'active',
        question: 'Best birria in Austin?',
        placeId: options.pollPlaceId ?? null,
        topic: {
          targetDishId: TARGET_DISH_ID,
          targetPlaceId: null,
          targetItemAttributeId: null,
          targetPlaceAttributeId: null,
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
    {} as never, // llmService
    {} as never, // entityTextSearch
    signals, // signals ledger (§3 dual-write)
    {} as never, // placesCatalog (feed-only; unused in this spec)
    {} as never, // viewportVerdict (feed-only; unused in this spec)
    { blockedPeerIds: jest.fn().mockResolvedValue(new Set()) } as never, // blocks
    {
      loadLabels: () => Promise.resolve(new Map()),
      displayLabel: (entity: { name: string }) => entity.name,
      localizeRows: (rows: unknown[]) => Promise.resolve(rows),
    } as never,
    judgedVocabularyDouble() as never,
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

  it('a vote on a PLACE-keyed poll ANCHORS to the place and carries NO geo at all (docket #3; was P5b / red-team 3e)', async () => {
    // Evolution of this pin, kept as history because each stage was a real
    // defect: (1) the signal carried the place's bounding RECTANGLE — Austin
    // bled into 31 places; (2) P5b anchored it but NOT NULL geo forced a
    // manufactured centroid, whose lookup once silently DROPPED acts;
    // (3) docket #3 made geo nullable — the anchor IS the where, and no
    // place lookup happens on the write path at all.
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

    // No centroid manufacture — the write needs nothing from places.
    expect(signalsPrisma.place.findUnique).not.toHaveBeenCalled();
    expect(signalsPrisma.signal.create).toHaveBeenCalledTimes(1);
    const data = signalsPrisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('poll_vote');
    expect(data.placeId).toBe(PLACE_ID); // the WHERE of the act
    expect(data.geoMinLat).toBeNull();
    expect(data.geoMinLng).toBeNull();
    expect(data.geoMaxLat).toBeNull();
    expect(data.geoMaxLng).toBeNull();
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

  it('a concurrent double-tap loser (create → P2002) returns endorsed:true WITHOUT throwing or double-appending the signal (F9440)', async () => {
    const { service, signalsPrisma, pollsPrisma } = createHarness();
    // Both taps read existing=null (findUnique default), then this tap loses the
    // create race: the composite PK is already taken by the winner.
    pollsPrisma.pollEndorsement.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    const result = await service.togglePollEndorsement(
      POLL_ID,
      ENDORSED_SUBJECT_ID,
      USER_ID,
      PollLeaderboardSubjectType.entity,
    );
    await flush();

    // Idempotent: the loser reports the winner's outcome, not a 500.
    expect(result.endorsed).toBe(true);
    // The winner already recorded the append-only poll_vote; the loser must NOT
    // append a second one. Reverting the F9440 catch makes this throw (RED).
    expect(signalsPrisma.signal.create).not.toHaveBeenCalled();
  });
});
