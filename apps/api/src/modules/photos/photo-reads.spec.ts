import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PhotoReads } from './photo-reads';
import { filesImporting } from '../../shared/testing/import-scan';

const SRC = join(__dirname, '..', '..');
const tileGallery = readFileSync(
  join(SRC, 'modules/user-lists/user-list-tile-gallery.service.ts'),
  'utf8',
);

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

describe('the seam is the only door', () => {
  // IMPORT-BASED, WHOLE-TREE (red team 2026-08-02). The previous version of
  // this block did two things wrong at once. It grepped `this.reads.` against
  // the controller — whose field is named `photoReads`, so the pattern matched
  // NOTHING and the test asserted that nothing equals nothing. And it read two
  // hard-coded files, so a third consumer was invisible in exactly the way the
  // tile gallery had been.
  //
  // Containment is a property of the whole tree, so the guard has to be too.
  it('nothing outside the photos seam imports PhotoReadService', () => {
    const offenders = filesImporting('PhotoReadService', {
      root: SRC,
      allow: [
        // The seam itself, and the module that provides it.
        'modules/photos/photo-reads.ts',
        'modules/photos/photos.module.ts',
        // The service's own file.
        'modules/photos/photo-read.service.ts',
      ],
    });
    expect(offenders).toEqual([]);
  });

  it('the scanner can see a real import (it is not vacuously green)', () => {
    // If the walker silently matched nothing, the assertion above would pass
    // forever. Prove it finds a symbol we know is imported widely.
    const seen = filesImporting('PrismaService', { root: SRC });
    expect(seen.length).toBeGreaterThan(10);
  });

  it('the list-tile gallery reads through the seam', () => {
    expect(tileGallery).toContain('forViewer(');
  });
});

// The ROUTE must expose what the service supports. The gallery service has
// taken limit/offset since it was written, but the controller never read them
// — so the endpoint could only ever return the default page while reporting a
// larger honest total, with no way for a client to reach the rest.
describe('gallery paging reaches the route', () => {
  const controller = readFileSync(
    join(__dirname, 'photos.controller.ts'),
    'utf8',
  );

  it('the gallery route accepts and forwards limit/offset', () => {
    const at = controller.indexOf('async restaurantGallery(');
    expect(at).toBeGreaterThan(-1);
    const body = controller.slice(at, at + 420);
    expect(body).toContain('@Query()');
    expect(body).toContain('limit: query.limit');
    expect(body).toContain('offset: query.offset');
  });

  it('the paging DTO is bounded — an unbounded limit is a DoS lever', () => {
    expect(controller).toContain('class RestaurantGalleryQueryDto');
    const at = controller.indexOf('class RestaurantGalleryQueryDto');
    const dto = controller.slice(at, at + 400);
    expect(dto).toMatch(/@Max\(\d+\)/);
    expect(dto).toMatch(/@Min\(1\)/);
  });
});
