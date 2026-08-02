import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PhotoReads } from './photo-reads';

// BLOCKING IS A PROPERTY OF THE READ, NOT A REMEMBERED PRECONDITION.
//
// It used to be enforced at call sites. Some controllers remembered;
// PhotoReadService contained ZERO block logic; and `cardStrips` took no viewer
// at all, so it was structurally incapable of enforcing the rule while still
// returning each photo's authoring `userId`. "Did we remember the check?" was
// answerable only by reading every call site, and every new read endpoint was
// a fresh chance to forget.

const VIEWER = 'viewer-1';
const BLOCKED = 'blocked-author';
const OK = 'ok-author';

function photo(userId: string, photoId: string) {
  return {
    photoId,
    userId,
    connectionId: null,
    caption: null,
    takenAt: null,
    uploadedAt: new Date('2026-08-01T00:00:00Z'),
    urls: {},
  };
}

function build() {
  const reads = {
    cardStrips: jest.fn().mockResolvedValue({
      strips: [
        {
          key: 'r1',
          totalCount: 2,
          photos: [photo(OK, 'p1'), photo(BLOCKED, 'p2')],
        },
      ],
    }),
    restaurantGallery: jest.fn().mockResolvedValue({
      restaurantId: 'r1',
      totalCount: 2,
      all: [photo(OK, 'p1'), photo(BLOCKED, 'p2')],
      byDish: [{ connectionId: 'c1', photos: [photo(BLOCKED, 'p2')] }],
    }),
    userFoodLog: jest.fn().mockResolvedValue([
      { restaurantId: 'r1', restaurantName: 'A', photos: [photo(OK, 'p1')] },
      {
        restaurantId: 'r2',
        restaurantName: 'B',
        photos: [photo(BLOCKED, 'p2')],
      },
    ]),
  };
  const blocks = {
    blockedPeerIds: jest.fn().mockResolvedValue(new Set([BLOCKED])),
  };
  return { model: new PhotoReads(reads as never, blocks as never), blocks };
}

describe('viewer-scoped photo reads', () => {
  it('cardStrips drops a blocked author — the read that COULD NOT enforce this before', async () => {
    const { model } = build();
    const { strips } = await model
      .forViewer(VIEWER)
      .cardStrips([{ restaurantId: 'r1' }]);
    expect(strips[0].photos.map((p) => p.photoId)).toEqual(['p1']);
  });

  it('totalCount reflects what the viewer can SEE', async () => {
    // Reporting the unfiltered count leaks the existence of hidden photos and
    // makes "N photos" disagree with the N actually rendered.
    const { model } = build();
    const { strips } = await model
      .forViewer(VIEWER)
      .cardStrips([{ restaurantId: 'r1' }]);
    expect(strips[0].totalCount).toBe(1);
  });

  it('the gallery filters BOTH the all-list and every dish section', async () => {
    const { model } = build();
    const gallery = await model.forViewer(VIEWER).restaurantGallery('r1');
    expect(gallery.all.map((p) => p.photoId)).toEqual(['p1']);
    expect(gallery.byDish[0].photos).toEqual([]);
    expect(gallery.totalCount).toBe(1);
  });

  it('a food-log group that becomes empty disappears rather than rendering blank', async () => {
    const { model } = build();
    const groups = await model.forViewer(VIEWER).userFoodLog('u2', VIEWER);
    expect(groups.map((g) => g.restaurantId)).toEqual(['r1']);
  });

  it('an anonymous viewer filters nothing and asks the block store nothing', async () => {
    const { model, blocks } = build();
    const { strips } = await model
      .forViewer(null)
      .cardStrips([{ restaurantId: 'r1' }]);
    expect(strips[0].photos).toHaveLength(2);
    expect(blocks.blockedPeerIds).not.toHaveBeenCalled();
  });

  it('blocking is BOTH directions — it uses the peer set, not just who the viewer blocked', async () => {
    const { model, blocks } = build();
    await model.forViewer(VIEWER).cardStrips([{ restaurantId: 'r1' }]);
    expect(blocks.blockedPeerIds).toHaveBeenCalledWith(VIEWER);
  });
});

describe('the seam is the only door', () => {
  const controller = readFileSync(
    join(__dirname, 'photos.controller.ts'),
    'utf8',
  );

  it('no photo route reads through the unscoped service', () => {
    // `this.reads.<method>` is the pre-seam shape. If it reappears, a route
    // is reading photos without naming a viewer again.
    const unscoped = [...controller.matchAll(/this\.reads\.(\w+)\(/g)].map(
      (m) => m[1],
    );
    expect(unscoped).toEqual([]);
  });

  it('every read route goes through forViewer', () => {
    const scoped = [
      ...controller.matchAll(/photoReads\s*\n?\s*\.?forViewer\(/g),
    ];
    expect(scoped.length).toBeGreaterThanOrEqual(3);
  });
});
