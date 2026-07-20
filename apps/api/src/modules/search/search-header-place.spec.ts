import 'reflect-metadata';
import { SearchService } from './search.service';
import { PlacesReconcilerService } from '../places/places-reconciler.service';
import { bboxArea, type GeoBbox } from '../places/place-geo';
import type { PlaceInView } from '../places/places-catalog.service';

// §22 cut 3 (plans/geo-demand-foundation-rebuild.md): the search HEADER names
// from the Place Catalog (§2 subjecthood law), NOT the old market-resolver
// election, and the §2 naming reconciler goes live at the search viewport
// chokepoint. Three families here:
//   (a) header derivation — covering city names the header, straddle → null,
//       containing-fallback names the containing place;
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

// The old resolver still runs for the OTHER consumers (marketKey scoping,
// collection triggers, candidate CTA fields) — its NAMES are planted here as
// tripwires: if the header ever reads the election again, the assertions on
// displayMarketName go RED.
function createMarketRegistry() {
  return {
    resolveViewportCoverage: jest.fn().mockResolvedValue({
      market: {
        marketKey: 'austin',
        marketShortName: 'OLD-RESOLVER-SHORT-NAME',
        marketName: 'OLD-RESOLVER-NAME',
      },
      status: 'resolved',
      resolution: {
        candidateLocalityName: 'Resolver Locality',
        candidateBoundaryProvider: 'tomtom',
        candidateBoundaryId: 'boundary-1',
        candidateBoundaryType: 'locality',
      },
      markets: [{ marketKey: 'austin' }],
      collectableMarketKeys: ['austin'],
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
    createMarketRegistry() as never, // marketRegistry
    {} as never, // restaurantStatusService
    signals as never, // signals
    {} as never, // signalDemandRead (recent-searches reader; unused here)
    placesCatalog as never, // placesCatalog (§22 cut 3)
    placesReconciler as never, // placesReconciler (§2 live)
  );
  return { service, placesCatalog, placesReconciler };
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
  it('a commensurate COVERING city names the header', async () => {
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

  it('no commensurate node → the smallest CONTAINING place names the header (never "this area")', async () => {
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
      // Both contain the view and both are over-scale (too big) → the SMALLER
      // containing node (Texas) wins the fallback.
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

describe('§22 cut 3 contract (wire shape unchanged; only the header source moved)', () => {
  it('the metadata keeps every market field with resolver-derived values — and the header no longer reads the election', async () => {
    const { service } = createHarness({
      placesInView: [placeInView('Austin', VIEW, 1)],
    });
    const response = await service.runQuery(buildRequest());
    expect(response.metadata).toMatchObject({
      marketKey: 'austin',
      // The frozen field NAME carries the catalog place name — were the old
      // election still wired, this would be 'OLD-RESOLVER-SHORT-NAME'.
      displayMarketName: 'Austin',
      marketResolutionStatus: 'resolved',
      candidateLocalityName: 'Resolver Locality',
      candidateBoundaryProvider: 'tomtom',
      candidateBoundaryId: 'boundary-1',
      candidateBoundaryType: 'locality',
      attributionMarketKeys: ['austin'],
      collectableMarketKeys: ['austin'],
    });
  });
});
