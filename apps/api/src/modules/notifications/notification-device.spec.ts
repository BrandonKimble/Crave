/**
 * §4 home-place registration: the client sends its home COORDINATE (ground
 * truth — never a place id); the server judges placeAt =
 * PlacesCatalogService.smallestContaining(point) and persists homePlaceId on
 * the device row. Re-registration updates it (people move); explicit null
 * clears it (location revoked); an absent field leaves the stored value alone.
 * findDevices is the subtree-membership read (IN excludes NULL homes).
 */
import 'reflect-metadata';
import { NotificationDeviceService } from './notification-device.service';

const TOWN = '11111111-1111-1111-1111-111111111111';

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

function createHarness(options?: { containingPlaceId?: string | null }) {
  const prisma = {
    notificationDevice: {
      upsert: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const places = {
    smallestContaining: jest
      .fn()
      .mockResolvedValue(
        options?.containingPlaceId === null
          ? null
          : { placeId: options?.containingPlaceId ?? TOWN },
      ),
  };
  const service = new NotificationDeviceService(
    prisma as never,
    createLogger() as never,
    places as never,
  );
  return { service, prisma, places };
}

describe('NotificationDeviceService.registerDevice — §4 placeAt resolution', () => {
  it('a home coordinate resolves through smallestContaining and persists homePlaceId on create AND update (re-registration updates — people move)', async () => {
    const { service, prisma, places } = createHarness();
    await service.registerDevice({
      token: 'tok-1',
      homeLocation: { lat: 30.27, lng: -97.74 },
    });
    expect(places.smallestContaining).toHaveBeenCalledWith({
      lat: 30.27,
      lng: -97.74,
    });
    const [{ create, update }] = prisma.notificationDevice.upsert.mock
      .calls[0] as [
      {
        create: { homePlaceId: string | null };
        update: { homePlaceId?: string | null };
      },
    ];
    expect(create.homePlaceId).toBe(TOWN);
    expect(update.homePlaceId).toBe(TOWN);
  });

  it('a coordinate OUTSIDE the catalog honestly persists null (no guessing)', async () => {
    const { service, prisma } = createHarness({ containingPlaceId: null });
    await service.registerDevice({
      token: 'tok-1',
      homeLocation: { lat: 0, lng: 0 },
    });
    const [{ create, update }] = prisma.notificationDevice.upsert.mock
      .calls[0] as [
      {
        create: { homePlaceId: string | null };
        update: { homePlaceId?: string | null };
      },
    ];
    expect(create.homePlaceId).toBeNull();
    expect(update.homePlaceId).toBeNull();
  });

  it('EXPLICIT null (location revoked) clears the stored home place', async () => {
    const { service, prisma, places } = createHarness();
    await service.registerDevice({ token: 'tok-1', homeLocation: null });
    expect(places.smallestContaining).not.toHaveBeenCalled();
    const [{ create, update }] = prisma.notificationDevice.upsert.mock
      .calls[0] as [
      {
        create: { homePlaceId: string | null };
        update: { homePlaceId?: string | null };
      },
    ];
    expect(create.homePlaceId).toBeNull();
    expect(update.homePlaceId).toBeNull();
  });

  it('ABSENT homeLocation leaves the stored home place untouched (update omits the field)', async () => {
    const { service, prisma, places } = createHarness();
    await service.registerDevice({ token: 'tok-1' });
    expect(places.smallestContaining).not.toHaveBeenCalled();
    const [{ update }] = prisma.notificationDevice.upsert.mock.calls[0] as [
      { update: Record<string, unknown> },
    ];
    expect('homePlaceId' in update).toBe(false);
  });
});

describe('NotificationDeviceService.findDevices — §4 subtree-membership read', () => {
  it('filters on homePlaceId IN the given subtree (NULL homes excluded by IN semantics)', async () => {
    const { service, prisma } = createHarness();
    await service.findDevices({ homePlaceIdIn: [TOWN] });
    expect(prisma.notificationDevice.findMany).toHaveBeenCalledWith({
      where: { homePlaceId: { in: [TOWN] } },
    });
  });

  it('an empty subtree short-circuits to no devices (no unfiltered scan)', async () => {
    const { service, prisma } = createHarness();
    await expect(service.findDevices({ homePlaceIdIn: [] })).resolves.toEqual(
      [],
    );
    expect(prisma.notificationDevice.findMany).not.toHaveBeenCalled();
  });
});
