import 'reflect-metadata';
import { SignalDemandReadService } from './signal-demand-read.service';
import {
  DEMAND_HALF_LIFE_DAYS,
  RECENCY_FLAT_DAYS,
} from '../polls/supply/poll-supply.constants';

/**
 * §22 item 6 reader specs: the substrate readers that replaced every
 * event-table consumer — contract shapes are FROZEN (recently-viewed rows,
 * recent-search rows), redirects/dedupe are judged at read, and the demand
 * math carries the one §4 kernel (K1 flat cycle + half-life; per-actor log2
 * saturation) — asserted structurally over the emitted SQL.
 */

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ACTOR_ID = '22222222-2222-2222-2222-222222222222';
const ENTITY_ID = '33333333-3333-3333-3333-333333333333';

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

interface CapturedQuery {
  text: string;
  values: unknown[];
}

function createHarness(
  options: {
    rows?: unknown[];
    actor?: boolean;
    /** entity_redirects sources returned by the 3c app-side expansion. */
    redirectSources?: string[];
  } = {},
) {
  const queries: CapturedQuery[] = [];
  const prisma = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        queries.push({ text: strings.join('¤'), values });
        return Promise.resolve(options.rows ?? []);
      },
    ),
    signalActor: {
      findUnique: jest.fn(() =>
        Promise.resolve(options.actor === false ? null : { actorId: ACTOR_ID }),
      ),
    },
    entityRedirect: {
      findMany: jest.fn(() =>
        Promise.resolve(
          (options.redirectSources ?? []).map((fromEntityId) => ({
            fromEntityId,
          })),
        ),
      ),
    },
  };
  const service = new SignalDemandReadService(
    prisma as never,
    createLogger() as never,
  );
  return { service, prisma, queries };
}

/** Fold nested Prisma.sql fragment text into one assertable string. */
function flatten(query: CapturedQuery): string {
  const parts = [query.text];
  const walk = (value: unknown) => {
    if (value && typeof value === 'object' && 'strings' in value) {
      const fragment = value as { strings: string[]; values: unknown[] };
      parts.push((fragment.strings ?? []).join('¤'));
      (fragment.values ?? []).forEach(walk);
    }
  };
  query.values.forEach(walk);
  return parts.join('¤');
}

/** Every bound scalar/array, including ones nested in sql fragments. */
function allValues(query: CapturedQuery): unknown[] {
  const collected: unknown[] = [];
  const walk = (value: unknown) => {
    if (value && typeof value === 'object' && 'strings' in value) {
      const fragment = value as { strings: string[]; values?: unknown[] };
      (fragment.values ?? []).forEach(walk);
    } else {
      collected.push(value);
    }
  };
  query.values.forEach(walk);
  return collected;
}

describe('SignalDemandReadService — substrate readers (§22 item 6)', () => {
  describe('entityDemandScores', () => {
    it('omitting kinds means EVERY kind counts (self-provisioning — no kind filter in the SQL)', async () => {
      const { service, queries } = createHarness({
        rows: [{ entity_id: ENTITY_ID, demand_score: 2.5 }],
      });
      const scores = await service.entityDemandScores({
        entityIds: [ENTITY_ID],
        windowDays: 30,
      });
      expect(scores.get(ENTITY_ID)).toBe(2.5);
      const sql = flatten(queries[0]);
      expect(sql).not.toContain('kind = ANY');
      // Aggregate reads the GLOBAL tile only (never multiplied by place
      // attribution fan-out), today reads fresh from the ledger.
      expect(sql).toContain('a.place_id IS NULL');
      expect(sql).toContain('FROM signals s');
      // Redirects at read, on BOTH lanes.
      expect(sql).toContain('r.from_entity_id = a.subject_id');
      expect(sql).toContain('r.from_entity_id = s.subject_id');
      // The §4 kernel: per-actor saturation before actors sum.
      expect(sql).toContain('LN(1 + acts) / LN(2)');
    });

    it('an explicit kinds filter is applied (act-specific reader lanes)', async () => {
      const { service, queries } = createHarness();
      await service.entityDemandScores({
        entityIds: [ENTITY_ID],
        kinds: ['autocomplete_selection'],
        windowDays: 30,
      });
      const sql = flatten(queries[0]);
      expect(sql).toContain('kind = ANY');
      expect(allValues(queries[0])).toContainEqual(['autocomplete_selection']);
    });

    it('K1 recency constants govern the day kernel (flat cycle then half-life)', async () => {
      const { service, queries } = createHarness();
      await service.entityDemandScores({
        entityIds: [ENTITY_ID],
        windowDays: 30,
      });
      const values = allValues(queries[0]);
      expect(values).toContain(RECENCY_FLAT_DAYS);
      expect(values).toContain(DEMAND_HALF_LIFE_DAYS);
    });

    it('an affinity read for a user with no actor row returns empty WITHOUT querying', async () => {
      const { service, prisma } = createHarness({ actor: false });
      const scores = await service.entityDemandScores({
        entityIds: [ENTITY_ID],
        userId: USER_ID,
        windowDays: 30,
      });
      expect(scores.size).toBe(0);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('empty entityIds / empty kinds array short-circuit', async () => {
      const { service, prisma } = createHarness();
      await expect(
        service.entityDemandScores({ entityIds: [], windowDays: 30 }),
      ).resolves.toEqual(new Map());
      await expect(
        service.entityDemandScores({
          entityIds: [ENTITY_ID],
          kinds: [],
          windowDays: 30,
        }),
      ).resolves.toEqual(new Map());
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('SARGABLE redirect filter (red-team 3c): raw subject_id probes the app-expanded id set; COALESCE folds back to the REQUESTED ids only', async () => {
      const source = '44444444-4444-4444-4444-444444444444';
      const { service, prisma, queries } = createHarness({
        redirectSources: [source],
      });
      await service.entityDemandScores({
        entityIds: [ENTITY_ID],
        windowDays: 30,
      });
      // One indexed entity_redirects lookup expands the requested survivors
      // with their redirect sources.
      expect(prisma.entityRedirect.findMany).toHaveBeenCalledWith({
        where: { toEntityId: { in: [ENTITY_ID] } },
        select: { fromEntityId: true },
      });
      const sql = flatten(queries[0]);
      // Sargable probes on BOTH lanes...
      expect(sql).toContain('a.subject_id = ANY(');
      expect(sql).toContain('s.subject_id = ANY(');
      // ...bound to the EXPANDED set, while the fold-back COALESCE stays on
      // the requested ids (exact old semantics).
      const arrays = allValues(queries[0]).filter(Array.isArray);
      expect(arrays).toContainEqual([ENTITY_ID, source]);
      expect(arrays).toContainEqual([ENTITY_ID]);
      expect(sql).toContain('COALESCE(r.to_entity_id, a.subject_id) = ANY(');
    });

    it('fresh TODAY lane excludes request-ids first seen on an earlier day (red-team 1c — cross-midnight retries count once)', async () => {
      const { service, queries } = createHarness();
      await service.entityDemandScores({
        entityIds: [ENTITY_ID],
        windowDays: 30,
      });
      const sql = flatten(queries[0]);
      expect(sql).toContain('NOT EXISTS');
      expect(sql).toContain('prior.occurred_at <');
    });
  });

  describe('queryDemand (global suggestion lane)', () => {
    it('reads search-kind term rows from the global tile, prefix-escaped', async () => {
      const { service, queries } = createHarness();
      await service.queryDemand({
        prefix: '50%_taco',
        windowDays: 90,
        limit: 10,
      });
      const sql = flatten(queries[0]);
      expect(sql).toContain("a.kind = 'search'");
      expect(sql).toContain('a.place_id IS NULL');
      expect(sql).toContain('a.subject_text IS NOT NULL');
      expect(allValues(queries[0])).toContain('50\\%\\_taco%');
    });

    it('key-scoped hydration reads exact keys', async () => {
      const { service, queries } = createHarness();
      await service.queryDemand({
        keys: ['Birria Tacos '],
        windowDays: 90,
        limit: 10,
      });
      const sql = flatten(queries[0]);
      expect(sql).toContain('subject_text = ANY');
      expect(allValues(queries[0])).toContainEqual(['birria tacos']);
    });

    it('returns nothing without a prefix or keys', async () => {
      const { service, prisma } = createHarness();
      await expect(
        service.queryDemand({ windowDays: 90, limit: 10 }),
      ).resolves.toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('personal lanes (recent searches)', () => {
    it('personalQueryRows reads the actor ledger with §3 retry dedupe', async () => {
      const { service, queries, prisma } = createHarness({
        rows: [
          {
            query_key: 'birria tacos',
            signal_count: BigInt(3),
            last_used: new Date('2026-07-18T00:00:00Z'),
          },
        ],
      });
      const rows = await service.personalQueryRows(USER_ID, {
        prefix: 'bir',
        windowDays: 90,
        limit: 20,
      });
      expect(prisma.signalActor.findUnique).toHaveBeenCalledWith({
        where: { userId: USER_ID },
        select: { actorId: true },
      });
      expect(rows).toEqual([
        {
          queryKey: 'birria tacos',
          signalCount: 3,
          lastUsed: new Date('2026-07-18T00:00:00Z'),
        },
      ]);
      const sql = flatten(queries[0]);
      expect(sql).toContain("s.kind = 'search'");
      expect(sql).toContain("s.meta->>'searchRequestId'");
      expect(sql).toContain("s.meta->>'cacheRevealRequestId'");
      expect(queries[0].values).toContain(ACTOR_ID);
    });

    it('no actor row (user never acted) reads as empty, not an error', async () => {
      const { service, prisma } = createHarness({ actor: false });
      await expect(
        service.personalQueryRows(USER_ID, {
          prefix: 'x',
          windowDays: 90,
          limit: 5,
        }),
      ).resolves.toEqual([]);
      await expect(
        service.personalQueryCounts(USER_ID, ['x'], 90),
      ).resolves.toEqual(new Map());
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('recently-viewed lanes (frozen history contract + locationId)', () => {
    it('restaurants: contract fields incl. the latest view locationId; redirect-resolved; restaurant-typed', async () => {
      const lastViewedAt = new Date('2026-07-18T12:00:00Z');
      const { service, queries } = createHarness({
        rows: [
          {
            restaurant_id: ENTITY_ID,
            restaurant_name: 'Franklin Barbecue',
            city: 'Austin',
            region: 'TX',
            last_viewed_at: lastViewedAt,
            view_count: 4,
            location_id: 'loc-1',
          },
        ],
      });
      const rows = await service.recentlyViewedRestaurants(USER_ID, {
        prefix: 'Fra',
        limit: 10,
      });
      expect(rows).toEqual([
        {
          restaurantId: ENTITY_ID,
          restaurantName: 'Franklin Barbecue',
          city: 'Austin',
          region: 'TX',
          lastViewedAt,
          viewCount: 4,
          locationId: 'loc-1',
        },
      ]);
      const sql = flatten(queries[0]);
      expect(sql).toContain("s.kind = 'entity_view'");
      expect(sql).toContain("e.type = 'restaurant'");
      expect(sql).toContain('r.from_entity_id = s.subject_id');
      expect(sql).toContain("s.meta->>'locationId'");
    });

    it('foods: grouped by the viewed CONNECTION (the old user_food_views grain)', async () => {
      const lastViewedAt = new Date('2026-07-18T12:00:00Z');
      const { service, queries } = createHarness({
        rows: [
          {
            connection_id: 'c-1',
            food_id: 'f-1',
            food_name: 'Brisket',
            restaurant_id: 'r-1',
            restaurant_name: 'Franklin Barbecue',
            last_viewed_at: lastViewedAt,
            view_count: 2,
            location_id: null,
          },
        ],
      });
      const rows = await service.recentlyViewedFoods(USER_ID, { limit: 10 });
      expect(rows).toEqual([
        {
          connectionId: 'c-1',
          foodId: 'f-1',
          foodName: 'Brisket',
          restaurantId: 'r-1',
          restaurantName: 'Franklin Barbecue',
          lastViewedAt,
          viewCount: 2,
          locationId: null,
        },
      ]);
      const sql = flatten(queries[0]);
      expect(sql).toContain("s.meta->>'connectionId'");
      expect(sql).toContain('core_restaurant_items');
    });

    it('foods survive entity merges (red-team 2b): a dead connectionId re-resolves through entity_redirects to the SURVIVING connection', async () => {
      const { service, queries } = createHarness();
      await service.recentlyViewedFoods(USER_ID, { limit: 10 });
      const sql = flatten(queries[0]);
      // The recorded connection joins LEFT (merges DELETE folded losers)...
      expect(sql).toContain('LEFT JOIN core_restaurant_items direct');
      // ...and the fallback resolves the signal's food subject + serving
      // restaurant through redirects to the survivor's current connection.
      expect(sql).toContain('rf.from_entity_id = a.subject_id');
      expect(sql).toContain("s.meta->>'contextRestaurantId'");
      expect(sql).toContain('direct.connection_id IS NULL');
      expect(sql).toContain(
        'survivor.food_id = COALESCE(rf.to_entity_id, a.subject_id)',
      );
      expect(sql).toContain(
        'survivor.restaurant_id = COALESCE(rr.to_entity_id, a.ctx_restaurant_id)',
      );
    });

    it('view stats + viewed-name matches serve the autocomplete lanes from the ledger', async () => {
      const stats = createHarness({
        rows: [
          {
            restaurant_id: ENTITY_ID,
            last_viewed_at: new Date('2026-07-18T12:00:00Z'),
            view_count: 7,
          },
        ],
      });
      await expect(
        stats.service.restaurantViewStats(USER_ID, [ENTITY_ID]),
      ).resolves.toEqual([
        {
          restaurantId: ENTITY_ID,
          lastViewedAt: new Date('2026-07-18T12:00:00Z'),
          viewCount: 7,
        },
      ]);

      const matches = createHarness({
        rows: [
          {
            restaurant_id: ENTITY_ID,
            name: 'Franklin Barbecue',
            aliases: null,
            last_viewed_at: new Date('2026-07-18T12:00:00Z'),
          },
        ],
      });
      await expect(
        matches.service.viewedRestaurantNameMatches(USER_ID, 'Fra', 20),
      ).resolves.toEqual([
        { restaurantId: ENTITY_ID, name: 'Franklin Barbecue', aliases: [] },
      ]);
    });
  });

  describe('recentSearches (/search/recent reader cut — red-team 2a)', () => {
    it('reads the actor search ledger, resolves the selection through redirects, and flags explicit autocomplete selections', async () => {
      const lastSearchedAt = new Date('2026-07-19T03:00:00Z');
      const { service, queries } = createHarness({
        rows: [
          {
            query_text: 'franklin barbecue',
            last_searched_at: lastSearchedAt,
            resolved_entity_id: ENTITY_ID,
            resolved_entity_type: 'restaurant',
            resolved_entity_name: 'Franklin Barbecue',
            explicit_selection: true,
          },
        ],
      });
      const rows = await service.recentSearches(USER_ID, 8);
      expect(rows).toEqual([
        {
          queryText: 'franklin barbecue',
          lastSearchedAt,
          resolvedEntityId: ENTITY_ID,
          resolvedEntityType: 'restaurant',
          resolvedEntityName: 'Franklin Barbecue',
          explicitSelection: true,
        },
      ]);
      const sql = flatten(queries[0]);
      // The ledger, not the dying search_events tables.
      expect(sql).toContain('FROM signals s');
      expect(sql).not.toContain('search_events');
      // Distinct terms, newest entity-resolved act supplies the selection,
      // redirect-resolved; explicitness = companion autocomplete_selection
      // act on the same searchRequestId.
      expect(sql).toContain('GROUP BY s.subject_text');
      expect(sql).toContain('r.from_entity_id = l.subject_id');
      expect(sql).toContain("a.kind = 'autocomplete_selection'");
      expect(sql).toContain("a.meta->>'searchRequestId' = l.request_id");
    });

    it('no actor row reads as empty without querying', async () => {
      const { service, prisma } = createHarness({ actor: false });
      await expect(service.recentSearches(USER_ID, 8)).resolves.toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });
});
