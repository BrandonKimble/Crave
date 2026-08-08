/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
/**
 * GET /places/in-view — the catalog SLICE read (header subject-store
 * design). Laws under test:
 * - membership: every bbox-carrying place intersecting the MARGIN box is
 *   served (including out-of-view-but-in-margin rows — the pan hysteresis),
 *   nothing outside the margin box is;
 * - the margin box is echoed and is the view expanded ×3 per axis
 *   (PLACES_SLICE_MARGIN_FACTOR), so the client knows its cache-validity
 *   region;
 * - wrap-aware end to end: a crossing view yields a crossing margin box and
 *   seam-straddling places stay members;
 * - containing nodes need NO separate chain: containment implies
 *   intersection, so over-scale containing rows (state/country) are already
 *   slice members;
 * - rows are lean PlaceLike — no derivable data (area/coverage) ships.
 */
import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import {
  GeoBbox,
  PLACES_SLICE_MARGIN_FACTOR,
  bboxContains,
  bboxLatSpan,
  bboxLngSpan,
  expandBboxByFactor,
} from '@crave-search/shared';
import { BadRequestException } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { PlacesCatalogService } from './places-catalog.service';
import { PlacesInViewQueryDto } from './dto/places-in-view.dto';

const logger: any = {
  setContext: () => logger,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

let idCounter = 0;

function placeRow(name: string, bbox: GeoBbox, overrides: any = {}) {
  idCounter += 1;
  return {
    placeId: `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`,
    name,
    localScriptAlias: null,
    providerLevelCode: 'Municipality',
    countryCode: 'US',
    subdivisionCode: 'TX',
    county: null,
    parentPlaceIds: [],
    centroidLat: null,
    centroidLng: null,
    bboxMinLat: bbox.minLat,
    bboxMinLng: bbox.minLng,
    bboxMaxLat: bbox.maxLat,
    bboxMaxLng: bbox.maxLng,
    timeZone: null,
    provider: 'tomtom',
    providerPlaceId: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    promotedAt: null,
    ...overrides,
  };
}

/**
 * Controller over the REAL catalog service with a prisma stub.
 *
 * The stub models the DB INVARIANT (§2.6 ground unification): every place
 * has a place_geometries row, so the candidate read returns a ground for
 * every row — a sketch-grade place's ground IS its bbox envelope, which is
 * exactly what the migration backfilled. Candidate finding is over-inclusive
 * here on purpose: the wrap-aware coverage law is the authority and THAT is
 * what membership is proven against.
 */
function envelopeGeoJson(bbox: {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}): string {
  return JSON.stringify({
    type: 'Polygon',
    coordinates: [
      [
        [bbox.minLng, bbox.minLat],
        [bbox.maxLng, bbox.minLat],
        [bbox.maxLng, bbox.maxLat],
        [bbox.minLng, bbox.maxLat],
        [bbox.minLng, bbox.minLat],
      ],
    ],
  });
}

function createController(
  rows: any[],
  geometryRows?: Array<{ placeId: string; geojson: string }>,
) {
  // P4: grounds_in_view now returns the DERIVED bbox columns beside the
  // geojson — the harness mirrors that contract from the fixture extents.
  const grounds =
    geometryRows ??
    rows
      .filter((row) => row.bboxMinLat !== null && row.bboxMinLng !== null)
      .map((row) => ({
        placeId: row.placeId,
        geojson: envelopeGeoJson({
          minLat: Number(row.bboxMinLat),
          minLng: Number(row.bboxMinLng),
          maxLat: Number(row.bboxMaxLat),
          maxLng: Number(row.bboxMaxLng),
        }),
        bbox_min_lat: Number(row.bboxMinLat),
        bbox_min_lng: Number(row.bboxMinLng),
        bbox_max_lat: Number(row.bboxMaxLat),
        bbox_max_lng: Number(row.bboxMaxLng),
      }));
  const prisma: any = {
    place: {
      findMany: jest.fn().mockResolvedValue(rows),
      fields: { bboxMaxLng: 'bboxMaxLng' },
    },
    // Candidate grounds (place_geometries, simplified in-DB).
    $queryRaw: jest.fn().mockResolvedValue(grounds),
  };
  const catalog = new PlacesCatalogService(prisma, logger);
  return new PlacesController(catalog);
}

function query(view: GeoBbox): PlacesInViewQueryDto {
  return plainToInstance(PlacesInViewQueryDto, { ...view });
}

describe('GET /places/in-view — slice membership + margin law', () => {
  // View: 1°×1° around Austin-ish ground. Margin (×3): 3°×3°, same center.
  const view: GeoBbox = { minLat: 30, minLng: -98, maxLat: 31, maxLng: -97 };

  it('serves in-view AND out-of-view-but-in-margin places; out-of-margin places never ship', async () => {
    const inView = placeRow('Coreville', {
      minLat: 30.2,
      minLng: -97.8,
      maxLat: 30.6,
      maxLng: -97.4,
    });
    // Wholly outside the view but inside the ×3 margin box
    // (margin = lat [29, 32] × lng [-99, -96]: center 30.5/-97.5 ± 1.5).
    const inMargin = placeRow('Edgeburg', {
      minLat: 31.4,
      minLng: -98.9,
      maxLat: 31.9,
      maxLng: -98.2,
    });
    const outOfMargin = placeRow('Farville', {
      minLat: 35,
      minLng: -98,
      maxLat: 36,
      maxLng: -97,
    });
    const controller = createController([inView, inMargin, outOfMargin]);

    const response = await controller.placesInView(query(view));

    expect(response.places.map((p) => p.name).sort()).toEqual([
      'Coreville',
      'Edgeburg',
    ]);
  });

  it('echoes the margin box: the view expanded ×PLACES_SLICE_MARGIN_FACTOR per axis, containing the view', async () => {
    const controller = createController([]);
    const response = await controller.placesInView(query(view));

    expect(response.marginBox).toEqual(
      expandBboxByFactor(view, PLACES_SLICE_MARGIN_FACTOR),
    );
    expect(bboxContains(response.marginBox, view)).toBe(true);
    expect(bboxLatSpan(response.marginBox)).toBeCloseTo(
      bboxLatSpan(view) * PLACES_SLICE_MARGIN_FACTOR,
      9,
    );
    expect(bboxLngSpan(response.marginBox)).toBeCloseTo(
      bboxLngSpan(view) * PLACES_SLICE_MARGIN_FACTOR,
      9,
    );
  });

  it('rows are lean PlaceLike: bbox + identity + the §2.6 ground — NO derivable data, NO DAG edges (dropped 2026-08-07: the client header law reads geometry only)', async () => {
    const row = placeRow(
      'Coreville',
      { minLat: 30.2, minLng: -97.8, maxLat: 30.6, maxLng: -97.4 },
      { parentPlaceIds: ['p-1', 'p-1', 'p-2'] },
    );
    const controller = createController([row]);
    const response = await controller.placesInView(query(view));

    expect(response.places).toEqual([
      {
        placeId: row.placeId,
        name: 'Coreville',
        bbox: { minLat: 30.2, minLng: -97.8, maxLat: 30.6, maxLng: -97.4 },
        providerLevelCode: 'Municipality',
        // §2.6: ground ALWAYS ships. A sketch-grade place's ground is its
        // ENVELOPE, read from place_geometries like any other — PostGIS
        // returns a CLOSED ring (first vertex repeated last).
        ground: [
          [
            [-97.8, 30.2],
            [-97.4, 30.2],
            [-97.4, 30.6],
            [-97.8, 30.6],
            [-97.8, 30.2],
          ],
        ],
      },
    ]);
  });

  it('§2.6 ground ALWAYS ships: hydrated rings where the DB has them, the envelope rectangle otherwise — one representation on the wire', async () => {
    const grounded = placeRow('Coreville', {
      minLat: 30.2,
      minLng: -97.8,
      maxLat: 30.6,
      maxLng: -97.4,
    });
    const sketchy = placeRow('Barefort', {
      minLat: 30.3,
      minLng: -97.7,
      maxLat: 30.5,
      maxLng: -97.5,
    });
    const ring = [
      [-97.8, 30.2],
      [-97.4, 30.2],
      [-97.4, 30.6],
      [-97.8, 30.6],
      [-97.8, 30.2],
    ];
    // BOTH grounds come from place_geometries — an outline-grade ring for
    // one place, a sketch-grade ENVELOPE for the other. That is the §2.6
    // invariant on the wire: one representation, both from the DB, no
    // client-side degradation arm.
    const sketchyEnvelope = [
      [-97.7, 30.3],
      [-97.5, 30.3],
      [-97.5, 30.5],
      [-97.7, 30.5],
      [-97.7, 30.3],
    ];
    const controller = createController(
      [grounded, sketchy],
      [
        {
          placeId: grounded.placeId,
          geojson: JSON.stringify({
            type: 'MultiPolygon',
            coordinates: [[ring]],
          }),
        },
        {
          placeId: sketchy.placeId,
          geojson: JSON.stringify({
            type: 'Polygon',
            coordinates: [sketchyEnvelope],
          }),
        },
      ],
    );
    const response = await controller.placesInView(query(view));
    const byName = new Map(response.places.map((p) => [p.name, p]));
    expect(byName.get('Coreville')?.ground).toEqual([ring]);
    expect(byName.get('Barefort')?.ground).toEqual([sketchyEnvelope]);
  });

  it('containing chain needs no separate field: over-scale CONTAINING nodes (state, country) are slice members because containment implies intersection', async () => {
    const texas = placeRow(
      'Texas',
      { minLat: 25.8, minLng: -106.6, maxLat: 36.5, maxLng: -93.5 },
      { providerLevelCode: 'countrySubdivision' },
    );
    const us = placeRow(
      'United States',
      { minLat: 24.5, minLng: -125, maxLat: 49.4, maxLng: -66.9 },
      { providerLevelCode: 'country', subdivisionCode: null },
    );
    const controller = createController([texas, us]);
    const response = await controller.placesInView(query(view));

    expect(response.places.map((p) => p.name).sort()).toEqual([
      'Texas',
      'United States',
    ]);
  });

  it('wrap-aware: a crossing (Fiji) view yields a crossing margin box and keeps seam-straddling members', async () => {
    const fijiView: GeoBbox = {
      minLat: -19,
      minLng: 178,
      maxLat: -17,
      maxLng: -179,
    };
    const fiji = placeRow('Fiji', {
      minLat: -21,
      minLng: 176,
      maxLat: -12,
      maxLng: -178,
    });
    const farAway = placeRow('Nowhere Near', {
      minLat: -18,
      minLng: 100,
      maxLat: -17,
      maxLng: 101,
    });
    const controller = createController([fiji, farAway]);
    const response = await controller.placesInView(query(fijiView));

    // 3° lng view ×3 = 9° margin centered at ±180 → still crossing.
    expect(response.marginBox.minLng).toBeGreaterThan(
      response.marginBox.maxLng,
    );
    expect(bboxContains(response.marginBox, fijiView)).toBe(true);
    expect(response.places.map((p) => p.name)).toEqual(['Fiji']);
  });

  it('rejects the one malformed shape: minLat > maxLat (latitude is not circular)', async () => {
    const controller = createController([]);
    await expect(
      controller.placesInView(
        query({ minLat: 31, minLng: -98, maxLat: 30, maxLng: -97 }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('PlacesInViewQueryDto — validation', () => {
  it('accepts a normal view and a crossing (west > east) view; rejects missing/out-of-range coords', () => {
    const good = [
      { minLat: 30, minLng: -98, maxLat: 31, maxLng: -97 },
      { minLat: -19, minLng: 178, maxLat: -17, maxLng: -179 }, // crossing
    ];
    for (const payload of good) {
      expect(
        validateSync(plainToInstance(PlacesInViewQueryDto, payload)),
      ).toHaveLength(0);
    }
    const bad = [
      {},
      { minLat: 30, minLng: -98, maxLat: 31 }, // missing maxLng
      { minLat: 95, minLng: -98, maxLat: 96, maxLng: -97 }, // lat range
      { minLat: 30, minLng: -190, maxLat: 31, maxLng: -97 }, // lng range
      { minLat: 'x', minLng: -98, maxLat: 31, maxLng: -97 }, // NaN
    ];
    for (const payload of bad) {
      expect(
        validateSync(plainToInstance(PlacesInViewQueryDto, payload as any)),
      ).not.toHaveLength(0);
    }
  });
});

describe('expandBboxByFactor — the shared margin law', () => {
  it('clamps at the poles instead of wrapping over them', () => {
    const arctic: GeoBbox = { minLat: 80, minLng: 0, maxLat: 88, maxLng: 10 };
    const margin = expandBboxByFactor(arctic, 3);
    expect(margin.maxLat).toBe(90);
    expect(margin.minLat).toBeCloseTo(72, 9);
  });

  it('collapses to the full longitude circle when the expanded span reaches 360°', () => {
    const wide: GeoBbox = { minLat: -10, minLng: -80, maxLat: 10, maxLng: 80 };
    const margin = expandBboxByFactor(wide, 3);
    expect(margin.minLng).toBe(-180);
    expect(margin.maxLng).toBe(180);
  });

  it('a zero-area (point) view expands to a point — the degenerate containing-chain read', () => {
    const point: GeoBbox = {
      minLat: 30.5,
      minLng: -97.5,
      maxLat: 30.5,
      maxLng: -97.5,
    };
    expect(expandBboxByFactor(point, 3)).toEqual(point);
  });
});
