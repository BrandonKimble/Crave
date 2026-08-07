/**
 * F882 — THE SKELETON MUST DRAW THE CARD WE ACTUALLY SHIP.
 *
 * Two drifts, both visible to the eye on a slow cold load, both the exact
 * skeleton→content jump this preset file's own header says it prevents:
 *
 *  (a) the result-card preset punched two 20×20 action holes into a right-hand
 *      heart/share column — with an ASCII diagram documenting `[♥ / share
 *      column]` — while the shipped card has NO heart (owner-ratified
 *      2026-07-26) and puts its actions in a pill row BELOW the body;
 *  (b) the photo-strip preset used TILE_HEIGHT 72 at 4:3 while the shipped
 *      gallery is 96 at 1.1, so 96×72 placeholders resolved into ~106×96 photos.
 *
 * RED recipe: restore either drifted number (the 20×20 column, or
 * PHOTO_STRIP_TILE_HEIGHT = 72 / ASPECT = 4/3 as local literals instead of the
 * imported gallery constants) and the matching case fails.
 */
jest.mock('react-native', () => ({
  Dimensions: { get: () => ({ width: 393, height: 852 }) },
  StyleSheet: { create: <T>(styles: T): T => styles, absoluteFillObject: {} },
  Platform: { OS: 'ios', select: (spec: Record<string, unknown>) => spec.ios },
}));

import { buildPresetHoles } from './cutout-skeleton-presets';
import {
  RESULT_CARD_GALLERY_HEIGHT,
  RESULT_CARD_GALLERY_TILE_ASPECT,
} from '../cards/ResultCard/result-card-slot-styles';
import { PHOTO_STRIP_TILE_GAP, PHOTO_STRIP_TILE_RADIUS } from '../photos/photo-strip-metrics';

const ROW_WIDTH = 335;

const build = (rowType: 'restaurant' | 'dish' | 'photoStrip') =>
  buildPresetHoles({ rowType, rowWidth: ROW_WIDTH, rowCount: 1, insetX: 0, insetY: 0 });

describe('result-card preset matches the shipped card anatomy', () => {
  it('draws NO right-hand action column — the heart is dead on cards', () => {
    const holes = build('restaurant');
    const rightEdge = ROW_WIDTH;
    const squareActionHoles = holes.filter(
      (hole) => hole.width === 20 && hole.height === 20 && hole.x + hole.width > rightEdge - 40
    );
    expect(squareActionHoles).toHaveLength(0);
  });

  it('draws the PILL ROW the card has, below the body and left-aligned', () => {
    const holes = build('restaurant');
    const pills = holes.filter((hole) => hole.height === 32);
    expect(pills.length).toBeGreaterThanOrEqual(2);

    // All pills share one baseline, start at the content edge, and run rightward.
    const [first, ...rest] = pills;
    expect(first.x).toBe(0);
    rest.forEach((pill) => expect(pill.y).toBe(first.y));
    // Below every body line.
    const bodyBottom = Math.max(
      ...holes.filter((hole) => hole.height <= 16).map((hole) => hole.y + hole.height)
    );
    expect(first.y).toBeGreaterThanOrEqual(bodyBottom);
    // Pill-shaped, not the old 10-radius square.
    pills.forEach((pill) => expect(pill.borderRadius).toBe(16));
  });

  it('the title spans the full row — no dead gutter reserved for a column that is gone', () => {
    const holes = build('dish');
    const rank = holes[0];
    const title = holes[1];
    // 0.58 of the FULL row width (not of rowWidth - 32 - gap).
    expect(title.width).toBeCloseTo(ROW_WIDTH * 0.58, 5);
    expect(title.x).toBeGreaterThan(rank.x);
  });

  it('the row stride leaves room for the pill row (rows do not overlap on swap)', () => {
    const twoRows = buildPresetHoles({
      rowType: 'restaurant',
      rowWidth: ROW_WIDTH,
      rowCount: 2,
      insetX: 0,
      insetY: 0,
    });
    const firstRowBottom = Math.max(...build('restaurant').map((hole) => hole.y + hole.height));
    const secondRowTop = Math.min(
      ...twoRows.filter((hole) => hole.y > firstRowBottom - 1).map((hole) => hole.y)
    );
    expect(secondRowTop).toBeGreaterThanOrEqual(firstRowBottom);
  });
});

describe('photo-strip preset mirrors the shipped gallery', () => {
  it('tile geometry comes from the gallery constants, not a restated copy', () => {
    const holes = build('photoStrip');
    expect(holes.length).toBeGreaterThan(1);
    const expectedWidth = Math.round(RESULT_CARD_GALLERY_HEIGHT * RESULT_CARD_GALLERY_TILE_ASPECT);
    // First tile is full-size (later ones clamp at the right edge).
    expect(holes[0].height).toBe(RESULT_CARD_GALLERY_HEIGHT);
    expect(holes[0].width).toBe(expectedWidth);
    expect(holes[0].borderRadius).toBe(PHOTO_STRIP_TILE_RADIUS);
  });

  it('tiles are spaced by the strip’s own gap', () => {
    const holes = build('photoStrip');
    expect(holes[1].x - (holes[0].x + holes[0].width)).toBe(PHOTO_STRIP_TILE_GAP);
  });

  it('THE DRIFT THAT WAS THERE: 96×72 at 4:3 is no longer what we draw', () => {
    const holes = build('photoStrip');
    expect(holes[0].height).not.toBe(72);
    expect(holes[0].width / holes[0].height).not.toBeCloseTo(4 / 3, 2);
  });
});
