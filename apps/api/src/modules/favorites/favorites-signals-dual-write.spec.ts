import 'reflect-metadata';
import { FavoritesService } from './favorites.service';
import { SignalsService } from '../signals/signals.service';

// DUAL-WRITE milestone spec (master plan §22): a FOOD favorite must still
// carry geo — a food entityId is not a restaurantId, so the signal resolves
// the food's restaurant via its most-evidenced connection (red-team finding
// F: the ledger is append-only, a favorite written without geo can never be
// backfilled).

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACTOR_ID = '22222222-2222-2222-2222-222222222222';
const FOOD_ID = '33333333-3333-3333-3333-333333333333';
const RESTAURANT_ID = '44444444-4444-4444-4444-444444444444';

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

function createHarness(entityType: 'food' | 'restaurant') {
  const favoriteRow = {
    favoriteId: '55555555-5555-5555-5555-555555555555',
    userId: USER_ID,
    entityId: FOOD_ID,
    entityType,
    createdAt: new Date('2026-07-19T12:00:00Z'),
    entity: {
      entityId: FOOD_ID,
      name: 'Birria Tacos',
      type: entityType,
      city: 'Austin',
    },
  };
  const tx = {
    userFavorite: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(favoriteRow),
      update: jest.fn(),
    },
    userFavoriteEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    entity: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ entityId: FOOD_ID, type: entityType }),
    },
    $transaction: jest.fn((fn: (transaction: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    // SignalsService lookups (shared prisma mock).
    signal: {
      create: jest
        .fn<Promise<unknown>, SignalCreateArgs>()
        .mockResolvedValue({}),
    },
    signalActor: {
      upsert: jest.fn().mockResolvedValue({ actorId: ACTOR_ID }),
    },
    connection: {
      findFirst: jest.fn().mockResolvedValue({ restaurantId: RESTAURANT_ID }),
    },
    restaurantLocation: {
      findFirst: jest
        .fn()
        .mockResolvedValue({ latitude: '30.25', longitude: '-97.75' }),
    },
  };
  const signals = new SignalsService(prisma as never, createLogger() as never);
  const service = new FavoritesService(
    prisma as never,
    createLogger() as never,
    signals,
  );
  return { service, prisma };
}

describe('favorite_added dual-write (§3 signal geo)', () => {
  it('a FOOD favorite without locationId resolves geo via connection -> restaurant location', async () => {
    const { service, prisma } = createHarness('food');

    await service.addFavorite(USER_ID, { entityId: FOOD_ID } as never);
    await flush();

    // Finding F: food -> most-evidenced connection -> restaurant location.
    expect(prisma.connection.findFirst).toHaveBeenCalledWith({
      where: { foodId: FOOD_ID },
      orderBy: { mentionCount: 'desc' },
      select: { restaurantId: true },
    });
    expect(prisma.signal.create).toHaveBeenCalledTimes(1);
    const data = prisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('favorite_added');
    expect(data.subjectType).toBe('entity');
    expect(data.subjectId).toBe(FOOD_ID);
    expect(data.geoMinLat).toBe(30.25);
    expect(data.geoMaxLat).toBe(30.25);
    expect(data.geoMinLng).toBe(-97.75);
    expect(data.geoMaxLng).toBe(-97.75);
  });

  it('a RESTAURANT favorite without locationId still resolves via its own location (no connection lookup)', async () => {
    const { service, prisma } = createHarness('restaurant');

    await service.addFavorite(USER_ID, { entityId: FOOD_ID } as never);
    await flush();

    expect(prisma.connection.findFirst).not.toHaveBeenCalled();
    expect(prisma.signal.create).toHaveBeenCalledTimes(1);
    const data = prisma.signal.create.mock.calls[0][0].data;
    expect(data.kind).toBe('favorite_added');
    expect(data.geoMinLat).toBe(30.25);
  });
});
