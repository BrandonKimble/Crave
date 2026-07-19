/**
 * Geo-primitive fixtures (plans/geo-demand-foundation-rebuild.md §1/§2, R1
 * "anywhere on earth"): wrap-aware longitude (a bbox with minLng > maxLng
 * crosses the antimeridian — Fiji/Chukotka must judge like anywhere else)
 * and cos(midLat)-weighted areas (Norway must not distort the 1/3 law).
 */
import {
  GeoBbox,
  bboxArea,
  bboxCenter,
  bboxContains,
  bboxContainsPoint,
  bboxIntersectionParts,
  bboxLngSpan,
  bboxUnion,
  pointToBboxDistance,
} from './place-geo';

/** Fiji-flavored crossing bbox: 176°E → 178°W (lng span 6°). */
const FIJI: GeoBbox = { minLat: -21, minLng: 176, maxLat: -12, maxLng: -178 };

const degCos = (deg: number): number => Math.cos((deg * Math.PI) / 180);

describe('place-geo — wrap-aware longitude (antimeridian)', () => {
  it('a crossing view intersects a crossing place with full, non-zero coverage (Fiji)', () => {
    // Seam-straddling view wholly inside the Fiji bbox.
    const view: GeoBbox = {
      minLat: -19,
      minLng: 178,
      maxLat: -17,
      maxLng: -179,
    };
    expect(bboxLngSpan(view)).toBeCloseTo(3, 9);
    expect(bboxArea(view)).toBeGreaterThan(0); // NOT the old area-0 collapse

    const parts = bboxIntersectionParts(FIJI, view);
    expect(parts.length).toBeGreaterThan(0);
    const intersectionArea = parts.reduce(
      (sum, part) => sum + bboxArea(part),
      0,
    );
    // View ⊂ place → coverage of view is 1.
    expect(intersectionArea / bboxArea(view)).toBeCloseTo(1, 6);
  });

  it('a seam-straddling overlap splits into two parts whose areas sum to the true overlap', () => {
    // Full-longitude band ∩ crossing place: both arcs survive.
    const band: GeoBbox = {
      minLat: -19,
      minLng: -180,
      maxLat: -17,
      maxLng: 180,
    };
    const parts = bboxIntersectionParts(FIJI, band);
    expect(parts).toHaveLength(2);
    const lngSpanSum = parts.reduce((sum, part) => sum + bboxLngSpan(part), 0);
    expect(lngSpanSum).toBeCloseTo(6, 9); // the place's own lng span
  });

  it('disjoint across the seam stays disjoint', () => {
    const view: GeoBbox = {
      minLat: -19,
      minLng: 100,
      maxLat: -17,
      maxLng: 150,
    };
    expect(bboxIntersectionParts(FIJI, view)).toEqual([]);
  });

  it('center of {179, -179} is ±180, not 0', () => {
    const center = bboxCenter({
      minLat: 0,
      minLng: 179,
      maxLat: 0,
      maxLng: -179,
    });
    expect(Math.abs(center.lng)).toBe(180);
  });

  it('union of two boxes straddling the line stays tight (smaller enclosing arc)', () => {
    const west: GeoBbox = { minLat: 0, minLng: 170, maxLat: 1, maxLng: 175 };
    const east: GeoBbox = { minLat: 0, minLng: -175, maxLat: 1, maxLng: -170 };
    const union = bboxUnion(west, east);
    expect(union).toEqual({ minLat: 0, minLng: 170, maxLat: 1, maxLng: -170 });
    expect(bboxLngSpan(union as GeoBbox)).toBeCloseTo(20, 9); // NOT ~350
    // Never shrinks: the hull contains both inputs.
    expect(bboxContains(union as GeoBbox, west)).toBe(true);
    expect(bboxContains(union as GeoBbox, east)).toBe(true);
  });

  it('union away from the seam is the plain hull (unchanged law)', () => {
    expect(
      bboxUnion(
        { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
        { minLat: 2, minLng: 2, maxLat: 3, maxLng: 3 },
      ),
    ).toEqual({ minLat: 0, minLng: 0, maxLat: 3, maxLng: 3 });
  });

  it('containment and point-membership see across the line', () => {
    const seamBox: GeoBbox = {
      minLat: 0,
      minLng: 170,
      maxLat: 1,
      maxLng: -170,
    };
    expect(
      bboxContains(seamBox, { minLat: 0, minLng: 175, maxLat: 1, maxLng: 178 }),
    ).toBe(true);
    expect(
      bboxContains(seamBox, {
        minLat: 0,
        minLng: -178,
        maxLat: 1,
        maxLng: -172,
      }),
    ).toBe(true);
    expect(
      bboxContains(seamBox, { minLat: 0, minLng: 160, maxLat: 1, maxLng: 175 }),
    ).toBe(false);
    // The full-world box contains a crossing box.
    expect(
      bboxContains(
        { minLat: -90, minLng: -180, maxLat: 90, maxLng: 180 },
        seamBox,
      ),
    ).toBe(true);
    expect(bboxContainsPoint(seamBox, { lat: 0.5, lng: 179 })).toBe(true);
    expect(bboxContainsPoint(seamBox, { lat: 0.5, lng: -179 })).toBe(true);
    expect(bboxContainsPoint(seamBox, { lat: 0.5, lng: 0 })).toBe(false);
  });

  it('point-to-bbox distance is circular: -179° is 3° from a box ending at 178°, not 357°', () => {
    const distance = pointToBboxDistance(
      { lat: 0.5, lng: -179 },
      { minLat: 0, minLng: 170, maxLat: 1, maxLng: 178 },
    );
    expect(distance).toBeCloseTo(3, 9);
  });
});

describe('place-geo — cos-weighted area (the 1/3 law across latitudes)', () => {
  it('area is latSpan × lngSpan × cos(midLat)', () => {
    expect(
      bboxArea({ minLat: 60, minLng: 10, maxLat: 61, maxLng: 11 }),
    ).toBeCloseTo(degCos(60.5), 9);
    expect(
      bboxArea({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 }),
    ).toBeCloseTo(degCos(0.5), 9);
  });

  it('commensurability ratios survive latitude: a 1°-square at 60°N covers a third of a 3×1° view there', () => {
    // Same-latitude view and place: cos cancels EXACTLY in the ratio, as the
    // old flat-degree header claimed; the weighting matters when latitudes
    // differ (a tall Norway place vs a compact view no longer inflates the
    // place by its polar-stretched degree-longitude).
    const view: GeoBbox = { minLat: 60, minLng: 0, maxLat: 61, maxLng: 3 };
    const place: GeoBbox = { minLat: 60, minLng: 0, maxLat: 61, maxLng: 1 };
    expect(bboxArea(place) / bboxArea(view)).toBeCloseTo(1 / 3, 9);
  });
});
