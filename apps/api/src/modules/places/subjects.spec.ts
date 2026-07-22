/**
 * §2.5 POLYGON-NATIVE HEADER LAW fixtures (plans/geo-demand-foundation-
 * rebuild.md §2.5, ratified 2026-07-22): the ratified set — west-Texas band
 * (polygon coverage names Texas), the Mexico-bbox lie (index rectangles
 * never judge once ground is known — AND the finest-dominator rule already
 * fixes the owner's bug pre-polygon), TX/LA straddle reservation via the
 * DAG, city zoom → city, street zoom with/without a neighborhood. Plus the
 * ground clip/area kernel and the surviving probe-anchor budget. All pure —
 * the fixtures ARE the law's spec.
 *
 * The law LIVES in @crave-search/shared (header subject-store design: the
 * client runs the same law over its sliding catalog slice). These fixtures
 * run against the shared import — jest maps @crave-search/shared to the
 * package SOURCE, so a stale dist can never green a broken law.
 */
import {
  ATTENTION_FRACTION,
  COVERING_FRACTION,
  GeoBbox,
  MAX_PROBE_ANCHORS,
  PlaceGround,
  PlaceLike,
  SubjectCandidate,
  bboxArea,
  clipRingToRect,
  coverageOfView,
  groundArea,
  groundContainsPoint,
  groundCoverageOfView,
  probeAnchors,
  resolveHeaderPlace,
  resolvePlaceCoverage,
  ringShoelaceArea,
  subjectCandidatesInView,
} from '@crave-search/shared';

/** Rectangle ring helper: [lng, lat] positions, counter-clockwise. */
function rectRing(bbox: GeoBbox): number[][] {
  return [
    [bbox.minLng, bbox.minLat],
    [bbox.maxLng, bbox.minLat],
    [bbox.maxLng, bbox.maxLat],
    [bbox.minLng, bbox.maxLat],
  ];
}

function candidate(
  name: string,
  bbox: GeoBbox,
  coverageOfViewShare: number,
  overrides: Partial<SubjectCandidate> = {},
): SubjectCandidate {
  return {
    placeId: `id-${name}`,
    name,
    bbox,
    coverageOfView: coverageOfViewShare,
    placeArea: bboxArea(bbox),
    ...overrides,
  };
}

function placeLike(
  name: string,
  bbox: GeoBbox,
  overrides: Partial<PlaceLike> = {},
): PlaceLike {
  return {
    placeId: `id-${name}`,
    name,
    bbox,
    providerLevelCode: 'municipality',
    parentPlaceIds: [],
    ...overrides,
  };
}

describe('ground kernel — clip + shoelace + wrap (shared ground.ts)', () => {
  it('shoelace + Sutherland–Hodgman: a triangle half-covers its bounding square, clipped exactly', () => {
    // Right triangle over the unit square at the equator (cos ≈ 1).
    const triangle: number[][] = [
      [0, 0],
      [1, 0],
      [0, 1],
    ];
    expect(ringShoelaceArea(triangle)).toBeCloseTo(0.5, 9);
    // Clip to the left half of the square: a trapezoid of area 0.375.
    const clipped = clipRingToRect(triangle, {
      minLat: 0,
      minLng: 0,
      maxLat: 1,
      maxLng: 0.5,
    });
    expect(ringShoelaceArea(clipped)).toBeCloseTo(0.375, 9);
    // Clip to a disjoint rect: empty.
    expect(
      clipRingToRect(triangle, { minLat: 5, minLng: 5, maxLat: 6, maxLng: 6 }),
    ).toEqual([]);
  });

  it('groundCoverageOfView: polygon-clip share of the view, MultiPolygon = sum of parts', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const viewArea = bboxArea(view);
    // Two disjoint quarter-squares inside the view → coverage 0.5.
    const ground: PlaceGround = [
      rectRing({ minLat: 0, minLng: 0, maxLat: 0.5, maxLng: 0.5 }),
      rectRing({ minLat: 0.5, minLng: 0.5, maxLat: 1, maxLng: 1 }),
    ];
    expect(groundCoverageOfView(view, viewArea, ground)).toBeCloseTo(0.5, 6);
  });

  it('wrap-aware: a crossing (Fiji) view clips ground parts on BOTH sides of the seam', () => {
    const view: GeoBbox = {
      minLat: -19,
      minLng: 178,
      maxLat: -17,
      maxLng: -179,
    };
    const viewArea = bboxArea(view); // 3° lng arc × 2° lat, wrap-aware
    // Ground = two vendor-style parts, one each side of the antimeridian,
    // together tiling the whole view.
    const ground: PlaceGround = [
      rectRing({ minLat: -20, minLng: 177, maxLat: -16, maxLng: 180 }),
      rectRing({ minLat: -20, minLng: -180, maxLat: -16, maxLng: -178 }),
    ];
    expect(groundCoverageOfView(view, viewArea, ground)).toBeCloseTo(1, 6);
  });

  it('a zero-area (point) view degenerates to point-in-ground', () => {
    const point: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.5,
      maxLng: 0.5,
    };
    const ground: PlaceGround = [
      rectRing({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 }),
    ];
    expect(groundCoverageOfView(point, 0, ground)).toBe(1);
    expect(groundContainsPoint(ground, { lat: 5, lng: 5 })).toBe(false);
  });

  it('resolvePlaceCoverage: polygon = truth (bbox index noise is dropped), bbox = honest fallback', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const viewArea = bboxArea(view);
    // Bbox intersects the view; the real ground does NOT → not a candidate.
    const liar = resolvePlaceCoverage(view, viewArea, {
      bbox: { minLat: -2, minLng: -2, maxLat: 2, maxLng: 2 },
      ground: [rectRing({ minLat: -2, minLng: -2, maxLat: -1, maxLng: -1 })],
    });
    expect(liar).toBeNull();
    // No ground → bbox fallback with bbox area as the finest key.
    const fallback = resolvePlaceCoverage(view, viewArea, {
      bbox: { minLat: 0, minLng: 0, maxLat: 1, maxLng: 0.5 },
    });
    expect(fallback?.groundKnown).toBe(false);
    expect(fallback?.coverageOfView).toBeCloseTo(0.5, 6);
    // Ground present → polygon coverage and REAL ground area, not bbox area.
    const grounded = resolvePlaceCoverage(view, viewArea, {
      bbox: { minLat: -2, minLng: -2, maxLat: 2, maxLng: 2 },
      ground: [rectRing({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 })],
    });
    expect(grounded?.groundKnown).toBe(true);
    expect(grounded?.coverageOfView).toBeCloseTo(1, 6);
    expect(grounded?.placeArea).toBeCloseTo(
      groundArea([rectRing({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 })]),
      9,
    );
  });
});

describe('resolveHeaderPlace — §2.5 finest dominator (the ratified set)', () => {
  it('west-Texas band: Texas real ground covers ~89% of the view → "Texas"', () => {
    // Abstract geometry, real shape of the bug: the view hangs off Texas's
    // western edge; Texas's GROUND still covers 89% ≥ 2/3 → Texas claims it.
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 3, maxLng: 3 };
    const texas = placeLike(
      'Texas',
      { minLat: -1, minLng: 0.33, maxLat: 9, maxLng: 12 },
      {
        providerLevelCode: 'CountrySubdivision',
        parentPlaceIds: ['id-United States'],
        // Ground covers lng ∈ [0.33, 3] of the view → 2.67/3 ≈ 0.89.
        ground: [rectRing({ minLat: -1, minLng: 0.33, maxLat: 9, maxLng: 12 })],
      },
    );
    const result = resolveHeaderPlace(
      view,
      subjectCandidatesInView(view, [texas]),
    );
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Texas');
    expect(result.reason).toBe('finest-dominator');
    expect(result.place.coverageOfView).toBeCloseTo(0.89, 2);
  });

  it('the Mexico-bbox lie: a bbox CONTAINING the view but with 5% real ground can NEVER win once ground is present', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 3, maxLng: 3 };
    const texas = placeLike(
      'Texas',
      { minLat: -1, minLng: 0.33, maxLat: 9, maxLng: 12 },
      {
        providerLevelCode: 'CountrySubdivision',
        ground: [rectRing({ minLat: -1, minLng: 0.33, maxLat: 9, maxLng: 12 })],
      },
    );
    // Mexico: index rectangle swallows the whole view (the diagonal-border
    // lie), real ground touches a 0.45-degree² corner sliver (5%).
    const mexico = placeLike(
      'Mexico',
      { minLat: -20, minLng: -20, maxLat: 10, maxLng: 10 },
      {
        providerLevelCode: 'Country',
        ground: [
          rectRing({ minLat: -20, minLng: -20, maxLat: 0.45, maxLng: 1 }),
        ],
      },
    );
    const candidates = subjectCandidatesInView(view, [mexico, texas]);
    const mexicoCandidate = candidates.find((c) => c.name === 'Mexico');
    expect(mexicoCandidate?.coverageOfView).toBeLessThan(ATTENTION_FRACTION);

    const result = resolveHeaderPlace(view, candidates);
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Texas');
  });

  it('BBOX-ONLY FALLBACK already fixes the owner bug: with no polygons at all, Texas (89%, finer) beats the view-containing Mexico bbox', () => {
    // Pre-polygon world (§2.5(f) honest fallback): Mexico's bbox coverage is
    // 100% ≥ 2/3 — under the OLD law its containment could name it. Under
    // §2.5 BOTH are dominators (Texas bbox coverage 89% ≥ 2/3 too) and the
    // FINEST (smaller area) wins → Texas. The new law fixes the bug even
    // before any polygon lands.
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 3, maxLng: 3 };
    const texasBboxOnly = placeLike('Texas', {
      minLat: -1,
      minLng: 0.33,
      maxLat: 9,
      maxLng: 12,
    });
    const mexicoBboxOnly = placeLike('Mexico', {
      minLat: -20,
      minLng: -20,
      maxLat: 10,
      maxLng: 10,
    });
    const candidates = subjectCandidatesInView(view, [
      mexicoBboxOnly,
      texasBboxOnly,
    ]);
    const texasCandidate = candidates.find((c) => c.name === 'Texas');
    const mexicoCandidate = candidates.find((c) => c.name === 'Mexico');
    // Both dominate by coverage…
    expect(texasCandidate!.coverageOfView).toBeGreaterThanOrEqual(
      COVERING_FRACTION,
    );
    expect(mexicoCandidate!.coverageOfView).toBeCloseTo(1, 9);
    // …and the finer one is named.
    const result = resolveHeaderPlace(view, candidates);
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Texas');
  });

  it('TX/LA 50-50: the covering country is the dominator, but TWO of its children each hold ≥ 1/3 → straddle reservation → "this area"', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 2, maxLng: 4 };
    const us = candidate(
      'United States',
      { minLat: -10, minLng: -20, maxLat: 20, maxLng: 20 },
      1,
      { placeId: 'id-US' },
    );
    const texas = candidate(
      'Texas',
      { minLat: -1, minLng: -3, maxLat: 3, maxLng: 2 },
      0.5,
      { parentPlaceIds: ['id-US'] },
    );
    const louisiana = candidate(
      'Louisiana',
      { minLat: -1, minLng: 2, maxLat: 3, maxLng: 7 },
      0.5,
      { parentPlaceIds: ['id-US'] },
    );
    const result = resolveHeaderPlace(view, [us, texas, louisiana]);
    expect(result.kind).toBe('this-area');
    if (result.kind !== 'this-area') throw new Error('unreachable');
    expect(result.reason).toBe('straddle');
    expect(result.subjects.map((s) => s.name).sort()).toEqual([
      'Louisiana',
      'Texas',
    ]);
  });

  it('city zoom → city: every ancestor also covers, the FINEST dominator names the header', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 0.2, maxLng: 0.2 };
    const city = candidate(
      'Austin',
      { minLat: -0.1, minLng: -0.1, maxLat: 0.4, maxLng: 0.4 },
      1,
    );
    const county = candidate(
      'Travis',
      { minLat: -0.5, minLng: -0.5, maxLat: 1, maxLng: 1 },
      1,
    );
    const state = candidate(
      'Texas',
      { minLat: -5, minLng: -6, maxLat: 6, maxLng: 7 },
      1,
    );
    const country = candidate(
      'United States',
      { minLat: -30, minLng: -60, maxLat: 30, maxLng: 60 },
      1,
    );
    const result = resolveHeaderPlace(view, [country, state, county, city]);
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Austin');
    expect(result.subjects.map((s) => s.name)).toEqual(['Austin']);
  });

  it('street zoom WITH a neighborhood: the neighborhood out-fines the city (the old too-big arm is dead — descent falls out of "finest")', () => {
    const view: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.51,
      maxLng: 0.51,
    };
    const city = candidate(
      'Bigcity',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
      1,
      {
        placeId: 'id-city',
      },
    );
    const ward = candidate(
      'Old Ward',
      { minLat: 0.49, minLng: 0.49, maxLat: 0.52, maxLng: 0.52 },
      1,
      { parentPlaceIds: ['id-city'] },
    );
    const result = resolveHeaderPlace(view, [city, ward]);
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Old Ward');
  });

  it('street zoom WITHOUT a neighborhood: the city is the finest dominator (the old containing-fallback is subsumed, not lost)', () => {
    const view: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.52,
      maxLng: 0.52,
    };
    const city = candidate(
      'Bigcity',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
      1,
    );
    const county = candidate(
      'Vast County',
      { minLat: -1, minLng: -1, maxLat: 2, maxLng: 2 },
      1,
    );
    const result = resolveHeaderPlace(view, [county, city]);
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Bigcity');
    expect(result.reason).toBe('finest-dominator');
  });

  it('no dominator, two attention holders → straddle "this area" (two towns at ~half the view each)', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 2 };
    const a = candidate(
      'Aldertown',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
      0.5,
    );
    const b = candidate(
      'Birchville',
      { minLat: 0, minLng: 1, maxLat: 1, maxLng: 2 },
      0.5,
    );
    const result = resolveHeaderPlace(view, [a, b]);
    expect(result.kind).toBe('this-area');
    if (result.kind !== 'this-area') throw new Error('unreachable');
    expect(result.reason).toBe('straddle');
    expect(result.subjects.map((s) => s.name).sort()).toEqual([
      'Aldertown',
      'Birchville',
    ]);
  });

  it('the lone-commensurate branch is DEAD: one town at 40% with unnamed remainder is "this area", not the town', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const town = candidate(
      'Loneville',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 0.4 },
      0.4,
    );
    const result = resolveHeaderPlace(view, [town]);
    expect(result.kind).toBe('this-area');
    if (result.kind !== 'this-area') throw new Error('unreachable');
    expect(result.reason).toBe('unnamed-ground');
  });

  it('unnamed ground: continental view over city-scale places has no dominator and no attention holder', () => {
    const view: GeoBbox = { minLat: 25, minLng: -125, maxLat: 50, maxLng: -65 };
    const austin = candidate(
      'Austin',
      { minLat: 30.1, minLng: -97.95, maxLat: 30.52, maxLng: -97.56 },
      0.0001,
    );
    const result = resolveHeaderPlace(view, [austin]);
    expect(result).toEqual({
      kind: 'this-area',
      reason: 'unnamed-ground',
      subjects: [],
    });
  });

  it('boundary: coverage of exactly COVERING_FRACTION dominates (closed threshold, EPSILON-stable)', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 3 };
    const town = candidate(
      'Edge Town',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 2 },
      COVERING_FRACTION,
    );
    const result = resolveHeaderPlace(view, [town]);
    expect(result.kind).toBe('place');
  });
});

describe('subjectCandidatesInView — the shared slice read (both runtimes)', () => {
  it('derives coverage + finest key + parent edges; disjoint places drop', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 2 };
    const half = placeLike(
      'Halftown',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
      { parentPlaceIds: ['p-1'] },
    );
    const disjoint = placeLike('Elsewhere', {
      minLat: 10,
      minLng: 10,
      maxLat: 11,
      maxLng: 11,
    });
    const candidates = subjectCandidatesInView(view, [half, disjoint]);
    expect(candidates.map((c) => c.name)).toEqual(['Halftown']);
    expect(candidates[0].coverageOfView).toBeCloseTo(0.5, 6);
    expect(candidates[0].placeArea).toBeCloseTo(bboxArea(half.bbox), 9);
    expect(candidates[0].parentPlaceIds).toEqual(['p-1']);
  });

  it('a grounded slice row judges by its polygon, not its bbox', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const grounded = placeLike(
      'Groundtown',
      { minLat: -3, minLng: -3, maxLat: 3, maxLng: 3 }, // lying index box
      { ground: [rectRing({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 0.25 })] },
    );
    const [candidateRow] = subjectCandidatesInView(view, [grounded]);
    expect(candidateRow.coverageOfView).toBeCloseTo(0.25, 6);
    expect(candidateRow.placeArea).toBeCloseTo(groundArea(grounded.ground!), 9);
  });

  it('coverageOfView (bbox fallback): null when disjoint; a zero-area (point) view degenerates to coverage 1', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const far: GeoBbox = { minLat: 5, minLng: 5, maxLat: 6, maxLng: 6 };
    expect(coverageOfView(view, bboxArea(view), far)).toBeNull();
    const point: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.5,
      maxLng: 0.5,
    };
    expect(coverageOfView(point, bboxArea(point), view)).toBe(1);
  });

  it('wrap-aware: a crossing (Fiji) view derives full coverage from a crossing place bbox', () => {
    const view: GeoBbox = {
      minLat: -19,
      minLng: 178,
      maxLat: -17,
      maxLng: -179,
    };
    const fiji = placeLike('Fiji', {
      minLat: -21,
      minLng: 176,
      maxLat: -12,
      maxLng: -178,
    });
    const candidates = subjectCandidatesInView(view, [fiji]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].coverageOfView).toBeCloseTo(1, 6);
  });
});

describe('probeAnchors — §2 probe budget (KEPT: probe coverage, not headers)', () => {
  const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };

  it('budget: never more than 3 anchors, center first, on wholly unknown ground', () => {
    const anchors = probeAnchors(view, []);
    expect(MAX_PROBE_ANCHORS).toBe(3);
    expect(anchors).toHaveLength(3);
    expect(anchors[0]).toEqual({ lat: 0.5, lng: 0.5 }); // center leads
    for (const anchor of anchors) {
      expect(anchor.lat).toBeGreaterThanOrEqual(0);
      expect(anchor.lat).toBeLessThanOrEqual(1);
      expect(anchor.lng).toBeGreaterThanOrEqual(0);
      expect(anchor.lng).toBeLessThanOrEqual(1);
    }
  });

  it('a view fully answered by a commensurate-scale place needs no probes at all', () => {
    // 1.7×1.7 bbox over the 1×1 view: covering, and not too-big (area 2.89 ≤
    // 3 × viewArea) — it legitimately answers every anchor.
    const anchors = probeAnchors(view, [
      { minLat: -0.35, minLng: -0.35, maxLat: 1.35, maxLng: 1.35 },
    ]);
    expect(anchors).toEqual([]);
  });

  it('known commensurate-scale bboxes suppress their anchors; only unanswered ground is probed', () => {
    const anchors = probeAnchors(view, [
      { minLat: -0.1, minLng: -0.1, maxLat: 1.1, maxLng: 0.6 },
    ]);
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.length).toBeLessThanOrEqual(3);
    for (const anchor of anchors) {
      expect(anchor.lng).toBeGreaterThan(0.6);
    }
  });

  it('scale law (§1/§2): over-scale known ground answers NOTHING — country+city sketched, street zoom still probes', () => {
    const streetView: GeoBbox = {
      minLat: 0.5,
      minLng: 0.5,
      maxLat: 0.502,
      maxLng: 0.502,
    };
    const city: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const country: GeoBbox = {
      minLat: -30,
      minLng: -30,
      maxLat: 30,
      maxLng: 30,
    };
    const anchors = probeAnchors(streetView, [city, country]);
    expect(anchors).toHaveLength(MAX_PROBE_ANCHORS);
    // A commensurate-scale neighborhood over the same ground DOES answer.
    const ward: GeoBbox = {
      minLat: 0.4995,
      minLng: 0.4995,
      maxLat: 0.5025,
      maxLng: 0.5025,
    };
    expect(probeAnchors(streetView, [city, country, ward])).toEqual([]);
  });
});
