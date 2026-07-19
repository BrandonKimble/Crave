/**
 * §4 poll-publish notification targeting (§22 item 5): place-keyed, with the
 * big-place boundary enforced IN TARGETING — subdivision+ polls are
 * feed-at-that-zoom only, NEVER push. Device selection flows through the
 * home-place seam (interim: legacy city registration keyed by the market
 * containing the place centroid — see resolveHomePlaceDevices' loud TODO).
 */
import 'reflect-metadata';
import { NotificationsService } from './notifications.service';

const TOWN = '11111111-1111-1111-1111-111111111111';
const STATE = '44444444-4444-4444-4444-444444444444';
const COUNTRY = '00000000-0000-0000-0000-0000000000aa';
const POLL = 'aaaaaaaa-aaaa-aaaa-aaaa-000000000001';

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
  parents: Record<string, string[]>;
  markets?: Array<{ marketKey: string; area: number }>;
  devices?: Array<{ deviceId: string }>;
}) {
  const prisma = {
    place: {
      findMany: jest.fn(({ where }: { where: { placeId: { in: string[] } } }) =>
        Promise.resolve(
          where.placeId.in
            .filter((id) => id in options.parents)
            .map((id) => ({
              placeId: id,
              parentPlaceIds: options.parents[id],
            })),
        ),
      ),
      findUnique: jest
        .fn()
        .mockResolvedValue({ centroidLat: 30.27, centroidLng: -97.74 }),
    },
    market: {
      findMany: jest.fn().mockResolvedValue(
        (options.markets ?? [{ marketKey: 'austin-metro', area: 1 }]).map(
          (market) => ({
            marketKey: market.marketKey,
            bboxSwLat: 0,
            bboxSwLng: 0,
            bboxNeLat: market.area,
            bboxNeLng: 1,
          }),
        ),
      ),
    },
    notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const devices = {
    findDevices: jest
      .fn()
      .mockResolvedValue(options.devices ?? [{ deviceId: 'device-1' }]),
  };
  const service = new NotificationsService(
    createLogger() as never,
    prisma as never,
    devices as never,
  );
  return { service, prisma, devices };
}

describe('NotificationsService.queuePollReleaseForPlace — §4 targeting', () => {
  it('BIG-PLACE NO-PUSH: a subdivision+ place (root within depth ≤ 1) queues NOTHING', async () => {
    const { service, prisma } = createHarness({
      parents: { [STATE]: [COUNTRY], [COUNTRY]: [] },
    });
    await service.queuePollReleaseForPlace({
      placeId: STATE,
      placeName: 'Texas',
      pollIds: [POLL],
    });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(prisma.place.findUnique).not.toHaveBeenCalled(); // gate fires first
  });

  it('a town-level place pushes through the home-place seam with a PLACE-keyed payload', async () => {
    const { service, prisma, devices } = createHarness({
      parents: {
        [TOWN]: [STATE],
        [STATE]: [COUNTRY],
        [COUNTRY]: [],
      },
    });
    await service.queuePollReleaseForPlace({
      placeId: TOWN,
      placeName: 'Round Rock',
      pollIds: [POLL],
    });
    // Interim seam: legacy city registration keyed by the containing market.
    expect(devices.findDevices).toHaveBeenCalledWith({ city: 'austin-metro' });
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
    const [{ data }] = prisma.notification.createMany.mock.calls[0] as [
      { data: Array<{ payload: Record<string, unknown> }> },
    ];
    expect(data[0].payload).toEqual({
      placeId: TOWN,
      placeName: 'Round Rock',
      pollIds: [POLL],
    });
  });

  it('no targetable devices → nothing queued (no crash)', async () => {
    const { service, prisma } = createHarness({
      parents: {
        [TOWN]: [STATE],
        [STATE]: [COUNTRY],
        [COUNTRY]: [],
      },
      devices: [],
    });
    await service.queuePollReleaseForPlace({
      placeId: TOWN,
      placeName: 'Round Rock',
      pollIds: [POLL],
    });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
