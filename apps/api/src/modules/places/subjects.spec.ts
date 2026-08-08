/**
 * CENTER-ANCHORED HEADER LAW fixtures (owner-ratified 2026-08-07; supersedes
 * the §2.5 dominator/straddle set of 2026-07-22). Each header fixture
 * mirrors a shape MEASURED on the live catalog by header-verdict-probe.ts:
 * the state-over-city regression, the nested-city/county false straddle,
 * the Mexico-bbox lie, block-zoom neighborhoods, the threshold and anchor
 * boundaries. Plus the ground clip/area kernel and the surviving
 * probe-anchor budget. All pure — the fixtures ARE the law's spec.
 *
 * The law LIVES in @crave-search/shared (header subject-store design: the
 * client runs the same law over its sliding catalog slice). These fixtures
 * run against the shared import — jest maps @crave-search/shared to the
 * package SOURCE, so a stale dist can never green a broken law.
 */
import {
  GeoBbox,
  HEADER_ATTENTION_FRACTION,
  MAX_PROBE_ANCHORS,
  PlaceGround,
  PlaceLike,
  ProbedRegion,
  SubjectCandidate,
  bboxArea,
  METERS_PER_DEGREE_LAT,
  probedRegionAnswersAnchor,
  bboxToGround,
  clipRingToRect,
  groundArea,
  groundContainsPoint,
  groundCoverageOfView,
  probeAnchors,
  probedRegionContainsPoint,
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
    coverageOfView: coverageOfViewShare,
    placeArea: bboxArea(bbox),
    providerLevelCode: 'Municipality',
    // Hand-built candidates default to centred — the tests that exercise
    // the anchor override this explicitly.
    containsViewCenter: true,
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
    providerLevelCode: 'Municipality',
    // §2.6: ground is REQUIRED — the default fixture is the sketch-grade
    // envelope (exactly what a sketch place_geometries row ships; wrap-aware:
    // a crossing bbox becomes two rings).
    ground: bboxToGround(bbox),
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

  it('resolvePlaceCoverage (§2.6 single-arm): the ONE ground judges — index noise drops, no-ground rows are invisible', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const viewArea = bboxArea(view);
    // The index (bbox) would intersect the view; the real ground does NOT →
    // not a candidate. There is no bbox arm to fall back to.
    const liar = resolvePlaceCoverage(view, viewArea, {
      ground: [rectRing({ minLat: -2, minLng: -2, maxLat: -1, maxLng: -1 })],
    });
    expect(liar).toBeNull();
    // Empty ground (a bbox-less birth: no ground knowledge) → invisible.
    expect(resolvePlaceCoverage(view, viewArea, { ground: [] })).toBeNull();
    // Sketch-grade envelope rectangle: same clip law, bbox-equal numbers —
    // the §2.6 "sketch-envelope == bbox semantics" continuity.
    const sketch = resolvePlaceCoverage(view, viewArea, {
      ground: [rectRing({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 0.5 })],
    });
    expect(sketch?.coverageOfView).toBeCloseTo(0.5, 6);
    // Full outline → polygon coverage and REAL ground area.
    const grounded = resolvePlaceCoverage(view, viewArea, {
      ground: [rectRing({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 })],
    });
    expect(grounded?.coverageOfView).toBeCloseTo(1, 6);
    expect(grounded?.placeArea).toBeCloseTo(
      groundArea([rectRing({ minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 })]),
      9,
    );
  });
});

describe('resolveHeaderPlace — the center-anchored law (2026-08-07)', () => {
  // Every fixture here mirrors a MEASURED shape from the live catalog
  // (header-verdict-probe.ts): the regressions the old dominator/straddle
  // law actually produced, then the boundaries of the new law.

  it('THE ORIGINAL BUG: a state covering 100% of a city-scale view loses to the centered city at 22%', () => {
    // Austin at a ~55-mile view, verbatim: Texas coverage 1.000, Austin
    // 0.216. The old law named Texas (finest DOMINATOR — nothing finer
    // reached 2/3); the header read "Texas" from a 200-mile view down here.
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 3, maxLng: 3 };
    const texas = placeLike(
      'Texas',
      { minLat: -20, minLng: -20, maxLat: 20, maxLng: 20 },
      { providerLevelCode: 'CountrySubdivision' },
    );
    // A rect holding the view's centre (1.5,1.5) and ~22% of its area.
    const austin = placeLike('Austin', {
      minLat: 0.8,
      minLng: 0.8,
      maxLat: 2.2,
      maxLng: 2.2,
    });
    const result = resolveHeaderPlace(
      view,
      subjectCandidatesInView(view, [texas, austin]),
    );
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Austin');
    expect(result.reason).toBe('finest-centered');
  });

  it('THE FALSE STRADDLE: nested city-in-county names the CITY, never "this area"', () => {
    // Austin (0.378) inside Travis (0.594) inside Texas (1.0) — all three
    // contain the centre. The old law declared a straddle between Austin
    // and Travis (DAG siblings: 19,451 municipalities carry their STATE as
    // parent) and degraded to «this area» at exactly the zoom where
    // "Austin" became true. Nested places cannot straddle: the finest
    // centred one wins.
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 3, maxLng: 3 };
    const texas = placeLike(
      'Texas',
      { minLat: -20, minLng: -20, maxLat: 20, maxLng: 20 },
      { providerLevelCode: 'CountrySubdivision' },
    );
    const travis = placeLike(
      'Travis',
      { minLat: 0.4, minLng: 0.4, maxLat: 2.7, maxLng: 2.7 },
      { providerLevelCode: 'CountrySecondarySubdivision' },
    );
    const austin = placeLike('Austin', {
      minLat: 0.6,
      minLng: 0.6,
      maxLat: 2.4,
      maxLng: 2.4,
    });
    const result = resolveHeaderPlace(
      view,
      subjectCandidatesInView(view, [texas, travis, austin]),
    );
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Austin');
  });

  it('two towns genuinely splitting the view: the CENTERED one wins — higher coverage on the other side does not', () => {
    // The question the straddle reservation was invented for, answered by
    // the anchor instead: the centre sits in the west town, so the west
    // town names the header even though the east town holds more area.
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 2 };
    const west = placeLike('Aldertown', {
      minLat: 0,
      minLng: 0,
      maxLat: 1,
      maxLng: 1.1,
    });
    const east = placeLike('Birchville', {
      minLat: 0,
      minLng: 1.1,
      maxLat: 1,
      maxLng: 2,
    });
    const result = resolveHeaderPlace(
      view,
      subjectCandidatesInView(view, [west, east]),
    );
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Aldertown');
  });

  it('the Mexico-bbox lie stays dead: an index rectangle containing the view whose GROUND misses the centre is no candidate at all', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 3, maxLng: 3 };
    const texas = placeLike(
      'Texas',
      { minLat: -1, minLng: -1, maxLat: 9, maxLng: 12 },
      {
        providerLevelCode: 'CountrySubdivision',
        ground: [rectRing({ minLat: -1, minLng: -1, maxLat: 9, maxLng: 12 })],
      },
    );
    // Mexico: index bbox swallows the view; real ground is a corner sliver
    // nowhere near the centre.
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
    expect(
      candidates.find((c) => c.name === 'Mexico')?.containsViewCenter,
    ).toBe(false);
    const result = resolveHeaderPlace(view, candidates);
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Texas');
  });

  it('street zoom WITH a neighborhood: the neighborhood out-fines the city', () => {
    // Downtown Austin at block zoom, verbatim: 0.264 of the view vs the
    // city\'s 1.0 — both centred, the finer names it.
    const view: GeoBbox = {
      minLat: 1.4,
      minLng: 1.4,
      maxLat: 1.6,
      maxLng: 1.6,
    };
    const city = placeLike('Austin', {
      minLat: 0,
      minLng: 0,
      maxLat: 3,
      maxLng: 3,
    });
    const neighborhood = placeLike(
      'Downtown Austin',
      { minLat: 1.44, minLng: 1.44, maxLat: 1.56, maxLng: 1.56 },
      { providerLevelCode: 'Neighbourhood' },
    );
    const result = resolveHeaderPlace(
      view,
      subjectCandidatesInView(view, [city, neighborhood]),
    );
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Downtown Austin');
  });

  it('under-threshold: a centred country holding a sliver of a continental view does not name it', () => {
    // The US at a ~2,760-mile view holds 0.19 — centred, but a sliver.
    const view: GeoBbox = { minLat: -20, minLng: -40, maxLat: 40, maxLng: 40 };
    const us = candidate(
      'United States',
      { minLat: 25, minLng: -14, maxLat: 50, maxLng: 12 },
      HEADER_ATTENTION_FRACTION - 0.05,
      { containsViewCenter: true },
    );
    const result = resolveHeaderPlace(view, [us]);
    expect(result).toEqual({ kind: 'this-area', reason: 'under-threshold' });
  });

  it('nothing under the centre: open water with a coastal town in frame is "this area"', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const town = candidate(
      'Port Alder',
      { minLat: 0, minLng: 0, maxLat: 1, maxLng: 0.4 },
      0.4,
      { containsViewCenter: false },
    );
    const result = resolveHeaderPlace(view, [town]);
    expect(result).toEqual({
      kind: 'this-area',
      reason: 'nothing-under-center',
    });
  });

  it('COEXTENSIVE TIE: equal-area shapes resolve by level specificity — DC reads "Washington", not the district rows', () => {
    // The measured DC trio: three byte-identical 177km2 grounds. Area ties
    // exactly; the finer VENDOR level (Municipality) must win because it is
    // the row the product keys — the same Philadelphia demand-mass law
    // (levelSpecificitySql), now ONE ordering across both runtimes.
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const shape = { minLat: 0.2, minLng: 0.2, maxLat: 0.8, maxLng: 0.8 };
    const washington = candidate('Washington', shape, 0.36, {
      providerLevelCode: 'Municipality',
    });
    const districtCounty = candidate('District of Columbia', shape, 0.36, {
      providerLevelCode: 'CountrySecondarySubdivision',
    });
    const districtState = candidate('District of Columbia B', shape, 0.36, {
      providerLevelCode: 'CountrySubdivision',
    });
    const result = resolveHeaderPlace(view, [
      districtState,
      districtCounty,
      washington,
    ]);
    expect(result.kind).toBe('place');
    if (result.kind !== 'place') throw new Error('unreachable');
    expect(result.place.name).toBe('Washington');
  });

  it('boundary: coverage of exactly HEADER_ATTENTION_FRACTION names the header (closed threshold, EPSILON-stable)', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const town = candidate(
      'Edge Town',
      { minLat: 0.3, minLng: 0.3, maxLat: 0.75, maxLng: 0.75 },
      HEADER_ATTENTION_FRACTION,
      { containsViewCenter: true },
    );
    const result = resolveHeaderPlace(view, [town]);
    expect(result.kind).toBe('place');
  });
});

describe('subjectCandidatesInView — the shared slice read (both runtimes)', () => {
  it('derives coverage + finest key + centre containment; disjoint places drop', () => {
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 2 };
    const half = placeLike('Halftown', {
      minLat: 0,
      minLng: 0,
      maxLat: 1,
      maxLng: 1,
    });
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
    // Halftown spans lng [0,1] of a [0,2] view — the centre (lng 1) sits on
    // its edge; containment is what resolvePlaceCoverage says it is.
    expect(typeof candidates[0].containsViewCenter).toBe('boolean');
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
    expect(candidateRow.placeArea).toBeCloseTo(groundArea(grounded.ground), 9);
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

  it('A PROBE DISC DOES NOT ANSWER ITS OWN CORNERS (RED for the squared circle)', () => {
    // A reverse geocode speaks for a RADIUS. Squaring it claimed the corners
    // too: a square of side 2r covers 4r² where the disc covers πr², so ~21%
    // of the "already asked" area had never been asked — and a real place
    // sitting in a corner could be suppressed from discovery forever.
    //
    // Corner point at 1.4r diagonal: INSIDE the old square, OUTSIDE the disc.
    const centre = { lat: 0, lng: 0 };
    const radiusMeters = 100;
    const rDeg = radiusMeters / METERS_PER_DEGREE_LAT;
    const disc = {
      kind: 'disc' as const,
      center: centre,
      radiusMeters,
    };
    const squaredDisc = {
      kind: 'box' as const,
      bbox: {
        minLat: -rDeg,
        minLng: -rDeg,
        maxLat: rDeg,
        maxLng: rDeg,
      },
    };
    const corner = { lat: rDeg * 0.9, lng: rDeg * 0.9 }; // |d| ≈ 1.27r
    const tinyView = {
      minLat: -rDeg,
      minLng: -rDeg,
      maxLat: rDeg,
      maxLng: rDeg,
    };
    const viewArea = bboxArea(tinyView);

    // The square answers the corner (the old, wrong behaviour)…
    expect(probedRegionAnswersAnchor(viewArea, squaredDisc, corner)).toBe(true);
    // …the disc does NOT: we never asked there.
    expect(probedRegionAnswersAnchor(viewArea, disc, corner)).toBe(false);
    // And the disc still answers its own centre.
    expect(probedRegionAnswersAnchor(viewArea, disc, centre)).toBe(true);
  });

  it('a view fully answered by a commensurate-scale place needs no probes at all', () => {
    // 1.7×1.7 bbox over the 1×1 view: covering, and not too-big (area 2.89 ≤
    // 3 × viewArea) — it legitimately answers every anchor.
    const anchors = probeAnchors(view, [
      {
        kind: 'box',
        bbox: { minLat: -0.35, minLng: -0.35, maxLat: 1.35, maxLng: 1.35 },
      },
    ]);
    expect(anchors).toEqual([]);
  });

  it('known commensurate-scale bboxes suppress their anchors; only unanswered ground is probed', () => {
    const anchors = probeAnchors(view, [
      {
        kind: 'box',
        bbox: { minLat: -0.1, minLng: -0.1, maxLat: 1.1, maxLng: 0.6 },
      },
    ]);
    expect(anchors.length).toBeGreaterThan(0);
    expect(anchors.length).toBeLessThanOrEqual(3);
    for (const anchor of anchors) {
      expect(anchor.lng).toBeGreaterThan(0.6);
    }
  });

  it('THE OVERHANG LAW: a place answers only its GROUND, never its rectangle (round-3 red team)', () => {
    // A diagonal-ish place whose bbox swallows the view centre while its
    // real ground misses it — the "Round Rock inside Austin's rectangle"
    // class. As a 'box' region this suppressed the centre anchor and the
    // place actually there could never be born; as a 'ground' region the
    // anchor stays unanswered and is probed.
    const view: GeoBbox = { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 };
    const lShapedGround: PlaceGround = [
      [
        [0, 0],
        [1, 0],
        [1, 0.2],
        [0.2, 0.2],
        [0.2, 1],
        [0, 1],
      ],
    ];
    const asGround: ProbedRegion = {
      kind: 'ground',
      ground: lShapedGround,
      area: 0.36,
    };
    // Centre (0.5, 0.5) is in the bbox but NOT in the L.
    expect(probedRegionContainsPoint(asGround, { lat: 0.5, lng: 0.5 })).toBe(
      false,
    );
    const anchors = probeAnchors(view, [asGround], 3);
    expect(anchors.length).toBeGreaterThan(0);
    // RED direction: the same shape as its rectangle DOES suppress — the
    // difference between these two assertions IS the deleted defect.
    const asBox: ProbedRegion = {
      kind: 'box',
      bbox: { minLat: 0, minLng: 0, maxLat: 1, maxLng: 1 },
    };
    expect(probedRegionContainsPoint(asBox, { lat: 0.5, lng: 0.5 })).toBe(true);
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
    const anchors = probeAnchors(streetView, [
      { kind: 'box', bbox: city },
      { kind: 'box', bbox: country },
    ]);
    expect(anchors).toHaveLength(MAX_PROBE_ANCHORS);
    // A commensurate-scale neighborhood over the same ground DOES answer.
    const ward: GeoBbox = {
      minLat: 0.4995,
      minLng: 0.4995,
      maxLat: 0.5025,
      maxLng: 0.5025,
    };
    expect(
      probeAnchors(streetView, [
        { kind: 'box', bbox: city },
        { kind: 'box', bbox: country },
        { kind: 'box', bbox: ward },
      ]),
    ).toEqual([]);
  });
});
