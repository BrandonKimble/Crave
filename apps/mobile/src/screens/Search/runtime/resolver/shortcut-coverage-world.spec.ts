// F4806: the coverage mapper is a WIRE BOUNDARY, and validation at a wire boundary must
// be uniform. Five numeric fields were checked with `typeof` + Number.isFinite; the two
// string fields were read as `(properties.x as string) ?? ''`, an unchecked assertion
// that only rejects null/undefined. Anything else truthy — a number id, an object —
// sailed through the `!restaurantId` check and landed in the emitted feature TYPED as
// string, and these features feed the map's pin layer, so a mistyped restaurantId
// becomes a pin identity. These pin the one rejection path.
import type { Feature, FeatureCollection, Point } from 'geojson';

import { mapShortcutCoverageWorldFeatures } from './shortcut-coverage-world';

const collectionOf = (properties: Record<string, unknown>): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'f-1',
      geometry: { type: 'Point', coordinates: [-97.74, 30.27] },
      properties,
    } as Feature<Point>,
  ],
});

const VALID = {
  restaurantId: 'r-1',
  restaurantName: 'Quiet Corner',
  rank: 1,
  craveScore: 9.1,
};

describe('mapShortcutCoverageWorldFeatures — uniform wire validation', () => {
  it('accepts a well-formed row', () => {
    const [feature] = mapShortcutCoverageWorldFeatures(collectionOf(VALID), false);
    expect(feature.properties.restaurantId).toBe('r-1');
    expect(feature.properties.restaurantName).toBe('Quiet Corner');
  });

  it('REJECTS a numeric restaurantId (the `as string ?? ""` used to emit it as a string)', () => {
    expect(
      mapShortcutCoverageWorldFeatures(collectionOf({ ...VALID, restaurantId: 42 }), false)
    ).toEqual([]);
  });

  it('REJECTS a non-string restaurantName the same way', () => {
    expect(
      mapShortcutCoverageWorldFeatures(
        collectionOf({ ...VALID, restaurantName: { name: 'Quiet Corner' } }),
        false
      )
    ).toEqual([]);
  });

  it('still rejects an absent id (the one case the old `??` did catch)', () => {
    expect(
      mapShortcutCoverageWorldFeatures(collectionOf({ ...VALID, restaurantId: undefined }), false)
    ).toEqual([]);
  });
});
