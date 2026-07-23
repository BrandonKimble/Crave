import 'reflect-metadata';
import { SearchService } from './search.service';
import { PlacesReconcilerService } from '../places/places-reconciler.service';
import { bboxArea, type GeoBbox } from '@crave-search/shared';
import type { PlaceInView } from '../places/places-catalog.service';

// §22 cut 3 (plans/geo-demand-foundation-rebuild.md): the search HEADER names
// from the Place Catalog (§2.5 polygon-native law), NOT the old
// market-resolver election, and the §2 naming reconciler goes live at the
// search viewport chokepoint. Three families here:
//   (a) header derivation — the finest dominator names the header,
//       straddle → null, over-scale containing places dominate only when
//       nothing finer does;
//   (b) reconciler wiring — a submitted search with bounds hands the viewport
//       to noteViewport exactly once, and a reconcile failure cannot affect
//       the search response;
//   (c) contract — the response metadata field NAME (displayMarketName) and
//       the sibling market fields are unchanged on the wire; only the header
//       value's source of truth moved.

const VIEW_BOUNDS = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};
const VIEW: GeoBbox = {
  minLat: 30.1,
  minLng: -97.9,
  maxLat: 30.4,
  maxLng: -97.6,
};

function createLogger() {
  const logger = {
    setContext: () => logger,
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return logger;
}

function placeInView(
  name: string,
  bbox: GeoBbox,
  coverageOfView: number,
): PlaceInView {
  return {
    place: { placeId: `place-${name}`, name } as PlaceInView['place'],
    bbox,
    coverageOfView,
    placeArea: bboxArea(bbox),
    parentPlaceIds: [],
    // §2.6: ground is REQUIRED — sketch-grade envelope rectangle fixture.
    ground: [
      [
        [bbox.minLng, bbox.minLat],
        [bbox.maxLng, bbox.minLat],
        [bbox.maxLng, bbox.maxLat],
        [bbox.minLng, bbox.maxLat],
      ],
    ],
  };
}

function createExecutor() {
  return {
    executeDual: jest.fn().mockResolvedValue({
      dishes: [],
      restaurants: [],
      totalDishCount: 0,
      totalRestaurantCount: 0,
      sqlPreview: null,
      metadata: {
        boundsApplied: true,
        openNowApplied: false,
        openNowSupportedRestaurants: 0,
        openNowUnsupportedRestaurants: 0,
        openNowUnsupportedRestaurantIds: [],
        openNowFilteredOut: 0,
        priceFilterApplied: false,
        minimumVotesApplied: false,
      },
    }),
  };
}

// ENGINE-COVERAGE re-key (markets extermination leg 2): the market election
// is DEAD — the search path resolves engine territory coverage instead. A
// tripwire NAME is planted on the engine so the displayMarketName assertions
// go RED if the header ever reads coverage output as a name source.
function createEngineCoverage() {
  return {
    resolveViewportCoverage: jest.fn().mockResolvedValue({
      share: 0.5,
      engines: [
        {
          engineId: '99999999-9999-9999-9999-999999999999',
          name: 'ENGINE-NAME-NEVER-A-HEADER',
          share: 0.5,
        },
      ],
    }),
  };
}

function createHarness(options: {
  placesInView?: PlaceInView[];
  placesInViewError?: Error;
  reconciler?: { noteViewport: jest.Mock } | PlacesReconcilerService;
}) {
  const placesCatalog = {
    placesInView: options.placesInViewError
      ? jest.fn().mockRejectedValue(options.placesInViewError)
      : jest.fn().mockResolvedValue(options.placesInView ?? []),
  };
  const placesReconciler = options.reconciler ?? { noteViewport: jest.fn() };
  const placesPromotions = {
    enqueue: jest.fn().mockResolvedValue(undefined),
    noteHeaderAnswer: jest.fn(),
  };
  const signals = {
    bboxFromBounds: jest.fn().mockReturnValue(null),
    record: jest.fn(),
  };
  const service = new SearchService(
    createLogger() as never, // loggerService
    createExecutor() as never, // queryExecutor
    {} as never, // queryBuilder
    {} as never, // entityExpansion
    {} as never, // siblingExpansion
    {} as never, // onDemandRequestService
    { recordSearchExecution: jest.fn() } as never, // searchMetrics
    {} as never, // textSanitizer (no entities on these requests)
    {} as never, // prisma (no impression targets → search log untouched)
    createEngineCoverage() as never, // engineCoverage
    {} as never, // restaurantStatusService
    signals as never, // signals
    {} as never, // signalDemandRead (recent-searches reader; unused here)
    placesCatalog as never, // placesCatalog (§22 cut 3)
    placesReconciler as never, // placesReconciler (§2 live)
    placesPromotions as never, // placesPromotions (§2 tier-2 promotion)
  );
  return { service, placesCatalog, placesReconciler, placesPromotions };
}

function buildRequest(overrides: Record<string, unknown> = {}) {
  return {
    entities: { food: [], restaurants: [] },
    bounds: VIEW_BOUNDS,
    sourceQuery: 'tacos',
    pagination: { page: 1, pageSize: 25 },
    ...overrides,
  } as never;
}

describe('§2 header derivation (the catalog names the header, not the resolver)', () => {
  it('the FINEST dominator (the covering city, not its covering ancestor) names the header', async () => {
    const { service } = createHarness({
      placesInView: [
        placeInView('Austin', VIEW, 1),
        // An over-scale ancestor rides along (placesInView returns ancestors);
        // the too-big disqualifier must reject it in favor of the city.
        placeInView(
          'Texas',
          { minLat: 25.8, minLng: -106.7, maxLat: 36.5, maxLng: -93.5 },
          1,
        ),
      ],
    });
    const response = await service.runQuery(buildRequest());
    expect(response.metadata.displayMarketName).toBe('Austin');
  });

  it('§2(e) tier-2 promotion: a place-kind header verdict reports a header answer; "this area" does not', async () => {
    const { service, placesPromotions } = createHarness({
      placesInView: [placeInView('Austin', VIEW, 1)],
    });
    const response = await service.runQuery(buildRequest());
    expect(response.metadata.displayMarketName).toBe('Austin');
    expect(placesPromotions.noteHeaderAnswer).toHaveBeenCalledTimes(1);

    const empty = createHarness({ placesInView: [] });
    await empty.service.runQuery(buildRequest());
    expect(empty.placesPromotions.noteHeaderAnswer).not.toHaveBeenCalled();
  });

  it('a multi-place straddle yields null (mobile renders its own fallback)', async () => {
    const west: GeoBbox = {
      minLat: 30.1,
      minLng: -97.9,
      maxLat: 30.4,
      maxLng: -97.75,
    };
    const east: GeoBbox = {
      minLat: 30.1,
      minLng: -97.75,
      maxLat: 30.4,
      maxLng: -97.6,
    };
    const { service } = createHarness({
      // Two commensurate subjects at ~half coverage each — neither covers
      // (< 2/3) → "this area" → null on the wire.
      placesInView: [
        placeInView('Round Rock', west, 0.5),
        placeInView('Pflugerville', east, 0.5),
      ],
    });
    const response = await service.runQuery(buildRequest());
    expect(response.metadata.displayMarketName).toBeNull();
  });

  it('only over-scale containing places in view → the FINEST of them names the header (never "this area")', async () => {
    const texas: GeoBbox = {
      minLat: 25.8,
      minLng: -106.7,
      maxLat: 36.5,
      maxLng: -93.5,
    };
    const usa: GeoBbox = {
      minLat: 24.4,
      minLng: -125.0,
      maxLat: 49.4,
      maxLng: -66.9,
    };
    const { service } = createHarness({
      // Both cover the view (coverage 1 → both dominate); the FINER one
      // (Texas) is named — the old too-big/containing-fallback arms are dead.
      placesInView: [
        placeInView('Texas', texas, 1),
        placeInView('USA', usa, 1),
      ],
    });
    const response = await service.runQuery(buildRequest());
    expect(response.metadata.displayMarketName).toBe('Texas');
  });

  it('unnamed ground (empty catalog) yields null', async () => {
    const { service } = createHarness({ placesInView: [] });
    const response = await service.runQuery(buildRequest());
    expect(response.metadata.displayMarketName).toBeNull();
  });

  it('a catalog failure degrades the header to null without failing the search', async () => {
    const { service } = createHarness({
      placesInViewError: new Error('catalog down'),
    });
    const response = await service.runQuery(buildRequest());
    expect(response.metadata.displayMarketName).toBeNull();
    expect(response.metadata.searchRequestId).toBeDefined();
  });
});

describe('§2 reconciler wiring (the growth machine is live at the search chokepoint)', () => {
  it('a submitted search with bounds hands the viewport to noteViewport exactly once', async () => {
    const noteViewport = jest.fn();
    const { service } = createHarness({
      placesInView: [placeInView('Austin', VIEW, 1)],
      reconciler: { noteViewport },
    });
    await service.runQuery(buildRequest());
    expect(noteViewport).toHaveBeenCalledTimes(1);
    expect(noteViewport).toHaveBeenCalledWith(VIEW);
  });

  it('a search without bounds does not invoke the reconciler', async () => {
    const noteViewport = jest.fn();
    const { service } = createHarness({
      placesInView: [],
      reconciler: { noteViewport },
    });
    await service.runQuery(buildRequest({ bounds: undefined }));
    expect(noteViewport).not.toHaveBeenCalled();
  });

  it('a reconcile failure is swallowed by the REAL reconciler and cannot affect the response', async () => {
    // The real PlacesReconcilerService against a failing catalog: noteViewport
    // must return synchronously, the async reconcile failure must be caught
    // inside (never-throws contract), and the search response is untouched.
    const failingCatalog = {
      placesInView: jest.fn().mockRejectedValue(new Error('catalog down')),
    };
    const reconciler = new PlacesReconcilerService(
      failingCatalog as never,
      { probe: jest.fn().mockRejectedValue(new Error('probe down')) } as never,
      createLogger() as never,
    );
    const { service } = createHarness({
      placesInViewError: new Error('catalog down'),
      reconciler,
    });
    const response = await service.runQuery(buildRequest());
    await reconciler.whenIdle(); // flush the failing background flight
    expect(response.metadata.displayMarketName).toBeNull();
    expect(response.metadata.totalFoodResults).toBe(0);
  });
});

describe('leg 2 contract: the search metadata carries engine coverage and NOTHING market-shaped', () => {
  it('metadata = catalog header name + engine coverage share; every market field is ABSENT', async () => {
    const { service } = createHarness({
      placesInView: [placeInView('Austin', VIEW, 1)],
    });
    const response = await service.runQuery(buildRequest());
    expect(response.metadata).toMatchObject({
      // The frozen field NAME carries the catalog place name — were coverage
      // ever read as a name source, this would be the tripwire engine name.
      displayMarketName: 'Austin',
      engineCoverageShare: 0.5,
      engineCoverage: [
        {
          engineId: '99999999-9999-9999-9999-999999999999',
          name: 'ENGINE-NAME-NEVER-A-HEADER',
          share: 0.5,
        },
      ],
    });
    // Extermination proof: any market read on the search metadata is a
    // remnant. The fields must be ABSENT, not null.
    const metadata = response.metadata as unknown as Record<string, unknown>;
    for (const deadField of [
      'marketKey',
      'marketResolutionStatus',
      'candidateLocalityName',
      'candidateBoundaryProvider',
      'candidateBoundaryId',
      'candidateBoundaryType',
      'attributionMarketKeys',
      'collectableMarketKeys',
    ]) {
      expect(deadField in metadata).toBe(false);
    }
  });
});
