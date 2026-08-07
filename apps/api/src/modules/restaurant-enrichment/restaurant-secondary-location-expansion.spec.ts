/* eslint-disable @typescript-eslint/require-await -- async mock fixtures stand
   in for awaited collaborators; adding a no-op await would be noise. */
import { RestaurantLocationEnrichmentService } from './restaurant-location-enrichment.service';
import { RestaurantSecondaryLocationExpansionQueueService } from './restaurant-secondary-location-expansion-queue.service';
import { RestaurantSecondaryLocationExpansionWorker } from './restaurant-secondary-location-expansion.worker';
import {
  currentCampaignId,
  runInWorkContext,
} from '../external-integrations/shared/work-context';

/**
 * F354 + F352-attribution — owner-ruled 2026-08-03.
 *
 * THE RULING, in two halves:
 *  (1) Expansion failures RETRY HONESTLY. The old catch swallowed everything,
 *      so the queue's `attempts: 3` was unreachable and a mid-run fault
 *      recorded SUCCESS with a truncated branch set.
 *  (2) Bulk-driven expansion spend lands on its campaign's bill. Routine
 *      collection-triggered expansion stays exactly as it was: pool-governed,
 *      unattributed, and — this is the ruled law — APPROVAL-FREE FOREVER.
 *      Campaigns are for one-time bulk events only (archive loads, city
 *      onboarding, re-extractions). There is no gate anywhere in this file.
 */

type FakePlace = {
  id: string;
  displayName: { text: string };
  websiteUri: string;
  formattedAddress: string;
  location: { latitude: number; longitude: number };
};

const place = (id: string): FakePlace => ({
  id,
  displayName: { text: 'Torchys Tacos' },
  websiteUri: 'https://torchystacos.com/menu',
  formattedAddress: `${id} Congress Ave, Austin, TX`,
  location: { latitude: 30.26, longitude: -97.74 },
});

const CANONICAL = place('place-canonical');

/**
 * Builds the service with only the collaborators this lane touches. The
 * upstream half of `expandSecondaryLocationsForRestaurant` (autocomplete
 * eligibility resolution) is stubbed, deliberately: the ruled behaviour lives
 * entirely in the paginated loop below it, and re-deriving the whole
 * resolution path here would test somebody else's code.
 */
function makeService(pages: Array<() => Promise<unknown>>) {
  const upserts: string[] = [];
  /** Rows the previous attempt PERSISTED — the substrate a retry re-reads. */
  const storedPlaceIds = new Set<string>();

  const prisma = {
    entity: {
      findUnique: jest.fn(async () => ({
        entityId: 'ent-1',
        type: 'restaurant',
        name: 'Torchys Tacos',
        canonicalDomain: 'torchystacos.com',
        // Re-read fresh on EVERY attempt — this is what makes the retry
        // resume rather than repeat.
        locations: [...storedPlaceIds].map((id) => ({
          locationId: `loc-${id}`,
          googlePlaceId: id,
          isPrimary: false,
        })),
      })),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        restaurantLocation: {
          upsert: jest.fn(
            async (args: { where: { googlePlaceId: string } }) => {
              upserts.push(args.where.googlePlaceId);
              storedPlaceIds.add(args.where.googlePlaceId);
              return {};
            },
          ),
        },
      }),
    ),
  };

  let pageIndex = 0;
  const findPlaceFromText = jest.fn(async () => {
    const next = pages[pageIndex];
    pageIndex += 1;
    if (!next) throw new Error('spec ran off the end of its fixture pages');
    return next();
  });

  const googlePlacesService = {
    findPlaceFromText,
    getPlaceDetails: jest.fn(async () => ({ place: CANONICAL })),
  };

  const opsAlerts = { emit: jest.fn() };

  const logger = {
    setContext: () => logger,
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };

  const service = new RestaurantLocationEnrichmentService(
    prisma as never,
    googlePlacesService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { get: () => undefined } as never,
    opsAlerts as never,
    logger as never,
  );

  const anyService = service as unknown as Record<string, unknown>;
  anyService['resolveEligiblePlaceDetails'] = async () => ({
    details: { place: CANONICAL },
  });
  // The lane sleeps 2s between pages; the spec is not testing the clock.
  anyService['delay'] = async () => undefined;

  return {
    service,
    upserts,
    findPlaceFromText,
    googlePlacesService,
    storedPlaceIds,
  };
}

const pageWith = (ids: string[], nextPageToken?: string) => async () => ({
  places: ids.map(place),
  nextPageToken,
});

const faultingPage = () => async () => {
  throw new Error('Places 503: upstream unavailable');
};

describe('F354 — a mid-run expansion fault fails the JOB, it does not report success', () => {
  it('RED — a page-2 fault REJECTS (so bull marks the job failed and attempts:3 is reachable)', async () => {
    const { service, upserts } = makeService([
      pageWith(['place-a', 'place-b'], 'token-page-2'),
      faultingPage(),
    ]);

    await expect(
      service.expandSecondaryLocationsForRestaurant('ent-1', 'place-canonical'),
    ).rejects.toThrow('Places 503');

    // Page 1's work is COMMITTED — per-place transactions, so the throw
    // discards nothing already written.
    expect(upserts).toEqual(['place-a', 'place-b']);
  });

  it('a retry RESUMES: page-1 rows are re-read as seen, not re-upserted', async () => {
    const { service, upserts, storedPlaceIds } = makeService([
      // Attempt 1
      pageWith(['place-a', 'place-b'], 'token-page-2'),
      faultingPage(),
      // Attempt 2 — Places replays the same page 1, then page 2 succeeds.
      pageWith(['place-a', 'place-b'], 'token-page-2'),
      pageWith(['place-c']),
    ]);

    await expect(
      service.expandSecondaryLocationsForRestaurant('ent-1', 'place-canonical'),
    ).rejects.toThrow('Places 503');
    upserts.length = 0;

    // The retry the queue now performs.
    await service.expandSecondaryLocationsForRestaurant(
      'ent-1',
      'place-canonical',
    );

    // THE assertion: page 1 produced ZERO duplicate writes on the retry,
    // because seenPlaceIds is rebuilt from the STORED rows.
    expect(upserts).toEqual(['place-c']);
    expect([...storedPlaceIds].sort()).toEqual([
      'place-a',
      'place-b',
      'place-c',
    ]);
  });

  it('SPEND GUARD — a brand with no branches still stops after page 1', async () => {
    // The canonical place is seeded into seenPlaceIds, so the "did this page
    // carry a branch of ours" test must NOT count it — otherwise every
    // single-location restaurant in the corpus would buy a second Places
    // page. Page 1 here is the restaurant itself plus an unrelated
    // same-name-different-domain place.
    const stranger = {
      ...place('place-stranger'),
      websiteUri: 'https://elsewhere.com',
    };
    const { service, upserts, findPlaceFromText } = makeService([
      async () => ({
        places: [CANONICAL, stranger],
        nextPageToken: 'token-page-2',
      }),
      pageWith(['place-should-never-be-fetched']),
    ]);
    await service.expandSecondaryLocationsForRestaurant(
      'ent-1',
      'place-canonical',
    );
    expect(findPlaceFromText).toHaveBeenCalledTimes(1);
    expect(upserts).toEqual([]);
  });

  it('a clean run still completes normally (the throw is a fault path, not the path)', async () => {
    const { service, upserts } = makeService([
      pageWith(['place-a'], 'token-page-2'),
      pageWith(['place-b']),
    ]);
    await service.expandSecondaryLocationsForRestaurant(
      'ent-1',
      'place-canonical',
    );
    expect(upserts).toEqual(['place-a', 'place-b']);
  });
});

describe('F352-attribution — the campaign rides the payload; routine work carries none', () => {
  function makeQueue() {
    const added: Array<{
      data: Record<string, unknown>;
      opts: Record<string, unknown>;
    }> = [];
    const queue = {
      add: jest.fn(
        async (
          _name: string,
          data: Record<string, unknown>,
          opts: Record<string, unknown>,
        ) => {
          added.push({ data, opts });
          return { id: opts.jobId };
        },
      ),
    };
    return {
      service: new RestaurantSecondaryLocationExpansionQueueService(
        queue as never,
        { metroLocationProbe: { findUnique: async () => null } } as never,
      ),
      added,
    };
  }

  it('enqueued INSIDE a campaign-driven bulk flow, the campaign id is captured', async () => {
    const { service, added } = makeQueue();
    await runInWorkContext({ campaignId: 'camp-city-onboarding-austin' }, () =>
      service.queueExpansion('ent-1', 'place-1', { source: 'city-onboarding' }),
    );
    expect(added[0].data.campaignId).toBe('camp-city-onboarding-austin');
  });

  it('ROUTINE enqueue carries NO campaign — and is not refused for it', async () => {
    const { service, added } = makeQueue();
    // No work context at all: this is what collection-triggered expansion is.
    const jobId = await service.queueExpansion('ent-1', 'place-1', {
      source: 'google_places_enrichment',
    });
    expect(added[0].data.campaignId).toBeUndefined();
    // THE ruled law: routine collections are approval-free. The enqueue
    // succeeds, unconditionally.
    expect(jobId).toBeTruthy();
    expect(added).toHaveLength(1);
  });

  it('the queue options make attempts:3 usable — failed jobs do not squat on the jobId', async () => {
    const { service, added } = makeQueue();
    await service.queueExpansion('ent-1', 'place-1');
    expect(added[0].opts).toMatchObject({
      attempts: 3,
      removeOnFail: true,
      backoff: { type: 'exponential', delay: 5000 },
    });
  });

  it('the WORKER re-establishes the campaign across the BullMQ boundary', async () => {
    const seen: Array<string | undefined> = [];
    const enrichment = {
      expandSecondaryLocationsForRestaurant: jest.fn(async () => {
        seen.push(currentCampaignId());
      }),
    };
    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const worker = new RestaurantSecondaryLocationExpansionWorker(
      enrichment as never,
      {
        $queryRaw: async () => [],
        metroLocationProbe: { upsert: async () => ({}) },
      } as never,
      logger as never,
    );
    worker.onModuleInit();

    await worker.handle({
      id: 'j1',
      data: {
        restaurantId: 'ent-1',
        placeId: 'place-1',
        requestedAt: 'now',
        campaignId: 'camp-reextract-v7',
      },
    } as never);
    await worker.handle({
      id: 'j2',
      data: { restaurantId: 'ent-1', placeId: 'place-1', requestedAt: 'now' },
    } as never);

    expect(seen).toEqual(['camp-reextract-v7', undefined]);
  });

  it('the worker does NOT swallow — a throw reaches bull', async () => {
    const enrichment = {
      expandSecondaryLocationsForRestaurant: jest.fn(async () => {
        throw new Error('Places 503: upstream unavailable');
      }),
    };
    const logger = {
      setContext: () => logger,
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };
    const worker = new RestaurantSecondaryLocationExpansionWorker(
      enrichment as never,
      {
        $queryRaw: async () => [],
        metroLocationProbe: { upsert: async () => ({}) },
      } as never,
      logger as never,
    );
    worker.onModuleInit();
    await expect(
      worker.handle({
        id: 'j1',
        data: {
          restaurantId: 'ent-1',
          placeId: 'place-1',
          requestedAt: 'now',
        },
      } as never),
    ).rejects.toThrow('Places 503');
  });
});
