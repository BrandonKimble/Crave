import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PhotoReads } from './photo-reads';
import {
  PhotosController,
  RestaurantGalleryQueryDto,
} from './photos.controller';

// BLOCKING IS A PROPERTY OF THE QUERY, NOT OF THE RESULT.
//
// It used to be enforced at call sites. Some controllers remembered;
// PhotoReadService contained ZERO block logic; and `cardStrips` took no viewer
// at all, so it was structurally incapable of enforcing the rule while still
// returning each photo's authoring `userId`.
//
// The FIRST version of this seam then filtered the result in memory, which was
// wrong in two ways at once (red team 2026-08-02): strips are capped by a
// ROW_NUMBER window and galleries are LIMIT/OFFSET pages, so removing rows
// afterwards returned SHORT pages with no way to backfill; and `totalCount` —
// a real COUNT over every photo — became the length of the truncated page, so
// a 200-photo restaurant reported 60 and a strip could never exceed 10.
//
// An exclusion applied after LIMIT is not an exclusion, it is a truncation.
// These tests assert the blocked set travels INTO the read.

const VIEWER = 'viewer-1';
const BLOCKED_A = 'blocked-a';
const BLOCKED_B = 'blocked-b';

type Call = Record<string, unknown>;

function build() {
  const reads = {
    cardStrips: jest.fn().mockResolvedValue({ strips: [] }),
    restaurantGallery: jest.fn().mockResolvedValue({
      restaurantId: 'r1',
      totalCount: 0,
      all: [],
      byDish: [],
    }),
    userFoodLog: jest.fn().mockResolvedValue([]),
    stripPhotos: jest.fn().mockResolvedValue({
      byRestaurant: new Map(),
      byConnection: new Map(),
      countsByRestaurant: new Map(),
      countsByConnection: new Map(),
    }),
  };
  const blocks = {
    blockedPeerIds: jest
      .fn()
      .mockResolvedValue(new Set([BLOCKED_A, BLOCKED_B])),
  };
  return {
    model: new PhotoReads(reads as never, blocks as never),
    reads,
    blocks,
  };
}

describe('the exclusion is pushed into the query', () => {
  it('cardStrips passes the blocked set down, and does not post-filter', async () => {
    const { model, reads } = build();
    await model.forViewer(VIEWER).cardStrips([{ restaurantId: 'r1' }]);
    const options = (reads.cardStrips.mock.calls as Call[][])[0][1] as {
      excludeUserIds: readonly string[];
    };
    expect([...options.excludeUserIds].sort()).toEqual([BLOCKED_A, BLOCKED_B]);
  });

  it('restaurantGallery passes it down WITHOUT clobbering limit/offset', async () => {
    // The page params must survive — an earlier draft spread them in the wrong
    // order and would have silently reset pagination.
    const { model, reads } = build();
    await model
      .forViewer(VIEWER)
      .restaurantGallery('r1', { limit: 30, offset: 60 });
    const params = (reads.restaurantGallery.mock.calls as Call[][])[0][1] as {
      limit: number;
      offset: number;
      excludeUserIds: readonly string[];
    };
    expect(params.limit).toBe(30);
    expect(params.offset).toBe(60);
    expect([...params.excludeUserIds].sort()).toEqual([BLOCKED_A, BLOCKED_B]);
  });

  it('stripPhotos is wrapped too — the list-tile gallery consumes it directly', async () => {
    // This was the second door: user-list-tile-gallery called PhotoReadService
    // straight, so a blocked author could front a tile while the seam claimed
    // forgetting was unrepresentable.
    const { model, reads } = build();
    await model.forViewer(VIEWER).stripPhotos({ restaurantIds: ['r1'] });
    const params = (reads.stripPhotos.mock.calls as Call[][])[0][0] as {
      excludeUserIds: readonly string[];
    };
    expect([...params.excludeUserIds].sort()).toEqual([BLOCKED_A, BLOCKED_B]);
  });

  it('the page and the TOTAL are different numbers — the fixture that would have caught the regression', async () => {
    // The bug this replaces: `totalCount` was set to the length of the
    // filtered page. The original fixture used totalCount:2 with exactly 2
    // photos, so the two quantities coincided and the mix-up was invisible.
    // Here the underlying read reports a total of 87 while handing back a
    // page of 3 — if anything downstream re-derives the count from the page,
    // this fails.
    const { model, reads } = build();
    reads.restaurantGallery.mockResolvedValue({
      restaurantId: 'r1',
      totalCount: 87,
      all: [1, 2, 3].map((n) => ({ photoId: `p${n}`, userId: 'a' })),
      byDish: [],
    });
    const gallery = await model
      .forViewer(VIEWER)
      .restaurantGallery('r1', { limit: 3 });
    expect(gallery.totalCount).toBe(87);
    expect(gallery.all).toHaveLength(3);
  });

  it('an anonymous viewer excludes nothing and asks the block store nothing', async () => {
    const { model, reads, blocks } = build();
    await model.forViewer(null).cardStrips([{ restaurantId: 'r1' }]);
    const options = (reads.cardStrips.mock.calls as Call[][])[0][1] as {
      excludeUserIds: readonly string[];
    };
    expect(options.excludeUserIds).toEqual([]);
    expect(blocks.blockedPeerIds).not.toHaveBeenCalled();
  });

  it('blocking is BOTH directions — it uses the peer set', async () => {
    const { model, blocks } = build();
    await model.forViewer(VIEWER).cardStrips([{ restaurantId: 'r1' }]);
    expect(blocks.blockedPeerIds).toHaveBeenCalledWith(VIEWER);
  });

  it('the food log is NOT author-filtered, deliberately', async () => {
    // A food log is scoped to ONE person, so an author exclusion is either a
    // no-op or it empties the whole log. The meaningful gate is the blocked-
    // PAIR check the controller performs.
    const { model, reads } = build();
    await model.forViewer(VIEWER).userFoodLog('u2', VIEWER);
    expect(reads.userFoodLog).toHaveBeenCalledWith('u2', VIEWER);
  });
});

describe('gallery paging reaches the route', () => {
  // WAS TWO SOURCE SCANS. One walked the tree for files importing
  // `PhotoReadService` — an import boundary, which ESLint now enforces on
  // VALUE imports (a type cannot be injected or called, so `import type` is
  // still allowed). The other grepped this controller for the strings
  // `limit: query.limit` and `@Max(`, which is the shape of the check, not
  // its effect. These call the route.
  //
  // The defect they were written for: the gallery service has taken
  // limit/offset since it was written, but the controller never read them, so
  // the endpoint could only ever return the default page while reporting a
  // larger honest total — with no way for a client to reach the rest.

  function controllerWith(reads: unknown) {
    return new PhotosController(
      {} as never,
      {} as never,
      { isBlockedPair: jest.fn().mockResolvedValue(false) } as never,
      reads as never,
    );
  }

  it('forwards limit and offset from the query to the seam', async () => {
    const restaurantGallery = jest.fn().mockResolvedValue({ totalCount: 0 });
    const forViewer = jest.fn().mockReturnValue({ restaurantGallery });
    const controller = controllerWith({ forViewer });

    await controller.restaurantGallery(
      { userId: VIEWER } as never,
      'r1',
      Object.assign(new RestaurantGalleryQueryDto(), {
        limit: 30,
        offset: 60,
      }),
    );

    expect(forViewer).toHaveBeenCalledWith(VIEWER);
    expect(restaurantGallery).toHaveBeenCalledWith('r1', {
      limit: 30,
      offset: 60,
    });
  });

  it('an unbounded limit is REJECTED by validation — it is a DoS lever', async () => {
    const dto = plainToInstance(RestaurantGalleryQueryDto, {
      limit: 100_000,
      offset: 0,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['limit']);
  });

  it.each([
    ['limit', { limit: 0 }],
    ['offset', { offset: -1 }],
  ])('rejects a nonsensical %s', async (property, payload) => {
    const errors = await validate(
      plainToInstance(RestaurantGalleryQueryDto, payload),
    );
    expect(errors.map((e) => e.property)).toEqual([property]);
  });

  it('omitting paging entirely is valid — both are optional', async () => {
    const errors = await validate(
      plainToInstance(RestaurantGalleryQueryDto, {}),
    );
    expect(errors).toEqual([]);
  });
});
