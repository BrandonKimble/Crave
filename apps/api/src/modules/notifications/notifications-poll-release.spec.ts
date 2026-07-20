/**
 * §4 poll-publish notification targeting (§22 item 5): place-keyed, with the
 * big-place boundary enforced IN TARGETING — subdivision+ polls are
 * feed-at-that-zoom only, NEVER push. Device selection is the HOME-PLACE seam:
 * homePlaceId ∈ descendantPlaceIds(poll place). The old quarantined
 * market-centroid fallback is DEAD — the dispatch path never reads markets.
 */
import 'reflect-metadata';
import { NotificationsService } from './notifications.service';

const TOWN = '11111111-1111-1111-1111-111111111111';
const NEIGHBORHOOD = '22222222-2222-2222-2222-222222222222';
const COUSIN_TOWN = '33333333-3333-3333-3333-333333333333';
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
  /** Subtree the descendant CTE returns for the poll place (roots included). */
  subtree?: string[];
  /** Registered devices with their resolved home place (null = unknown home). */
  devices?: Array<{ deviceId: string; homePlaceId: string | null }>;
}) {
  const deviceTable = options.devices ?? [
    { deviceId: 'device-1', homePlaceId: TOWN },
  ];
  // NOTE: the prisma mock deliberately has NO `market` delegate — any market
  // read in the dispatch path throws, RED-proving the fallback stays dead.
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
    },
    $queryRaw: jest
      .fn()
      .mockResolvedValue(
        (options.subtree ?? [TOWN]).map((id) => ({ place_id: id })),
      ),
    notification: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const devices = {
    // Mirrors the real findDevices semantics: homePlaceId IN (subtree) —
    // SQL IN excludes NULL, so unknown-home devices never match.
    findDevices: jest.fn(({ homePlaceIdIn }: { homePlaceIdIn: string[] }) =>
      Promise.resolve(
        deviceTable.filter(
          (device) =>
            device.homePlaceId !== null &&
            homePlaceIdIn.includes(device.homePlaceId),
        ),
      ),
    ),
  };
  const service = new NotificationsService(
    createLogger() as never,
    prisma as never,
    devices as never,
  );
  return { service, prisma, devices };
}

const SMALL_PLACE_PARENTS = {
  [NEIGHBORHOOD]: [TOWN],
  [TOWN]: [STATE],
  [COUSIN_TOWN]: [STATE],
  [STATE]: [COUNTRY],
  [COUNTRY]: [],
};

describe('NotificationsService.queuePollReleaseForPlace — §4 targeting', () => {
  it('BIG-PLACE NO-PUSH: a subdivision+ place (root within depth ≤ 1) queues NOTHING', async () => {
    const { service, prisma, devices } = createHarness({
      parents: { [STATE]: [COUNTRY], [COUNTRY]: [] },
    });
    await service.queuePollReleaseForPlace({
      placeId: STATE,
      placeName: 'Texas',
      pollIds: [POLL],
    });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
    expect(devices.findDevices).not.toHaveBeenCalled(); // gate fires first
  });

  it('SUBTREE MEMBERSHIP: a device homed at the place or a DESCENDANT is pushed; a COUSIN and a NULL-home device are not', async () => {
    const { service, prisma, devices } = createHarness({
      parents: SMALL_PLACE_PARENTS,
      subtree: [TOWN, NEIGHBORHOOD],
      devices: [
        { deviceId: 'home-town', homePlaceId: TOWN },
        { deviceId: 'home-neighborhood', homePlaceId: NEIGHBORHOOD },
        { deviceId: 'home-cousin', homePlaceId: COUSIN_TOWN },
        { deviceId: 'home-unknown', homePlaceId: null },
      ],
    });
    await service.queuePollReleaseForPlace({
      placeId: TOWN,
      placeName: 'Round Rock',
      pollIds: [POLL],
    });
    expect(devices.findDevices).toHaveBeenCalledWith({
      homePlaceIdIn: [TOWN, NEIGHBORHOOD],
    });
    const [{ data }] = prisma.notification.createMany.mock.calls[0] as [
      { data: Array<{ deviceId: string; payload: Record<string, unknown> }> },
    ];
    expect(data.map((row) => row.deviceId).sort()).toEqual([
      'home-neighborhood',
      'home-town',
    ]);
    expect(data[0].payload).toEqual({
      placeId: TOWN,
      placeName: 'Round Rock',
      pollIds: [POLL],
    });
  });

  it('FALLBACK IS DEAD: the dispatch path performs NO market read (prisma mock has no market delegate) and no centroid read', async () => {
    const { service, prisma } = createHarness({
      parents: SMALL_PLACE_PARENTS,
      subtree: [TOWN],
    });
    await service.queuePollReleaseForPlace({
      placeId: TOWN,
      placeName: 'Round Rock',
      pollIds: [POLL],
    });
    // Would have thrown on `this.prisma.market.findMany` — and the only place
    // reads are the DAG walks (findMany) + subtree CTE ($queryRaw), never a
    // centroid findUnique.
    expect(
      (prisma as unknown as Record<string, unknown>).market,
    ).toBeUndefined();
    expect(prisma.notification.createMany).toHaveBeenCalledTimes(1);
  });

  it('no targetable devices (all homes outside the subtree) → nothing queued (no crash)', async () => {
    const { service, prisma } = createHarness({
      parents: SMALL_PLACE_PARENTS,
      subtree: [TOWN],
      devices: [{ deviceId: 'home-cousin', homePlaceId: COUSIN_TOWN }],
    });
    await service.queuePollReleaseForPlace({
      placeId: TOWN,
      placeName: 'Round Rock',
      pollIds: [POLL],
    });
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
  });
});
