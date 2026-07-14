import { FavoriteListTileGalleryService } from './favorite-list-tile-gallery.service';

/**
 * The 2x2 tile-gallery law (wave2 §7): top-4 restaurants by crave rank —
 * or item position when the list is custom-ordered — each contributing its
 * top strip photo; dish items resolve through their connection; duplicate
 * restaurants collapse to one slot; a photo-less restaurant yields its slot
 * to the next ranked one.
 */

type ItemRow = {
  listId: string;
  itemId: string;
  position: number;
  createdAt: Date;
  restaurantId: string | null;
  connection: { restaurantId: string } | null;
};

const at = (minutes: number): Date => new Date(2026, 0, 1, 0, minutes);

type StubPhoto = { photoId: string; urls: { thumb: string }; userId?: string };

function makeService(params: {
  items: ItemRow[];
  scores: Map<string, { displayScore: number }>;
  topPhotos: Map<string, StubPhoto>;
}): FavoriteListTileGalleryService {
  const prisma = {
    favoriteListItem: { findMany: () => Promise.resolve(params.items) },
  };
  const mapper = {
    loadPublicScores: () => Promise.resolve(params.scores),
  };
  // Honors the real stripPhotos contract: a userId narrows the pool to
  // that uploader's photos (photos without a stub userId = other users').
  const photoRead = {
    stripPhotos: ({ userId }: { userId?: string }) =>
      Promise.resolve({
        byRestaurant: new Map(
          [...params.topPhotos]
            .filter(([, photo]) => !userId || photo.userId === userId)
            .map(([restaurantId, photo]) => [restaurantId, [photo]]),
        ),
        byConnection: new Map(),
        countsByRestaurant: new Map(),
        countsByConnection: new Map(),
      }),
  };
  return new FavoriteListTileGalleryService(
    prisma as never,
    mapper as never,
    photoRead as never,
  );
}

const ref = (
  listId: string,
  useOwnPhotos = false,
  ownerUserId = 'owner-1',
) => ({
  listId,
  ownerUserId,
  useOwnPhotos,
});

const item = (
  listId: string,
  n: number,
  restaurantId: string | null,
  connectionRestaurantId?: string,
): ItemRow => ({
  listId,
  itemId: `item-${listId}-${n}`,
  position: n,
  createdAt: at(n),
  restaurantId,
  connection: connectionRestaurantId
    ? { restaurantId: connectionRestaurantId }
    : null,
});

const photo = (id: string) => ({
  photoId: `photo-${id}`,
  urls: { thumb: `thumb-${id}` },
});

describe('FavoriteListTileGalleryService', () => {
  it('orders slots by crave rank when the list has no custom order', async () => {
    // Insertion order == position order (no custom order); crave rank must win.
    const service = makeService({
      items: [
        item('l1', 0, 'r-low'),
        item('l1', 1, 'r-high'),
        item('l1', 2, 'r-mid'),
      ],
      scores: new Map([
        ['r-low', { displayScore: 5 }],
        ['r-high', { displayScore: 9.5 }],
        ['r-mid', { displayScore: 7 }],
      ]),
      topPhotos: new Map([
        ['r-low', photo('low')],
        ['r-high', photo('high')],
        ['r-mid', photo('mid')],
      ]),
    });
    const tiles = (await service.loadTileImages([ref('l1')])).get('l1')!;
    expect(tiles.map((t) => t.restaurantId)).toEqual([
      'r-high',
      'r-mid',
      'r-low',
    ]);
    expect(tiles.map((t) => t.slot)).toEqual([0, 1, 2]);
    expect(tiles[0].thumbUrl).toBe('thumb-high');
  });

  it('uses item position when the list is custom-ordered (RED vs crave rank)', async () => {
    // Position order diverges from insertion order -> custom order is set;
    // the LOW-scoring restaurant leads because the owner put it first.
    const items = [
      { ...item('l1', 0, 'r-low'), createdAt: at(5) },
      { ...item('l1', 1, 'r-high'), createdAt: at(1) },
    ];
    const service = makeService({
      items,
      scores: new Map([
        ['r-low', { displayScore: 5 }],
        ['r-high', { displayScore: 9.5 }],
      ]),
      topPhotos: new Map([
        ['r-low', photo('low')],
        ['r-high', photo('high')],
      ]),
    });
    const tiles = (await service.loadTileImages([ref('l1')])).get('l1')!;
    expect(tiles.map((t) => t.restaurantId)).toEqual(['r-low', 'r-high']);
  });

  it('resolves dish items through their connection, collapses duplicate restaurants, caps at 4', async () => {
    const service = makeService({
      items: [
        item('l1', 0, null, 'r-a'),
        item('l1', 1, null, 'r-a'), // second dish at the same restaurant
        item('l1', 2, null, 'r-b'),
        item('l1', 3, null, 'r-c'),
        item('l1', 4, null, 'r-d'),
        item('l1', 5, null, 'r-e'), // would be slot 5 — capped
      ],
      scores: new Map(
        ['r-a', 'r-b', 'r-c', 'r-d', 'r-e'].map((id, i) => [
          id,
          { displayScore: 9 - i },
        ]),
      ),
      topPhotos: new Map(
        ['r-a', 'r-b', 'r-c', 'r-d', 'r-e'].map((id) => [id, photo(id)]),
      ),
    });
    const tiles = (await service.loadTileImages([ref('l1')])).get('l1')!;
    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => t.restaurantId)).toEqual([
      'r-a',
      'r-b',
      'r-c',
      'r-d',
    ]);
  });

  it('a photo-less restaurant yields its slot to the next ranked one', async () => {
    const service = makeService({
      items: [item('l1', 0, 'r-noshot'), item('l1', 1, 'r-b')],
      scores: new Map([
        ['r-noshot', { displayScore: 9.9 }],
        ['r-b', { displayScore: 4 }],
      ]),
      topPhotos: new Map([['r-b', photo('b')]]),
    });
    const tiles = (await service.loadTileImages([ref('l1')])).get('l1')!;
    expect(tiles).toEqual([
      {
        slot: 0,
        restaurantId: 'r-b',
        photoId: 'photo-b',
        thumbUrl: 'thumb-b',
      },
    ]);
  });

  it('returns no entry for a list with no usable images', async () => {
    const service = makeService({
      items: [item('l1', 0, 'r-a')],
      scores: new Map(),
      topPhotos: new Map(),
    });
    expect((await service.loadTileImages([ref('l1')])).has('l1')).toBe(false);
  });

  describe('use your photos (wave2 §2 / audit ND #2)', () => {
    const scores = new Map([
      ['r-a', { displayScore: 9 }],
      ['r-b', { displayScore: 8 }],
      ['r-c', { displayScore: 7 }],
    ]);

    it('RED vs the old service: flagged list draws only the owner photos and keeps un-shot slots EMPTY (sparse mid-grid, no yield)', async () => {
      // r-a: owner shot it. r-b: only someone else's photo (the old code —
      // no userId filter — would surface photo-b here: RED). r-c: owner shot.
      const service = makeService({
        items: [
          item('l1', 0, 'r-a'),
          item('l1', 1, 'r-b'),
          item('l1', 2, 'r-c'),
        ],
        scores,
        topPhotos: new Map<string, StubPhoto>([
          ['r-a', { ...photo('own-a'), userId: 'owner-1' }],
          ['r-b', photo('stranger-b')],
          ['r-c', { ...photo('own-c'), userId: 'owner-1' }],
        ]),
      });
      const tiles = (
        await service.loadTileImages([ref('l1', true, 'owner-1')])
      ).get('l1')!;
      // Slot 1 (r-b) stays EMPTY — not filled by the stranger photo, not
      // yielded to r-c; r-c keeps its own rank slot 2.
      expect(tiles).toEqual([
        expect.objectContaining({
          slot: 0,
          restaurantId: 'r-a',
          photoId: 'photo-own-a',
        }),
        expect.objectContaining({
          slot: 2,
          restaurantId: 'r-c',
          photoId: 'photo-own-c',
        }),
      ]);
    });

    it('an unflagged list is untouched by the flag machinery (still yields photo-less slots)', async () => {
      const service = makeService({
        items: [item('l1', 0, 'r-a'), item('l1', 1, 'r-b')],
        scores,
        topPhotos: new Map<string, StubPhoto>([['r-b', photo('stranger-b')]]),
      });
      const tiles = (
        await service.loadTileImages([ref('l1', false, 'owner-1')])
      ).get('l1')!;
      expect(tiles).toEqual([
        expect.objectContaining({ slot: 0, restaurantId: 'r-b' }),
      ]);
    });

    it('a flagged list where the owner shot nothing returns no entry', async () => {
      const service = makeService({
        items: [item('l1', 0, 'r-a')],
        scores,
        topPhotos: new Map<string, StubPhoto>([['r-a', photo('stranger-a')]]),
      });
      expect(
        (await service.loadTileImages([ref('l1', true, 'owner-1')])).has('l1'),
      ).toBe(false);
    });
  });
});
