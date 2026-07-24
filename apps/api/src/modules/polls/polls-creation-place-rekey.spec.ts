import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { PollsService } from './polls.service';

// Phase C re-key: user poll creation attaches to the PLACE CATALOG — placeId
// = smallestContaining(creation-context bbox), marketKey never written on new
// rows — and the 2/user/place/week anti-spam keys per PLACE.

const USER_ID = '11111111-1111-1111-1111-111111111111';
const PLACE_ID = '44444444-4444-4444-4444-444444444444';

const PLACE = {
  placeId: PLACE_ID,
  name: 'Round Rock',
  subdivisionCode: 'TX',
  countryCode: 'US',
  centroidLat: 30.5,
  centroidLng: -97.7,
};

const BOUNDS = {
  northEast: { lat: 30.55, lng: -97.65 },
  southWest: { lat: 30.45, lng: -97.75 },
};

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

function createHarness(options: { priorPollCount?: number } = {}) {
  const createdPoll = {
    pollId: 'poll-1',
    placeId: PLACE_ID,
    question: 'Where should I eat tonight?',
    topic: null,
  };
  const prisma = {
    poll: {
      count: jest
        .fn<Promise<number>, [{ where: Record<string, unknown> }]>()
        .mockResolvedValue(options.priorPollCount ?? 0),
      create: jest
        .fn<Promise<typeof createdPoll>, [{ data: Record<string, unknown> }]>()
        .mockResolvedValue(createdPoll),
    },
    place: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ placeId: PLACE_ID, name: PLACE.name }]),
    },
  };
  const placesCatalog = {
    smallestContaining: jest.fn().mockResolvedValue(PLACE),
    sketchChain: jest.fn().mockResolvedValue([PLACE]),
  };
  const sanitizer = {
    sanitizeOrThrow: jest.fn((value: string) => value),
  };
  const moderation = {
    moderateText: jest.fn().mockResolvedValue({ allowed: true }),
  };
  const llmService = {
    // Discussion verdict -> the discussion creation path (no entity seeding).
    inferPollSubject: jest
      .fn()
      .mockResolvedValue({ mode: 'discussion', axis: null }),
  };
  const placesPromotions = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    noteHeaderAnswer: jest.fn(),
  };
  const service = new PollsService(
    prisma as never,
    createLogger() as never,
    sanitizer as never,
    moderation as never,
    {} as never, // pollEntitySeedService
    { emitPollUpdate: jest.fn() } as never, // gateway
    llmService as never,
    {} as never, // entityTextSearch
    { record: jest.fn(), bboxFromPlace: jest.fn() } as never, // signals
    placesCatalog as never,
    placesPromotions as never,
  );
  return { service, prisma, placesCatalog, placesPromotions };
}

describe('poll creation place re-key (Phase C)', () => {
  it('resolves placeId = smallestContaining(creation bounds) and writes placeId, never marketKey', async () => {
    const { service, prisma, placesCatalog } = createHarness();

    await service.createPoll(
      { question: 'Where should I eat tonight?', bounds: BOUNDS } as never,
      USER_ID,
    );

    // The creation context bbox (wrap-aware SW/NE mapping) is the containment
    // query.
    expect(placesCatalog.smallestContaining).toHaveBeenCalledWith({
      minLat: 30.45,
      maxLat: 30.55,
      minLng: -97.75,
      maxLng: -97.65,
    });
    expect(prisma.poll.create).toHaveBeenCalledTimes(1);
    const data = prisma.poll.create.mock.calls[0][0].data;
    expect(data.placeId).toBe(PLACE_ID);
    expect(data).not.toHaveProperty('marketKey');
  });

  it("§2(a) tier-2 promotion: creating a poll enqueues the place's earned polygon moment (fire-and-forget)", async () => {
    const { service, placesPromotions } = createHarness();
    await service.createPoll(
      { question: 'Where should I eat tonight?', bounds: BOUNDS } as never,
      USER_ID,
    );
    expect(placesPromotions.enqueue).toHaveBeenCalledWith(
      PLACE_ID,
      'poll_created',
    );
  });

  it('no containing place -> §2 quota-drought fallback: the poll is created against a minted "this area near (lat, lng)" place — creation NEVER blocks (wave-5 §17c)', async () => {
    const { service, placesCatalog, prisma } = createHarness();
    placesCatalog.smallestContaining.mockResolvedValue(null);
    const fallbackPlace = {
      ...PLACE,
      placeId: '55555555-5555-5555-5555-555555555555',
      name: 'this area near (30.50, -97.70)',
      providerLevelCode: 'areaFallback',
      countryCode: 'ZZ',
    };
    placesCatalog.sketchChain.mockResolvedValue([fallbackPlace]);

    await service.createPoll(
      { question: 'Best tacos?', bounds: BOUNDS } as never,
      USER_ID,
    );

    // The mint goes through the ordinary sketch path: identity-law dedupe,
    // bbox = the creation viewport, ~1km-rounded center in the name.
    expect(placesCatalog.sketchChain).toHaveBeenCalledWith([
      expect.objectContaining({
        name: 'this area near (30.50, -97.70)',
        providerLevelCode: 'areaFallback',
        countryCode: 'ZZ',
        provider: 'fallback',
        bbox: { minLat: 30.45, maxLat: 30.55, minLng: -97.75, maxLng: -97.65 },
      }),
    ]);
    expect(prisma.poll.create).toHaveBeenCalledTimes(1);
    expect(prisma.poll.create.mock.calls[0][0].data.placeId).toBe(
      fallbackPlace.placeId,
    );
  });

  it('NO resolvable geo at all (no bounds, no legacy market) -> still rejected: nothing to anchor to', async () => {
    const { service, placesCatalog, prisma } = createHarness();
    placesCatalog.smallestContaining.mockResolvedValue(null);

    await expect(
      service.createPoll({ question: 'Best tacos?' } as never, USER_ID),
    ).rejects.toThrow(BadRequestException);
    expect(placesCatalog.sketchChain).not.toHaveBeenCalled();
    expect(prisma.poll.create).not.toHaveBeenCalled();
  });

  it('anti-spam: the 2/user/week cap keys per PLACE', async () => {
    const { service, prisma } = createHarness({ priorPollCount: 2 });

    await expect(
      service.createPoll(
        { question: 'Best tacos?', bounds: BOUNDS } as never,
        USER_ID,
      ),
    ).rejects.toThrow(/polls this week in this area/);

    const where = prisma.poll.count.mock.calls[0][0].where;
    expect(where.createdByUserId).toBe(USER_ID);
    expect(where.placeId).toBe(PLACE_ID);
    expect(where).not.toHaveProperty('marketKey');
    expect(prisma.poll.create).not.toHaveBeenCalled();
  });
});
