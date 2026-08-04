/**
 * THE GEO LAW, UNDER TEST (F1657, 2026-08-04).
 *
 * Until this file existed, `packages/shared` declared `"test": "echo 'No tests configured
 * yet'"` and root `yarn test` (turbo run test) reported the package GREEN for zero
 * assertions — the always-green disease in its purest form. Meanwhile this directory holds
 * the wrap-aware longitude arithmetic that BOTH apps depend on: the API's catalog WHERE
 * clauses split a crossing view through `bboxLngArcs`, and the mobile header/subject law
 * judges coverage through `bboxArea`/`bboxIntersectionParts`. Pure math, no IO, cheap to
 * test and expensive to get wrong.
 *
 * WHAT THIS SUITE IS FOR. Two kinds of case, deliberately:
 *   1. LAW cases — the invariants stated in place-geo.ts's own header, each written so it
 *      can FAIL: wrap-awareness (minLng > maxLng means the box crosses the antimeridian),
 *      cos-weighted area, the smaller-enclosing-arc union, closed-interval containment.
 *   2. PROPERTY cases — the same laws asserted over a swept grid of boxes rather than a
 *      hand-picked example, so a regression cannot hide in the gap between two literals.
 *      (Fixed sweeps, not random input: a test that fails on a different seed each run is
 *      not a regression signal.)
 *
 * MUTATION-PROVEN (measured 2026-08-04, not asserted): flipping `bboxLngSpan`'s wrap branch
 * to the naive `maxLng - minLng` turns 12 of these 39 cases RED; dropping the `cos(midLat)`
 * factor from `bboxArea` turns 2 RED. If an edit to this directory leaves every case green,
 * re-run one of those two mutations before trusting the green.
 *
 * RUNNER: node's built-in test runner with type-stripping — `yarn workspace
 * @crave-search/shared test`. Zero new dependencies on purpose; the package had none and a
 * test rail that needs an install is a test rail that gets skipped.
 */
import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import {
  bboxArea,
  bboxCenter,
  bboxContains,
  bboxContainsPoint,
  bboxCrossesAntimeridian,
  bboxIntersectionParts,
  bboxLatSpan,
  bboxLngArcs,
  bboxLngSpan,
  bboxUnion,
  circularLngDelta,
  isGeoPoint,
  normalizeLng,
  normalizePlaceName,
  pointDistanceMeters,
  pointToBbox,
  pointToBboxDistance,
  type GeoBbox,
} from './place-geo.ts';

const bbox = (minLat: number, minLng: number, maxLat: number, maxLng: number): GeoBbox => ({
  minLat,
  minLng,
  maxLat,
  maxLng,
});

/** Areas are cos-weighted floats; compare with a tolerance, never with `===`. */
const closeTo = (actual: number, expected: number, epsilon = 1e-9): void => {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `expected ${actual} to be within ${epsilon} of ${expected}`
  );
};

// The three shapes every law below is swept over. Named so a failure message says WHICH
// class of box broke rather than printing four anonymous numbers.
const AUSTIN = bbox(30.1, -97.9, 30.5, -97.6); // ordinary western-hemisphere box
const BERLIN = bbox(52.3, 13.1, 52.7, 13.8); // ordinary eastern-hemisphere box
const ATLANTIC = bbox(-10, -20, 10, 20); // spans the prime meridian
const FIJI = bbox(-18.5, 177, -16.5, -178); // CROSSES the antimeridian (minLng > maxLng)
const CHUKOTKA = bbox(64, 170, 70, -170); // crosses, high latitude
const SEAM_POINT = bbox(0, 180, 0, 180); // degenerate, exactly on the seam
const DEGENERATE = bbox(10, 10, 10, 10); // zero-area point-as-bbox
const WHOLE_WORLD = bbox(-90, -180, 90, 180);

const ALL = [AUSTIN, BERLIN, ATLANTIC, FIJI, CHUKOTKA, SEAM_POINT, DEGENERATE, WHOLE_WORLD];
const CROSSING = [FIJI, CHUKOTKA];
const NON_CROSSING = [AUSTIN, BERLIN, ATLANTIC, SEAM_POINT, DEGENERATE, WHOLE_WORLD];

describe('normalizeLng — the seam is a value, not a special case', () => {
  test('in-range longitudes pass through untouched, including both poles of the seam', () => {
    for (const lng of [-180, -179.9, -90, -0.0001, 0, 0.0001, 90, 179.9, 180]) {
      assert.equal(normalizeLng(lng), lng, `lng ${lng} must pass through`);
    }
  });

  test('out-of-range longitudes fold into [-180, 180]', () => {
    assert.equal(normalizeLng(181), -179);
    assert.equal(normalizeLng(-181), 179);
    assert.equal(normalizeLng(360), 0);
    assert.equal(normalizeLng(540), -180); // 540° = 180°, and the fold lands on the −180 pole
  });

  test('PROPERTY: normalizing is idempotent and preserves the angle mod 360', () => {
    for (let lng = -1080; lng <= 1080; lng += 7.5) {
      const once = normalizeLng(lng);
      assert.ok(once >= -180 && once <= 180, `normalizeLng(${lng}) = ${once} left the range`);
      closeTo(normalizeLng(once), once, 1e-12);
      const delta = Math.abs(((((once - lng) % 360) + 360) % 360) % 360);
      assert.ok(
        delta < 1e-9 || Math.abs(delta - 360) < 1e-9,
        `normalizeLng(${lng}) changed the angle by ${delta}°`
      );
    }
  });
});

describe('bboxCrossesAntimeridian — the whole wrap law keys off this one predicate', () => {
  test('crossing is exactly minLng > maxLng', () => {
    for (const b of CROSSING) {
      assert.equal(bboxCrossesAntimeridian(b), true, `${JSON.stringify(b)} must read as crossing`);
    }
    for (const b of NON_CROSSING) {
      assert.equal(
        bboxCrossesAntimeridian(b),
        false,
        `${JSON.stringify(b)} must NOT read as crossing`
      );
    }
  });
});

describe('bboxLngSpan / bboxLatSpan — wraparound and degenerate boxes', () => {
  test('a crossing box measures the SHORT way around, not maxLng - minLng', () => {
    // The regression this exists to catch: naive maxLng - minLng gives -355 for Fiji.
    assert.equal(bboxLngSpan(FIJI), 5);
    assert.equal(bboxLngSpan(CHUKOTKA), 20);
  });

  test('ordinary boxes measure plainly', () => {
    closeTo(bboxLngSpan(AUSTIN), 0.3, 1e-12);
    closeTo(bboxLngSpan(BERLIN), 0.7, 1e-12);
    assert.equal(bboxLngSpan(ATLANTIC), 40);
    assert.equal(bboxLngSpan(WHOLE_WORLD), 360);
  });

  test('degenerate boxes have zero span in both axes', () => {
    assert.equal(bboxLngSpan(DEGENERATE), 0);
    assert.equal(bboxLatSpan(DEGENERATE), 0);
    assert.equal(bboxLngSpan(SEAM_POINT), 0);
    assert.equal(bboxLatSpan(SEAM_POINT), 0);
  });

  test('PROPERTY: lng span is always in [0, 360] and lat span never negative', () => {
    for (const b of ALL) {
      const span = bboxLngSpan(b);
      assert.ok(span >= 0 && span <= 360, `${JSON.stringify(b)} span ${span} left [0,360]`);
      assert.ok(bboxLatSpan(b) >= 0);
    }
    // Swept: every 5° box start, both orientations across the seam.
    for (let start = -180; start < 180; start += 5) {
      for (const width of [0, 0.5, 5, 90, 200, 359]) {
        const end = normalizeLng(start + width);
        const span = bboxLngSpan(bbox(0, start, 1, end));
        const expected = width === 360 ? 0 : width;
        closeTo(span, expected % 360 === 0 && width !== 0 ? 360 : expected, 1e-9);
      }
    }
  });

  test('an inverted-latitude box clamps to zero rather than reporting a negative span', () => {
    assert.equal(bboxLatSpan(bbox(30, 0, 10, 1)), 0);
  });
});

describe('bboxLngArcs — the seam split the DB prefilter depends on', () => {
  test('a non-crossing box is ONE arc, unchanged', () => {
    assert.deepEqual(bboxLngArcs(AUSTIN), [{ start: -97.9, end: -97.6 }]);
  });

  test('a crossing box splits into [minLng, 180] and [-180, maxLng]', () => {
    assert.deepEqual(bboxLngArcs(FIJI), [
      { start: 177, end: 180 },
      { start: -180, end: -178 },
    ]);
  });

  test('PROPERTY: arcs never cross, and their widths sum to the wrap-aware span', () => {
    for (const b of ALL) {
      const arcs = bboxLngArcs(b);
      assert.ok(arcs.length === 1 || arcs.length === 2, 'a bbox has 1 or 2 lng arcs, never more');
      let total = 0;
      for (const arc of arcs) {
        assert.ok(arc.start <= arc.end, `arc ${JSON.stringify(arc)} is itself crossing`);
        total += arc.end - arc.start;
      }
      closeTo(total, bboxLngSpan(b), 1e-9);
    }
  });
});

describe('bboxCenter — the center of {179, -179} is the seam, not the prime meridian', () => {
  test('a crossing box centers ON the seam side', () => {
    const center = bboxCenter(bbox(-1, 179, 1, -179));
    closeTo(center.lat, 0, 1e-12);
    closeTo(Math.abs(center.lng), 180, 1e-9);
  });

  test('ordinary boxes center by plain midpoint', () => {
    const center = bboxCenter(ATLANTIC);
    closeTo(center.lat, 0, 1e-12);
    closeTo(center.lng, 0, 1e-12);
  });

  test('PROPERTY: the center is inside its own box, for every shape', () => {
    for (const b of ALL) {
      assert.ok(
        bboxContainsPoint(b, bboxCenter(b)),
        `${JSON.stringify(b)} does not contain its own center`
      );
    }
  });
});

describe('bboxArea — cos-weighted, so cross-latitude ratios stay honest', () => {
  test('a degenerate box has zero area', () => {
    assert.equal(bboxArea(DEGENERATE), 0);
    assert.equal(bboxArea(SEAM_POINT), 0);
  });

  test('the SAME degree box shrinks with latitude by cos(midLat)', () => {
    const equatorial = bboxArea(bbox(-0.5, 0, 0.5, 1));
    const northern = bboxArea(bbox(59.5, 0, 60.5, 1));
    // cos(0) = 1 vs cos(60°) = 0.5 — the northern box must be ~half.
    closeTo(northern / equatorial, Math.cos((60 * Math.PI) / 180), 1e-6);
  });

  test('a crossing box is measured by its SHORT span, not the 355° complement', () => {
    closeTo(bboxArea(FIJI), bboxLatSpan(FIJI) * 5 * Math.cos((-17.5 * Math.PI) / 180), 1e-9);
  });

  test('PROPERTY: area is non-negative everywhere, including past the poles', () => {
    for (let lat = -90; lat <= 89; lat += 3) {
      assert.ok(bboxArea(bbox(lat, 0, lat + 1, 1)) >= 0, `negative area at lat ${lat}`);
    }
  });
});

describe('bboxIntersectionParts — a seam-straddling overlap genuinely splits in two', () => {
  test('disjoint latitudes intersect in nothing', () => {
    assert.deepEqual(bboxIntersectionParts(AUSTIN, BERLIN), []);
  });

  test('a crossing box against a seam-spanning view yields TWO parts', () => {
    const view = bbox(-20, -180, -15, 180); // whole-world lngs, Fiji latitudes
    const parts = bboxIntersectionParts(FIJI, view);
    assert.equal(parts.length, 2);
    for (const part of parts) {
      assert.equal(bboxCrossesAntimeridian(part), false, 'intersection parts are never crossing');
    }
    closeTo(
      parts.reduce((sum, p) => sum + (p.maxLng - p.minLng), 0),
      bboxLngSpan(FIJI),
      1e-9
    );
  });

  test('self-intersection reproduces the box (by area), crossing or not', () => {
    for (const b of ALL) {
      if (bboxLatSpan(b) === 0 && bboxLngSpan(b) === 0) continue;
      const parts = bboxIntersectionParts(b, b);
      const area = parts.reduce((sum, p) => sum + bboxArea(p), 0);
      closeTo(area, bboxArea(b), 1e-6);
    }
  });

  test('PROPERTY: intersection is commutative in area, and never exceeds either operand', () => {
    for (const a of ALL) {
      for (const b of ALL) {
        const ab = bboxIntersectionParts(a, b).reduce((s, p) => s + bboxArea(p), 0);
        const ba = bboxIntersectionParts(b, a).reduce((s, p) => s + bboxArea(p), 0);
        closeTo(ab, ba, 1e-6);
        assert.ok(
          ab <= bboxArea(a) + 1e-6 && ab <= bboxArea(b) + 1e-6,
          `intersection of ${JSON.stringify(a)} and ${JSON.stringify(b)} exceeds an operand`
        );
      }
    }
  });
});

describe('bboxUnion — the hull takes the SMALLER enclosing arc', () => {
  test('a null operand yields the other side, and two nulls yield null', () => {
    assert.equal(bboxUnion(null, null), null);
    assert.deepEqual(bboxUnion(AUSTIN, null), AUSTIN);
    assert.deepEqual(bboxUnion(undefined, BERLIN), BERLIN);
  });

  test('two boxes straddling the seam union into a TIGHT crossing box, not a near-world one', () => {
    const west = bbox(0, 178, 1, 179);
    const east = bbox(0, -179, 1, -178);
    const hull = bboxUnion(west, east);
    assert.ok(hull != null);
    assert.equal(bboxCrossesAntimeridian(hull), true, 'the tight hull crosses the seam');
    closeTo(bboxLngSpan(hull), 4, 1e-9);
  });

  test('ordinary boxes union to the plain hull', () => {
    const hull = bboxUnion(bbox(0, 0, 1, 1), bbox(2, 5, 3, 6));
    assert.deepEqual(hull, bbox(0, 0, 3, 6));
  });

  // FLOAT REALITY, RECORDED (found by this suite on its first run, 2026-08-04): the hull's
  // east edge is computed as `start + span`, so unioning Austin (−97.9…−97.6) with Berlin
  // (13.1…13.8) yields maxLng = 13.799999999999997 — three femto-degrees (≈ 3e-10 mm) short
  // of Berlin's own edge, which makes a STRICT `bboxContains` say false. That is float
  // arithmetic, not a wrap bug, and hardening the math against it would buy nothing real
  // (nothing in either app judges at 1e-15°). So the property asserts containment against a
  // hull nudged by ONE nanodegree, and this comment is the record that it was measured
  // rather than papered over. A regression bigger than a nanodegree still fails loudly.
  const NUDGE = 1e-9;
  const nudged = (b: GeoBbox): GeoBbox =>
    bboxLngSpan(b) >= 360
      ? b
      : bbox(
          b.minLat - NUDGE,
          normalizeLng(b.minLng - NUDGE),
          b.maxLat + NUDGE,
          normalizeLng(b.maxLng + NUDGE)
        );

  test('PROPERTY: the union contains both operands and never shrinks below either area', () => {
    for (const a of ALL) {
      for (const b of ALL) {
        const hull = bboxUnion(a, b);
        assert.ok(hull != null);
        assert.ok(
          bboxContains(nudged(hull), a),
          `hull of ${JSON.stringify(a)} + ${JSON.stringify(b)} lost the first operand`
        );
        assert.ok(
          bboxContains(nudged(hull), b),
          `hull of ${JSON.stringify(a)} + ${JSON.stringify(b)} lost the second operand`
        );
        assert.ok(bboxArea(hull) >= Math.max(bboxArea(a), bboxArea(b)) - 1e-6);
      }
    }
  });
});

describe('bboxContains / bboxContainsPoint — closed intervals, wrap-aware', () => {
  test('containment is closed at the edges', () => {
    assert.equal(bboxContainsPoint(AUSTIN, { lat: 30.1, lng: -97.9 }), true);
    assert.equal(bboxContainsPoint(AUSTIN, { lat: 30.5, lng: -97.6 }), true);
    assert.equal(bboxContainsPoint(AUSTIN, { lat: 30.5, lng: -97.5999 }), false);
  });

  test('a crossing box contains points on BOTH sides of the seam and nothing between', () => {
    assert.equal(bboxContainsPoint(FIJI, { lat: -17.5, lng: 179 }), true);
    assert.equal(bboxContainsPoint(FIJI, { lat: -17.5, lng: -179 }), true);
    assert.equal(bboxContainsPoint(FIJI, { lat: -17.5, lng: 0 }), false);
    assert.equal(bboxContainsPoint(FIJI, { lat: -17.5, lng: 176.9 }), false);
  });

  test('the whole world contains every box; a degenerate box contains only itself', () => {
    for (const b of ALL) {
      assert.ok(bboxContains(WHOLE_WORLD, b), `world must contain ${JSON.stringify(b)}`);
    }
    assert.equal(bboxContains(DEGENERATE, DEGENERATE), true);
    assert.equal(bboxContains(DEGENERATE, AUSTIN), false);
  });

  test('PROPERTY: containment is reflexive, and implies point-containment of the center', () => {
    for (const b of ALL) {
      assert.ok(bboxContains(b, b), `${JSON.stringify(b)} must contain itself`);
      assert.ok(bboxContainsPoint(b, bboxCenter(b)));
    }
  });
});

describe('circularLngDelta / pointToBboxDistance — the seam is 0° wide', () => {
  test('the delta takes the short way around', () => {
    assert.equal(circularLngDelta(-179, 179), 2);
    assert.equal(circularLngDelta(179, -179), -2);
    assert.equal(circularLngDelta(0, 0), 0);
  });

  test('a point just past the seam is DEGREES from a box just before it, not 357', () => {
    const box = bbox(-1, 175, 1, 178);
    const distance = pointToBboxDistance({ lat: 0, lng: -179 }, box);
    closeTo(distance, 3, 1e-9);
  });

  test('a point inside a box is at distance zero — including inside a crossing box', () => {
    assert.equal(pointToBboxDistance({ lat: 30.2, lng: -97.7 }, AUSTIN), 0);
    assert.equal(pointToBboxDistance({ lat: -17, lng: 179.5 }, FIJI), 0);
    assert.equal(pointToBboxDistance({ lat: -17, lng: -179.5 }, FIJI), 0);
  });

  test('PROPERTY: the delta always lands in [-180, 180)', () => {
    for (let a = -180; a <= 180; a += 7) {
      for (let b = -180; b <= 180; b += 11) {
        const d = circularLngDelta(a, b);
        assert.ok(d >= -180 && d < 180, `circularLngDelta(${a}, ${b}) = ${d} left the range`);
      }
    }
  });

  test('metric distance is symmetric and zero for identical points', () => {
    const a = { lat: 30.2, lng: -97.7 };
    const b = { lat: 30.3, lng: -97.6 };
    assert.equal(pointDistanceMeters(a, a), 0);
    closeTo(pointDistanceMeters(a, b), pointDistanceMeters(b, a), 1e-9);
    // Crossing the seam must not cost half a planet.
    assert.ok(pointDistanceMeters({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 }) < 25_000);
  });
});

describe('the small guards — point/bbox duality and name normalization', () => {
  test('pointToBbox produces a zero-area bbox that contains its own point', () => {
    const point = { lat: -17.5, lng: 179.5 };
    const box = pointToBbox(point);
    assert.equal(bboxArea(box), 0);
    assert.ok(bboxContainsPoint(box, point));
  });

  test('isGeoPoint separates the two shapes', () => {
    assert.equal(isGeoPoint({ lat: 1, lng: 2 }), true);
    assert.equal(isGeoPoint(AUSTIN), false);
  });

  test('normalizePlaceName trims and collapses whitespace, preserving case', () => {
    assert.equal(normalizePlaceName('  New   York  City '), 'New York City');
    assert.equal(normalizePlaceName('Austin'), 'Austin');
    assert.equal(normalizePlaceName('\tSan\n\nFrancisco '), 'San Francisco');
  });
});
