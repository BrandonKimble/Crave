import { PhotoReadService } from './photo-read.service';

/**
 * Contract tests for the batch card-strip read (POST /photos/strips):
 * a ref WITH connectionId resolves DISH-linked photos keyed by connectionId;
 * a ref WITHOUT resolves restaurant photos keyed by restaurantId; refs with
 * no live photos come back as EMPTY strips (the client renders the display
 * placeholder — the response never omits a requested ref).
 */

const rawRow = (over: Partial<Record<string, unknown>>) => ({
  photo_id: 'p1',
  user_id: 'u1',
  restaurant_id: 'r1',
  connection_id: null,
  public_id: 'crave/test/photos/p1',
  caption: null,
  taken_at: null,
  uploaded_at: new Date('2026-07-01T00:00:00Z'),
  focus_score: 0.9,
  ...over,
});

function makeService(params: {
  connectionRows?: unknown[];
  restaurantRows?: unknown[];
  connectionCounts?: Array<{
    connectionId: string;
    _count: { photoId: number };
  }>;
  restaurantCounts?: Array<{
    restaurantId: string;
    _count: { photoId: number };
  }>;
}) {
  // stripPhotos issues the connection window first, then the restaurant
  // window (each only when its id list is non-empty).
  const queryRaw = jest.fn();
  if (params.connectionRows) {
    queryRaw.mockResolvedValueOnce(params.connectionRows);
  }
  if (params.restaurantRows) {
    queryRaw.mockResolvedValueOnce(params.restaurantRows);
  }
  const groupBy = jest.fn(({ by }: { by: string[] }) =>
    Promise.resolve(
      by[0] === 'connectionId'
        ? (params.connectionCounts ?? [])
        : (params.restaurantCounts ?? []),
    ),
  );
  const prisma = {
    $queryRaw: queryRaw,
    photo: { groupBy },
  };
  const cloudinary = {
    buildUrls: jest.fn((publicId: string) => ({
      thumb: `t/${publicId}`,
      card: `c/${publicId}`,
      gallery: `g/${publicId}`,
      full: `f/${publicId}`,
    })),
  };
  const service = new PhotoReadService(prisma as any, cloudinary as any);
  return { service, prisma, queryRaw };
}

describe('PhotoReadService.cardStrips', () => {
  it('resolves dish refs by connectionId and restaurant refs by restaurantId', async () => {
    const { service } = makeService({
      connectionRows: [
        rawRow({
          photo_id: 'pd1',
          connection_id: 'c1',
          public_id: 'crave/test/photos/pd1',
        }),
        rawRow({ photo_id: 'pd2', connection_id: 'c1' }),
      ],
      restaurantRows: [rawRow({ photo_id: 'pr1', restaurant_id: 'r2' })],
      connectionCounts: [{ connectionId: 'c1', _count: { photoId: 14 } }],
      restaurantCounts: [{ restaurantId: 'r2', _count: { photoId: 3 } }],
    });
    const { strips } = await service.cardStrips([
      { restaurantId: 'r1', connectionId: 'c1' },
      { restaurantId: 'r2' },
    ]);
    expect(strips).toHaveLength(2);
    expect(strips[0].key).toBe('c1');
    expect(strips[0].totalCount).toBe(14);
    expect(strips[0].photos.map((p) => p.photoId)).toEqual(['pd1', 'pd2']);
    expect(strips[0].photos[0].urls.thumb).toBe('t/crave/test/photos/pd1');
    expect(strips[1].key).toBe('r2');
    expect(strips[1].totalCount).toBe(3);
    expect(strips[1].photos.map((p) => p.photoId)).toEqual(['pr1']);
  });

  it('a dish ref NEVER falls back to restaurant photos; empty refs come back as empty strips', async () => {
    const { service } = makeService({
      connectionRows: [],
      restaurantRows: [rawRow({ photo_id: 'pr1', restaurant_id: 'r1' })],
      restaurantCounts: [{ restaurantId: 'r1', _count: { photoId: 1 } }],
    });
    const { strips } = await service.cardStrips([
      { restaurantId: 'r1', connectionId: 'c-none' },
      { restaurantId: 'r1' },
      { restaurantId: 'r-none' },
    ]);
    expect(strips[0]).toEqual({ key: 'c-none', totalCount: 0, photos: [] });
    expect(strips[1].photos).toHaveLength(1);
    expect(strips[2]).toEqual({ key: 'r-none', totalCount: 0, photos: [] });
  });

  it('issues no restaurant window when every ref is dish-shaped (and dedupes ids)', async () => {
    const { service, queryRaw, prisma } = makeService({
      connectionRows: [],
      connectionCounts: [],
    });
    await service.cardStrips([
      { restaurantId: 'r1', connectionId: 'c1' },
      { restaurantId: 'r2', connectionId: 'c1' },
    ]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.photo.groupBy).toHaveBeenCalledTimes(1);
  });

  it('excludes private photos: the strip window and its counts read public only', async () => {
    const { service, queryRaw, prisma } = makeService({
      connectionRows: [],
      restaurantRows: [],
      connectionCounts: [],
      restaurantCounts: [],
    });
    await service.cardStrips([
      { restaurantId: 'r1', connectionId: 'c1' },
      { restaurantId: 'r2' },
    ]);
    // $queryRaw is a tagged template: the SQL text is the joined strings.
    for (const call of queryRaw.mock.calls as unknown as [string[]][]) {
      expect(call[0].join('?')).toContain("visibility = 'public'");
    }
    type WhereCall = [{ where: { visibility?: string } }];
    for (const call of prisma.photo.groupBy.mock
      .calls as unknown as WhereCall[]) {
      expect(call[0].where.visibility).toBe('public');
    }
  });
});

describe('PhotoReadService visibility on gallery + food log', () => {
  function makeGalleryService() {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const queryRaw = jest.fn().mockResolvedValue([]);
    const prisma = {
      $queryRaw: queryRaw,
      photo: { findMany, count },
    };
    const cloudinary = { buildUrls: jest.fn().mockReturnValue({}) };
    const service = new PhotoReadService(prisma as any, cloudinary as any);
    return { service, findMany, count, queryRaw };
  }

  it('restaurant gallery reads public-only (page, count, and per-dish window)', async () => {
    const { service, findMany, count, queryRaw } = makeGalleryService();
    await service.restaurantGallery('r1');
    type WhereCall = [{ where: { visibility?: string } }];
    const findManyCalls = findMany.mock.calls as unknown as WhereCall[];
    const countCalls = count.mock.calls as unknown as WhereCall[];
    expect(findManyCalls[0][0].where.visibility).toBe('public');
    expect(countCalls[0][0].where.visibility).toBe('public');
    expect(
      (queryRaw.mock.calls as unknown as [string[]][])[0][0].join('?'),
    ).toContain("visibility = 'public'");
  });

  it("food log: a VISITOR's read excludes private; the OWNER's read includes it", async () => {
    const { service, findMany } = makeGalleryService();
    type WhereCall = [{ where: { visibility?: string } }];
    await service.userFoodLog('owner', 'visitor');
    const calls = findMany.mock.calls as unknown as WhereCall[];
    expect(calls[0][0].where.visibility).toBe('public');
    await service.userFoodLog('owner', 'owner');
    expect(calls[1][0].where.visibility).toBeUndefined();
  });
});
