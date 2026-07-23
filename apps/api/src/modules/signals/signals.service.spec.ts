import 'reflect-metadata';
import { SignalsService } from './signals.service';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACTOR_ID = '22222222-2222-2222-2222-222222222222';
const ENTITY_ID = '33333333-3333-3333-3333-333333333333';
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

type SignalCreateArgs = [{ data: Record<string, unknown> }];

function createPrisma() {
  return {
    signal: {
      create: jest
        .fn<Promise<unknown>, SignalCreateArgs>()
        .mockResolvedValue({}),
    },
    signalActor: {
      upsert: jest.fn().mockResolvedValue({ actorId: ACTOR_ID }),
    },
    place: { findUnique: jest.fn().mockResolvedValue(null) },
    restaurantLocation: { findFirst: jest.fn().mockResolvedValue(null) },
    connection: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}

function createService() {
  const prisma = createPrisma();
  const logger = createLogger();
  const service = new SignalsService(prisma as never, logger as never);
  return { service, prisma, logger };
}

/** record() is fire-and-forget — drain its detached async work. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const GEO = { minLat: 30.1, minLng: -97.9, maxLat: 30.4, maxLng: -97.6 };

describe('SignalsService bbox helpers (geo is ALWAYS a bbox — §3)', () => {
  const { service } = createService();

  it('bboxFromBounds: latitude normalizes by min/max; longitude is role-based (west = southWest.lng, east = northEast.lng)', () => {
    expect(
      service.bboxFromBounds({
        northEast: { lat: 30.4, lng: -97.6 },
        southWest: { lat: 30.1, lng: -97.9 },
      }),
    ).toEqual(GEO);
    // Swapped LATITUDES still yield minLat <= maxLat.
    expect(
      service.bboxFromBounds({
        northEast: { lat: 30.1, lng: -97.6 },
        southWest: { lat: 30.4, lng: -97.9 },
      }),
    ).toEqual(GEO);
  });

  it('bboxFromBounds PRESERVES antimeridian wrap (red-team 3c): west > east stores as-is, never min/max-normalized', () => {
    // Fiji viewport: 176°E → 178°W, a 6°-wide crossing view.
    const fiji = service.bboxFromBounds({
      northEast: { lat: -15, lng: -178 },
      southWest: { lat: -19, lng: 176 },
    });
    expect(fiji).toEqual({
      minLat: -19,
      maxLat: -15,
      minLng: 176, // > maxLng ⇒ crossing representation
      maxLng: -178,
    });
    // min/max normalization would have produced the near-world band
    // [-178, 176] that attributes to every place on earth — Austin included.
    expect(fiji!.minLng).toBeGreaterThan(fiji!.maxLng);
  });

  it('bboxFromBounds returns null for missing/invalid bounds', () => {
    expect(service.bboxFromBounds(null)).toBeNull();
    expect(service.bboxFromBounds(undefined)).toBeNull();
    expect(
      service.bboxFromBounds({
        northEast: { lat: Number.NaN, lng: 0 },
        southWest: { lat: 0, lng: 0 },
      }),
    ).toBeNull();
  });

  it('bboxFromPoint is a zero-area bbox', () => {
    expect(service.bboxFromPoint(30.27, -97.74)).toEqual({
      minLat: 30.27,
      maxLat: 30.27,
      minLng: -97.74,
      maxLng: -97.74,
    });
    expect(service.bboxFromPoint(Number.NaN, 0)).toBeNull();
  });
});

describe('SignalsService.bboxFromPlace (red-team 3e: place-keyed poll geo)', () => {
  it('returns the place bbox, cached, and passes crossing rows through as-is', async () => {
    const { service, prisma } = createService();
    prisma.place.findUnique.mockResolvedValue({
      bboxMinLat: '30.1',
      bboxMinLng: '-97.9',
      bboxMaxLat: '30.4',
      bboxMaxLng: '-97.6',
      centroidLat: '30.27',
      centroidLng: '-97.74',
    });
    const placeId = '99999999-9999-9999-9999-999999999999';
    await expect(service.bboxFromPlace(placeId)).resolves.toEqual(GEO);
    await expect(service.bboxFromPlace(placeId)).resolves.toEqual(GEO);
    expect(prisma.place.findUnique).toHaveBeenCalledTimes(1); // cached
  });

  it('falls back to the centroid point for un-sketched-bbox places, null when nothing resolves, and never rejects', async () => {
    const { service, prisma } = createService();
    prisma.place.findUnique.mockResolvedValueOnce({
      bboxMinLat: null,
      bboxMinLng: null,
      bboxMaxLat: null,
      bboxMaxLng: null,
      centroidLat: '30.27',
      centroidLng: '-97.74',
    });
    await expect(
      service.bboxFromPlace('88888888-8888-8888-8888-888888888888'),
    ).resolves.toEqual({
      minLat: 30.27,
      maxLat: 30.27,
      minLng: -97.74,
      maxLng: -97.74,
    });
    await expect(service.bboxFromPlace(null)).resolves.toBeNull();
    prisma.place.findUnique.mockRejectedValueOnce(new Error('db down'));
    await expect(
      service.bboxFromPlace('77777777-7777-7777-7777-777777777777'),
    ).resolves.toBeNull();
  });
});

describe('SignalsService actor resolution (pseudonymous, cached)', () => {
  it('upserts by userId on first sight and caches the mapping', async () => {
    const { service, prisma } = createService();
    service.record({ kind: 'search', userId: USER_ID, geo: GEO });
    await flush();
    service.record({ kind: 'search', userId: USER_ID, geo: GEO });
    await flush();

    expect(prisma.signalActor.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.signalActor.upsert).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      update: {},
      create: { userId: USER_ID, deviceKey: null },
      select: { actorId: true },
    });
    expect(prisma.signal.create).toHaveBeenCalledTimes(2);
    expect(prisma.signal.create.mock.calls[0][0].data.actorId).toBe(ACTOR_ID);
  });

  it('upserts by deviceKey for anonymous actors', async () => {
    const { service, prisma } = createService();
    service.record({ kind: 'search', deviceKey: 'device-abc', geo: GEO });
    await flush();

    expect(prisma.signalActor.upsert).toHaveBeenCalledWith({
      where: { deviceKey: 'device-abc' },
      update: {},
      create: { userId: null, deviceKey: 'device-abc' },
      select: { actorId: true },
    });
    expect(prisma.signal.create).toHaveBeenCalledTimes(1);
  });

  it('skips (without throwing) when the act carries no identity', async () => {
    const { service, prisma } = createService();
    service.record({ kind: 'search', geo: GEO });
    await flush();

    expect(prisma.signalActor.upsert).not.toHaveBeenCalled();
    expect(prisma.signal.create).not.toHaveBeenCalled();
  });
});

describe('SignalsService write shape', () => {
  it('writes an entity-subject signal with bbox columns and compacted meta', async () => {
    const { service, prisma } = createService();
    const occurredAt = new Date('2026-07-19T12:00:00Z');
    service.record({
      kind: 'entity_view',
      userId: USER_ID,
      subject: { entityId: ENTITY_ID },
      geo: GEO,
      occurredAt,
      meta: { contextRestaurantId: RESTAURANT_ID, locationId: undefined },
    });
    await flush();

    expect(prisma.signal.create).toHaveBeenCalledWith({
      data: {
        kind: 'entity_view',
        subjectType: 'entity',
        subjectId: ENTITY_ID,
        subjectText: null,
        geoMinLat: GEO.minLat,
        geoMinLng: GEO.minLng,
        geoMaxLat: GEO.maxLat,
        geoMaxLng: GEO.maxLng,
        actorId: ACTOR_ID,
        occurredAt,
        // undefined meta values are compacted away.
        meta: { contextRestaurantId: RESTAURANT_ID },
      },
    });
  });

  it('normalizes term subjects (lower/trim)', async () => {
    const { service, prisma } = createService();
    service.record({
      kind: 'search',
      userId: USER_ID,
      subject: { term: '  Birria Tacos  ' },
      geo: GEO,
    });
    await flush();

    const data = prisma.signal.create.mock.calls[0][0].data;
    expect(data.subjectType).toBe('term');
    expect(data.subjectId).toBeNull();
    expect(data.subjectText).toBe('birria tacos');
  });

  it('accepts a geo promise and skips when it resolves null', async () => {
    const { service, prisma } = createService();
    service.record({
      kind: 'poll_vote',
      userId: USER_ID,
      geo: Promise.resolve(null),
    });
    await flush();
    expect(prisma.signal.create).not.toHaveBeenCalled();

    service.record({
      kind: 'poll_vote',
      userId: USER_ID,
      geo: Promise.resolve(GEO),
    });
    await flush();
    expect(prisma.signal.create).toHaveBeenCalledTimes(1);
  });

  it('a rejecting geo promise NEVER becomes an unhandled rejection — even on the no-actor early return', async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on('unhandledRejection', listener);
    try {
      const { service, prisma } = createService();

      // No-actor path: persist() returns before the geo await — the geo
      // promise must already be normalized or its rejection goes unhandled.
      service.record({
        kind: 'search',
        geo: Promise.reject(new Error('geo lookup exploded')),
      });
      await flush();

      // With-actor path: the rejection normalizes to null -> no-geo skip.
      service.record({
        kind: 'search',
        userId: USER_ID,
        geo: Promise.reject(new Error('geo lookup exploded')),
      });
      await flush();
      expect(prisma.signal.create).not.toHaveBeenCalled();

      // Let the event loop surface any unhandled rejections.
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).toEqual([]);
    } finally {
      process.removeListener('unhandledRejection', listener);
    }
  });
});

describe('SignalsService fire-and-forget law (a write failure never fails the act)', () => {
  it('swallows signal-create DB errors', async () => {
    const { service, prisma, logger } = createService();
    prisma.signal.create.mockRejectedValue(new Error('db down'));

    expect(() =>
      service.record({ kind: 'search', userId: USER_ID, geo: GEO }),
    ).not.toThrow();
    await flush();
    expect(logger.warn).toHaveBeenCalled();
  });

  it('swallows actor-upsert DB errors', async () => {
    const { service, prisma, logger } = createService();
    prisma.signalActor.upsert.mockRejectedValue(new Error('db down'));

    expect(() =>
      service.record({ kind: 'search', userId: USER_ID, geo: GEO }),
    ).not.toThrow();
    await flush();
    expect(prisma.signal.create).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});

describe('SignalsService restaurant-location bbox lookup', () => {
  it('prefers the given locationId, else the primary location; never rejects', async () => {
    const { service, prisma } = createService();
    prisma.restaurantLocation.findFirst.mockResolvedValue({
      latitude: '30.25',
      longitude: '-97.75',
    });

    expect(
      await service.bboxFromRestaurantLocation({
        restaurantId: RESTAURANT_ID,
        locationId: ENTITY_ID,
      }),
    ).toEqual({ minLat: 30.25, maxLat: 30.25, minLng: -97.75, maxLng: -97.75 });
    expect(prisma.restaurantLocation.findFirst).toHaveBeenCalledWith({
      where: { locationId: ENTITY_ID, restaurantId: RESTAURANT_ID },
      select: { latitude: true, longitude: true },
    });

    prisma.restaurantLocation.findFirst.mockClear();
    await service.bboxFromRestaurantLocation({ restaurantId: RESTAURANT_ID });
    expect(prisma.restaurantLocation.findFirst).toHaveBeenCalledWith({
      where: {
        restaurantId: RESTAURANT_ID,
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { isPrimary: 'desc' },
      select: { latitude: true, longitude: true },
    });

    prisma.restaurantLocation.findFirst.mockRejectedValue(new Error('db down'));
    expect(
      await service.bboxFromRestaurantLocation({
        restaurantId: RESTAURANT_ID,
      }),
    ).toBeNull();
  });
});

describe('SignalsService food-location bbox lookup (via connection)', () => {
  it('resolves the food -> most-evidenced connection -> restaurant location', async () => {
    const { service, prisma } = createService();
    prisma.connection.findFirst.mockResolvedValue({
      restaurantId: RESTAURANT_ID,
    });
    prisma.restaurantLocation.findFirst.mockResolvedValue({
      latitude: '30.25',
      longitude: '-97.75',
    });

    expect(await service.bboxFromFoodLocation(ENTITY_ID)).toEqual({
      minLat: 30.25,
      maxLat: 30.25,
      minLng: -97.75,
      maxLng: -97.75,
    });
    expect(prisma.connection.findFirst).toHaveBeenCalledWith({
      where: { foodId: ENTITY_ID },
      orderBy: { mentionCount: 'desc' },
      select: { restaurantId: true },
    });
    expect(prisma.restaurantLocation.findFirst).toHaveBeenCalledWith({
      where: {
        restaurantId: RESTAURANT_ID,
        latitude: { not: null },
        longitude: { not: null },
      },
      orderBy: { isPrimary: 'desc' },
      select: { latitude: true, longitude: true },
    });
  });

  it('returns null (never rejects) when the food has no connection or the DB fails', async () => {
    const { service, prisma } = createService();
    expect(await service.bboxFromFoodLocation(ENTITY_ID)).toBeNull();

    prisma.connection.findFirst.mockRejectedValue(new Error('db down'));
    expect(await service.bboxFromFoodLocation(ENTITY_ID)).toBeNull();
  });
});
