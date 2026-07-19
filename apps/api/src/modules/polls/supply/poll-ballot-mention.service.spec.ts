import 'reflect-metadata';
import { PollLeaderboardSubjectType } from '@prisma/client';
import { PollBallotMentionService } from './poll-ballot-mention.service';

// K6 (§4, definitional): each DISTINCT voter mints ONE structured mention
// (m=1, no upvote term) for their choice; the ballot bypasses LLM extraction
// and lands as a document of the place's poll_surface source.

const POLL_ID = '33333333-3333-3333-3333-333333333333';
const PLACE_ID = '99999999-9999-9999-9999-999999999999';
const USER_1 = '11111111-1111-1111-1111-111111111111';
const USER_2 = '22222222-2222-2222-2222-222222222222';
const REST_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REST_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FOOD_1 = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const RUN_ID = '44444444-4444-4444-4444-444444444444';
const DOC_ID = '55555555-5555-5555-5555-555555555555';
const INPUT_ID = '66666666-6666-6666-6666-666666666666';
const SOURCE_ID = '77777777-7777-7777-7777-777777777777';

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

function createHarness(options: {
  poll?: Record<string, unknown> | null;
  endorsements?: Record<string, unknown>[];
  existingDocument?: {
    documentId: string;
    activeExtractionRunId: string | null;
  } | null;
  existingEventCount?: number;
  redirects?: { fromEntityId: string; toEntityId: string }[];
}) {
  const tx = {
    sourceDocument: {
      create: jest.fn().mockResolvedValue({ documentId: DOC_ID }),
      update: jest.fn().mockResolvedValue({}),
    },
    extractionRun: {
      create: jest.fn().mockResolvedValue({ extractionRunId: RUN_ID }),
    },
    extractionInput: {
      create: jest.fn().mockResolvedValue({ inputId: INPUT_ID }),
    },
    extractionInputDocument: { create: jest.fn().mockResolvedValue({}) },
    restaurantEvent: { create: jest.fn().mockResolvedValue({}) },
    restaurantEntityEvent: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    poll: {
      findUnique: jest.fn().mockResolvedValue(
        options.poll === undefined
          ? {
              pollId: POLL_ID,
              placeId: PLACE_ID,
              question: 'Best tacos?',
              closedAt: new Date('2026-07-19T14:00:00Z'),
              launchedAt: new Date('2026-07-12T14:00:00Z'),
              createdAt: new Date('2026-07-12T14:00:00Z'),
            }
          : options.poll,
      ),
    },
    pollEndorsement: {
      findMany: jest.fn().mockResolvedValue(options.endorsements ?? []),
    },
    entityRedirect: {
      findMany: jest.fn().mockResolvedValue(options.redirects ?? []),
    },
    sourceDocument: {
      findUnique: jest.fn().mockResolvedValue(options.existingDocument ?? null),
    },
    restaurantEvent: {
      count: jest.fn().mockResolvedValue(options.existingEventCount ?? 0),
    },
    restaurantEntityEvent: {
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(
      async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    ),
  };
  const sources = {
    ensureForPlace: jest.fn().mockResolvedValue({ sourceId: SOURCE_ID }),
  };
  const projectionRebuild = {
    rebuildForRestaurants: jest
      .fn()
      .mockResolvedValue({ connectionIds: [], restaurantIds: [] }),
  };
  const service = new PollBallotMentionService(
    prisma as never,
    sources as never,
    projectionRebuild as never,
    createLogger() as never,
  );
  return { service, prisma, tx, sources, projectionRebuild };
}

function endorsement(
  userId: string,
  subjectId: string,
  subjectType: PollLeaderboardSubjectType,
  createdAt: string,
) {
  return { userId, subjectId, subjectType, createdAt: new Date(createdAt) };
}

describe('PollBallotMentionService — K6 vote→mention at graduation', () => {
  it('mints exactly ONE mention per distinct voter (latest standing choice wins), m=1 and NO upvote term', async () => {
    const { service, tx, projectionRebuild } = createHarness({
      endorsements: [
        endorsement(
          USER_1,
          REST_A,
          PollLeaderboardSubjectType.entity,
          '2026-07-13T00:00:00Z',
        ),
        // USER_1 later switched their vote — only REST_B may mint.
        endorsement(
          USER_1,
          REST_B,
          PollLeaderboardSubjectType.entity,
          '2026-07-15T00:00:00Z',
        ),
        endorsement(
          USER_2,
          REST_A,
          PollLeaderboardSubjectType.entity,
          '2026-07-14T00:00:00Z',
        ),
      ],
    });
    await service.mintForPoll(POLL_ID);

    expect(tx.restaurantEvent.create).toHaveBeenCalledTimes(2);
    const minted = tx.restaurantEvent.create.mock.calls.map(
      ([args]: [{ data: Record<string, unknown> }]) => args.data,
    );
    expect(minted.map((m) => m.restaurantId).sort()).toEqual([REST_A, REST_B]);
    // ONE per voter, keyed by voter — and no upvote term, ever.
    expect(new Set(minted.map((m) => m.mentionKey)).size).toBe(2);
    expect(minted.every((m) => m.sourceUpvotes === 0)).toBe(true);
    expect(minted.every((m) => m.evidenceType === 'poll_ballot')).toBe(true);
    // The ballot run becomes the document's active run (the events count).
    expect(tx.sourceDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { activeExtractionRunId: RUN_ID },
      }),
    );
    expect(projectionRebuild.rebuildForRestaurants).toHaveBeenCalledWith(
      expect.arrayContaining([REST_A, REST_B]),
    );
  });

  it('dish-axis choices mint a direct menu-item mention (the m=1 dish shape)', async () => {
    const { service, tx } = createHarness({
      endorsements: [
        endorsement(
          USER_1,
          `${REST_A}::${FOOD_1}`,
          PollLeaderboardSubjectType.connection,
          '2026-07-15T00:00:00Z',
        ),
      ],
    });
    await service.mintForPoll(POLL_ID);

    expect(tx.restaurantEvent.create).not.toHaveBeenCalled();
    expect(tx.restaurantEntityEvent.create).toHaveBeenCalledTimes(1);
    const [{ data }] = tx.restaurantEntityEvent.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.restaurantId).toBe(REST_A);
    expect(data.entityId).toBe(FOOD_1);
    expect(data.evidenceType).toBe('menu_item_food');
    expect(data.isMenuItem).toBe(true);
    expect(data.sourceUpvotes).toBe(0);
  });

  it('resolves choice ids through entity_redirects at read (§3 identity law)', async () => {
    const { service, tx } = createHarness({
      endorsements: [
        endorsement(
          USER_1,
          REST_A,
          PollLeaderboardSubjectType.entity,
          '2026-07-15T00:00:00Z',
        ),
      ],
      redirects: [{ fromEntityId: REST_A, toEntityId: REST_B }],
    });
    await service.mintForPoll(POLL_ID);
    const [{ data }] = tx.restaurantEvent.create.mock.calls[0] as [
      { data: Record<string, unknown> },
    ];
    expect(data.restaurantId).toBe(REST_B);
  });

  it('is idempotent: a document whose active run already carries events never re-mints', async () => {
    const { service, prisma, tx } = createHarness({
      endorsements: [
        endorsement(
          USER_1,
          REST_A,
          PollLeaderboardSubjectType.entity,
          '2026-07-15T00:00:00Z',
        ),
      ],
      existingDocument: { documentId: DOC_ID, activeExtractionRunId: RUN_ID },
      existingEventCount: 1,
    });
    await service.mintForPoll(POLL_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.restaurantEvent.create).not.toHaveBeenCalled();
  });

  it('skips legacy market-keyed polls (no placeId — no poll_surface room yet)', async () => {
    const { service, prisma } = createHarness({
      poll: {
        pollId: POLL_ID,
        placeId: null,
        question: 'q',
        closedAt: new Date(),
        launchedAt: new Date(),
        createdAt: new Date(),
      },
    });
    await service.mintForPoll(POLL_ID);
    expect(prisma.pollEndorsement.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips polls with zero voters (no ghost documents)', async () => {
    const { service, prisma } = createHarness({ endorsements: [] });
    await service.mintForPoll(POLL_ID);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
