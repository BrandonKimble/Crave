import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PhotoReads } from './photo-reads';

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
  const read = (p: string) => readFileSync(join(__dirname, p), 'utf8');
  const controller = read('photos.controller.ts');
  const tileGallery = read(
    join('..', 'user-lists', 'user-list-tile-gallery.service.ts'),
  );

  it('no photo route reads through the unscoped service', () => {
    const unscoped = [...controller.matchAll(/this\.reads\.(\w+)\(/g)].map(
      (m) => m[1],
    );
    expect(unscoped).toEqual([]);
  });

  it('every photo read route goes through forViewer', () => {
    const scoped = [
      ...controller.matchAll(/photoReads\s*\n?\s*\.?forViewer\(/g),
    ];
    expect(scoped.length).toBeGreaterThanOrEqual(3);
  });

  it('the list-tile gallery reads through the seam, not PhotoReadService', () => {
    expect(tileGallery).toContain('forViewer(');
    expect(tileGallery).not.toContain('this.photoRead.');
  });
});
