import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { PollsService } from './polls.service';

// ORDERING IS THE INVARIANT, not "moderation exists".
//
// Entity resolution is the spend boundary: it can call Google Places and it
// CREATES a permanent entity row. Moderation of the poll title used to run
// only AFTER that, so a poll whose restaurant/dish name was abusive was
// rejected at the door but still cost us a Places lookup and still left an
// orphaned entity carrying the abusive text in our catalog forever.
//
// These tests are RED against that ordering: they assert the seed service is
// never TOUCHED when the supplied name fails moderation.

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

function createHarness() {
  const tx = {
    pollTopic: { create: jest.fn().mockResolvedValue({ topicId: 'topic-1' }) },
    poll: {
      create: jest.fn().mockResolvedValue({
        pollId: 'poll-1',
        placeId: PLACE_ID,
        question: 'What should I order at Franklin Barbecue?',
        topic: null,
      }),
    },
    pollOption: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
    entity: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: unknown) => unknown) => fn(tx)),
    pollCreationAttempt: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
    },
    poll: {
      count: jest.fn().mockResolvedValue(0),
      create: jest
        .fn()
        .mockResolvedValue({ pollId: 'poll-1', placeId: PLACE_ID }),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    pollLeaderboardEntry: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
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
  const moderation = {
    moderateText: jest.fn().mockResolvedValue({ kind: 'allowed' }),
  };
  const pollEntitySeedService = {
    resolveRestaurant: jest.fn(),
    resolveFood: jest.fn(),
    resolveAttribute: jest.fn(),
  };
  const service = new PollsService(
    prisma as never,
    createLogger() as never,
    { sanitizeOrThrow: jest.fn((value: string) => value) } as never,
    moderation as never,
    pollEntitySeedService as never,
    { emitPollUpdate: jest.fn() } as never,
    {} as never, // llmService (typed path never asks the LLM for a verdict)
    {} as never, // entityTextSearch
    { record: jest.fn(), centroidGeoFromPlace: jest.fn() } as never,
    placesCatalog as never,
    {} as never, // viewportVerdict
    { blockedPeerIds: jest.fn().mockResolvedValue(new Set()) } as never, // blocks
  );
  return { service, moderation, pollEntitySeedService, prisma, tx };
}

describe('poll creation: moderation runs BEFORE the spend boundary', () => {
  it('a restaurant name that fails moderation never reaches resolveRestaurant (no Places spend, no orphan entity)', async () => {
    const { service, moderation, pollEntitySeedService, tx } = createHarness();
    // Description passes; the NAME is what is refused.
    moderation.moderateText.mockImplementation((text: string) =>
      Promise.resolve(
        text === 'Slur Diner'
          ? { kind: 'blocked', reason: 'hate' }
          : { kind: 'allowed' },
      ),
    );

    await expect(
      service.createPoll(
        {
          topicType: 'what_to_order',
          targetRestaurantName: 'Slur Diner',
          description: 'A perfectly ordinary description',
          bounds: BOUNDS,
        } as never,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(pollEntitySeedService.resolveRestaurant).not.toHaveBeenCalled();
    expect(tx.poll.create).not.toHaveBeenCalled();
  });

  it('a dish name that fails moderation never reaches resolveFood', async () => {
    const { service, moderation, pollEntitySeedService } = createHarness();
    moderation.moderateText.mockImplementation((text: string) =>
      Promise.resolve(
        text === 'Slur Tacos'
          ? { kind: 'blocked', reason: 'hate' }
          : { kind: 'allowed' },
      ),
    );

    await expect(
      service.createPoll(
        {
          topicType: 'best_dish',
          targetDishName: 'Slur Tacos',
          description: 'A perfectly ordinary description',
          bounds: BOUNDS,
        } as never,
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(pollEntitySeedService.resolveFood).not.toHaveBeenCalled();
  });

  it('a name the user PICKED from our own catalog (by id) is not re-moderated — it is already ours', async () => {
    const { service, moderation, pollEntitySeedService } = createHarness();
    pollEntitySeedService.resolveRestaurant.mockResolvedValue({
      entityId: 'entity-1',
      name: 'Franklin Barbecue',
    });

    await service.createPoll(
      {
        topicType: 'what_to_order',
        targetRestaurantId: '55555555-5555-5555-5555-555555555555',
        targetRestaurantName: 'Franklin Barbecue',
        description: 'A perfectly ordinary description',
        bounds: BOUNDS,
      } as never,
      USER_ID,
    );

    expect(pollEntitySeedService.resolveRestaurant).toHaveBeenCalledTimes(1);
    const moderated = (
      moderation.moderateText.mock.calls as unknown as string[][]
    ).map((call) => call[0]);
    expect(moderated).not.toContain('Franklin Barbecue');
  });
});
