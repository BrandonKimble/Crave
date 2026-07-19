import 'reflect-metadata';
import { HistoryService } from './history.service';

/**
 * §22 item 6 reader-cut parity: the recently-viewed list paths read the
 * signals substrate, and the RESPONSE CONTRACT IS FROZEN — the same fields
 * the user_restaurant_views / user_food_views reads returned, plus the
 * locationId the dual-write records (the recently-viewed location display).
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
    recentlyViewedRestaurants: jest.fn().mockResolvedValue([
      {
        restaurantId: 'r-1',
        restaurantName: 'Franklin Barbecue',
        city: 'Austin',
        region: 'TX',
        lastViewedAt,
        viewCount: 4,
        locationId: 'loc-1',
      },
    ]),
    recentlyViewedFoods: jest.fn().mockResolvedValue([
      {
        connectionId: 'c-1',
        foodId: 'f-1',
        foodName: 'Brisket',
        restaurantId: 'r-1',
        restaurantName: 'Franklin Barbecue',
        lastViewedAt,
        viewCount: 2,
        locationId: null,
      },
    ]),
  };
  const restaurantStatusService = {
    getStatusPreviews: jest
      .fn()
      .mockResolvedValue([{ restaurantId: 'r-1', isOpen: true }]),
  };
  const service = new HistoryService(
    {} as never, // prisma (list paths never touch it anymore)
    createLogger() as never,
    restaurantStatusService as never,
    {} as never, // signals writer (unused on list paths)
    signalDemandRead as never,
  );
  return { service, signalDemandRead, restaurantStatusService, lastViewedAt };
}

describe('HistoryService list paths — signals substrate, frozen contract', () => {
  it('recently-viewed restaurants: substrate rows -> the exact old response shape + locationId', async () => {
    const { service, signalDemandRead, lastViewedAt } = createHarness();
    const rows = await service.listRecentlyViewedRestaurants(USER_ID, {
      limit: 10,
      prefix: ' Fra ',
    } as never);

    expect(signalDemandRead.recentlyViewedRestaurants).toHaveBeenCalledWith(
      USER_ID,
      { prefix: 'Fra', limit: 10 },
    );
    expect(rows).toEqual([
      {
        restaurantId: 'r-1',
        restaurantName: 'Franklin Barbecue',
        city: 'Austin',
        region: 'TX',
        lastViewedAt,
        viewCount: 4,
        locationId: 'loc-1',
        statusPreview: { restaurantId: 'r-1', isOpen: true },
      },
    ]);
  });

  it('recently-viewed foods: substrate rows -> the exact old response shape + locationId', async () => {
    const { service, lastViewedAt } = createHarness();
    const rows = await service.listRecentlyViewedFoods(USER_ID, {
      limit: 10,
    } as never);

    expect(rows).toEqual([
      {
        connectionId: 'c-1',
        foodId: 'f-1',
        foodName: 'Brisket',
        restaurantId: 'r-1',
        restaurantName: 'Franklin Barbecue',
        lastViewedAt,
        viewCount: 2,
        locationId: null,
        statusPreview: { restaurantId: 'r-1', isOpen: true },
      },
    ]);
  });

  it('limit clamps to [1, 50] before reaching the substrate', async () => {
    const { service, signalDemandRead } = createHarness();
    await service.listRecentlyViewedRestaurants(USER_ID, {
      limit: 500,
    } as never);
    expect(signalDemandRead.recentlyViewedRestaurants).toHaveBeenCalledWith(
      USER_ID,
      { prefix: undefined, limit: 50 },
    );
  });
});
