import 'reflect-metadata';
import { HistoryService } from './history.service';

/**
 * §22 item 6 reader-cut parity: the recently-viewed list paths read the
 * signals substrate, and the RESPONSE CONTRACT IS FROZEN — the same fields
 * the user_restaurant_views / user_food_views reads returned, plus the
 * locationId the dual-write records (the recently-viewed location display)
 * and its earned locationAddress label (see-locations leg).
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';

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
  const lastViewedAt = new Date('2026-07-18T12:00:00Z');
  const signalDemandRead = {
    recentlyViewedPlaces: jest.fn().mockResolvedValue([
      {
        placeId: 'r-1',
        placeName: 'Franklin Barbecue',
        city: 'Austin',
        region: 'TX',
        lastViewedAt,
        viewCount: 4,
        locationId: 'loc-1',
      },
    ]),
    recentlyViewedItems: jest.fn().mockResolvedValue([
      {
        connectionId: 'c-1',
        itemId: 'f-1',
        itemName: 'Brisket',
        placeId: 'r-1',
        placeName: 'Franklin Barbecue',
        lastViewedAt,
        viewCount: 2,
        locationId: null,
      },
    ]),
  };
  const placeStatusService = {
    getStatusPreviews: jest
      .fn()
      .mockResolvedValue([{ placeId: 'r-1', isOpen: true }]),
  };
  const prisma = {
    // Earned address labels: the ONE prisma touch on the list paths — the
    // batch address lookup for the viewed locationIds.
    placeLocation: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ locationId: 'loc-1', address: '900 E 11th St' }]),
    },
  };
  const service = new HistoryService(
    prisma as never,
    createLogger() as never,
    placeStatusService as never,
    {} as never, // signals writer (unused on list paths)
    signalDemandRead as never,
    {
      resolveSaveablePlace: (id: string) =>
        Promise.resolve({ entityId: id, name: 'R', city: null }),
      resolveSaveableItem: (id: string) =>
        Promise.resolve({ entityId: id, name: 'F', city: null }),
      resolveActiveByIds: (ids: string[]) =>
        Promise.resolve(
          new Map(
            ids.map((id) => [id, { entityId: id, name: 'E', city: null }]),
          ),
        ),
    } as never,
  );
  return {
    service,
    prisma,
    signalDemandRead,
    placeStatusService,
    lastViewedAt,
  };
}

describe('HistoryService list paths — signals substrate, frozen contract', () => {
  it('recently-viewed restaurants: substrate rows -> the exact old response shape + locationId', async () => {
    const { service, signalDemandRead, lastViewedAt } = createHarness();
    const rows = await service.listRecentlyViewedPlaces(USER_ID, {
      limit: 10,
      prefix: ' Fra ',
    } as never);

    expect(signalDemandRead.recentlyViewedPlaces).toHaveBeenCalledWith(
      USER_ID,
      { prefix: 'Fra', limit: 10 },
    );
    expect(rows).toEqual([
      {
        placeId: 'r-1',
        placeName: 'Franklin Barbecue',
        city: 'Austin',
        region: 'TX',
        lastViewedAt,
        viewCount: 4,
        locationId: 'loc-1',
        locationAddress: '900 E 11th St',
        statusPreview: { placeId: 'r-1', isOpen: true },
      },
    ]);
  });

  it('recently-viewed foods: substrate rows -> the exact old response shape + locationId', async () => {
    const { service, lastViewedAt } = createHarness();
    const rows = await service.listRecentlyViewedItems(USER_ID, {
      limit: 10,
    } as never);

    expect(rows).toEqual([
      {
        connectionId: 'c-1',
        itemId: 'f-1',
        itemName: 'Brisket',
        placeId: 'r-1',
        placeName: 'Franklin Barbecue',
        lastViewedAt,
        viewCount: 2,
        locationId: null,
        locationAddress: null,
        statusPreview: { placeId: 'r-1', isOpen: true },
      },
    ]);
  });

  it('limit clamps to [1, 50] before reaching the substrate', async () => {
    const { service, signalDemandRead } = createHarness();
    await service.listRecentlyViewedPlaces(USER_ID, {
      limit: 500,
    } as never);
    expect(signalDemandRead.recentlyViewedPlaces).toHaveBeenCalledWith(
      USER_ID,
      { prefix: undefined, limit: 50 },
    );
  });
});
