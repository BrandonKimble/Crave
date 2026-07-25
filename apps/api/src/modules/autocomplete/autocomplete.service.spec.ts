import 'reflect-metadata';
import { EntityType } from '@prisma/client';
import type { User } from '@prisma/client';
import { AutocompleteService } from './autocomplete.service';

// Suggest refit (owner-ratified 2026-07-24, plans/suggest-ideal-shape.md).
// Laws under test:
// - ATTRIBUTE LANE: the three support signals fuse as independent RANKINGS
//   via unweighted RRF — a candidate top in 2 of 3 sub-rankings beats one
//   top in 1, even when the "1" was the old 0.6-weighted typed signal (the
//   deleted 0.6/0.3/0.1 blend would have inverted this).
// - USER/POLL LANES: no similarity floors — prefix tier first, then
//   word-similarity rank order, capped at the K1 slots (≤ 3 each).
// - CROSS-LANE FUSION: unweighted RRF over lane ranks; same-rank ties break
//   on evidence-tier strength, and a same-rank same-strength user/poll row
//   never displaces an entity (lane-order tie-break).
// - IMPRESSIONS: one structured info line per request with
//   {queryLength, rows:[{lane, entityType, entityRef, position, evidenceTier}]},
//   query text hashed.

const BOUNDS = {
  northEast: { lat: 30.4, lng: -97.6 },
  southWest: { lat: 30.1, lng: -97.9 },
};

type SqlLike = { strings?: string[]; values?: unknown[] };

function sqlText(query: unknown): string {
  const q = query as SqlLike;
  if (Array.isArray(q?.strings)) {
    return q.strings.join(' ');
  }
  return String(query);
}

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

interface HarnessOverrides {
  entityResults?: Array<{
    entityId: string;
    name: string;
    type: EntityType;
    similarity: number;
    evidence: string;
  }>;
  attributeResults?: Array<{
    entityId: string;
    name: string;
    type: EntityType;
    similarity: number;
    evidence: string;
  }>;
  querySuggestions?: Array<{
    text: string;
    globalCount: number;
    userCount: number;
    source: 'personal' | 'global';
  }>;
  pollRows?: Array<{
    poll_id: string;
    question: string;
    sim: number;
    is_prefix: boolean;
  }>;
  userRows?: Array<{
    user_id: string;
    username: string | null;
    display_name: string | null;
    sim: number;
    is_prefix: boolean;
  }>;
  corpusRows?: Array<{
    attributeId: string;
    corpusConnectionCount: number;
    totalRestaurantCount: number;
  }>;
  typedDemand?: Map<string, number>;
  selectionDemand?: Map<string, number>;
}

function createHarness(overrides: HarnessOverrides = {}) {
  process.env.AUTOCOMPLETE_CACHE_TTL_SECONDS = '0';

  const logger = createLogger();
  const loggerService = { setContext: () => logger };
  const redis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
  };
  const redisService = { getOrThrow: () => redis };
  const entityResolutionService = {
    resolveBatch: jest.fn().mockResolvedValue({ resolutionResults: [] }),
  };
  const textSanitizer = {
    sanitizeOrThrow: jest.fn((value: string) => value.trim()),
  };
  const entitySearchService = {
    searchEntitiesHybrid: jest
      .fn()
      .mockResolvedValue(overrides.entityResults ?? []),
    searchAttributeAutocompleteEntities: jest
      .fn()
      .mockResolvedValue(overrides.attributeResults ?? []),
  };
  const queryRaw = jest.fn().mockImplementation((query: unknown) => {
    const sql = sqlText(query);
    if (sql.includes('FROM polls')) {
      return Promise.resolve(overrides.pollRows ?? []);
    }
    if (sql.includes('FROM users')) {
      return Promise.resolve(overrides.userRows ?? []);
    }
    if (sql.includes('attribute_refs')) {
      return Promise.resolve(overrides.corpusRows ?? []);
    }
    return Promise.resolve([]);
  });
  const prisma = {
    $queryRaw: queryRaw,
    favoriteListItem: { findMany: jest.fn().mockResolvedValue([]) },
    entity: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const searchQuerySuggestionService = {
    getSuggestions: jest
      .fn()
      .mockResolvedValue(overrides.querySuggestions ?? []),
  };
  const searchPopularityService = {
    getEntityPopularityScores: jest.fn().mockResolvedValue(new Map()),
    getUserEntityAffinity: jest.fn().mockResolvedValue(new Map()),
  };
  const restaurantStatusService = {
    getStatusPreviews: jest.fn().mockResolvedValue([]),
  };
  const signalDemandRead = {
    viewedRestaurantNameMatches: jest.fn().mockResolvedValue([]),
    restaurantViewStats: jest.fn().mockResolvedValue([]),
    entityDemandScores: jest
      .fn()
      .mockImplementation(({ kinds }: { kinds: string[] }) => {
        if (kinds.includes('search')) {
          return Promise.resolve(overrides.typedDemand ?? new Map());
        }
        return Promise.resolve(overrides.selectionDemand ?? new Map());
      }),
  };
  const service = new AutocompleteService(
    loggerService as never,
    redisService as never,
    entityResolutionService as never,
    textSanitizer as never,
    entitySearchService as never,
    prisma as never,
    searchQuerySuggestionService as never,
    searchPopularityService as never,
    restaurantStatusService as never,
    signalDemandRead as never,
  );

  return {
    service,
    logger,
    queryRaw,
    entitySearchService,
    prisma,
  };
}

describe('AutocompleteService — attribute lane RRF', () => {
  it('a candidate top in 2 of 3 sub-rankings beats one top in 1 (the deleted 0.6-weighted blend would invert this)', async () => {
    // vegan: top of selection-demand AND corpus; vegetarian: top of typed only.
    // Old blend: vegetarian = 0.6×typed beats vegan = 0.3+0.1. RRF: vegan
    // holds two rank-1 seats (2/61) vs one (1/61) — vegan must win.
    const { service } = createHarness({
      attributeResults: [
        {
          entityId: 'attr-vegetarian',
          name: 'vegetarian',
          type: EntityType.food_attribute,
          similarity: 0.9,
          evidence: 'prefix',
        },
        {
          entityId: 'attr-vegan',
          name: 'vegan',
          type: EntityType.food_attribute,
          similarity: 0.9,
          evidence: 'prefix',
        },
      ],
      typedDemand: new Map([['attr-vegetarian', 8]]),
      selectionDemand: new Map([['attr-vegan', 6]]),
      corpusRows: [
        {
          attributeId: 'attr-vegan',
          corpusConnectionCount: 30,
          totalRestaurantCount: 100,
        },
      ],
    });

    const response = await service.autocompleteEntities({ query: 'veg' });
    const attributeIds = response.matches
      .filter((match) => match.entityType === EntityType.food_attribute)
      .map((match) => match.entityId);

    expect(attributeIds).toEqual(['attr-vegan', 'attr-vegetarian']);
  });

  it('keeps the structural show/hide gate: fuzzy attribute evidence hides under 4 typed chars, prefix always shows', async () => {
    const fuzzyAttr = {
      entityId: 'attr-fuzzy',
      name: 'tacos al pastor style',
      type: EntityType.food_attribute,
      similarity: 0.4,
      evidence: 'fuzzy',
    };
    const shortQuery = await createHarness({
      attributeResults: [fuzzyAttr],
    }).service.autocompleteEntities({ query: 'tac' });
    expect(shortQuery.matches).toHaveLength(0);

    const longQuery = await createHarness({
      attributeResults: [fuzzyAttr],
    }).service.autocompleteEntities({ query: 'taco' });
    expect(longQuery.matches.map((match) => match.entityId)).toEqual([
      'attr-fuzzy',
    ]);
  });
});

describe('AutocompleteService — user lane (rank-only, K1 slots)', () => {
  it('caps person rows at 3 and seats prefix hits above stronger fuzzy similarity', async () => {
    // Rows arrive shuffled with a HIGHER-sim fuzzy row first; the lane must
    // re-assert prefix-tier-first and cut to the 3 ratified slots.
    const { service } = createHarness({
      userRows: [
        {
          user_id: 'user-fuzzy-high',
          username: 'omara',
          display_name: 'Omara',
          sim: 0.95,
          is_prefix: false,
        },
        {
          user_id: 'user-prefix-1',
          username: 'marco',
          display_name: 'Marco',
          sim: 0.5,
          is_prefix: true,
        },
        {
          user_id: 'user-prefix-2',
          username: 'maria',
          display_name: 'Maria',
          sim: 0.4,
          is_prefix: true,
        },
        {
          user_id: 'user-fuzzy-low',
          username: 'amar',
          display_name: 'Amar',
          sim: 0.2,
          is_prefix: false,
        },
        {
          user_id: 'user-fuzzy-lowest',
          username: 'tamar',
          display_name: 'Tamar',
          sim: 0.1,
          is_prefix: false,
        },
      ],
    });

    const response = await service.autocompleteEntities({ query: 'mar' });
    const userIds = response.matches
      .filter((match) => match.matchType === 'user')
      .map((match) => match.entityId);

    expect(userIds).toEqual([
      'user-prefix-1',
      'user-prefix-2',
      'user-fuzzy-high',
    ]);
  });

  it('keeps the ratified min-query-length gates (2 for users, 3 for polls)', async () => {
    const { service, queryRaw } = createHarness({});
    await service.autocompleteEntities({ query: 'm', bounds: BOUNDS });
    const sqlCalls = queryRaw.mock.calls.map(([query]) => sqlText(query));
    expect(sqlCalls.some((sql) => sql.includes('FROM users'))).toBe(false);
    expect(sqlCalls.some((sql) => sql.includes('FROM polls'))).toBe(false);

    const twoChar = createHarness({});
    await twoChar.service.autocompleteEntities({ query: 'ma', bounds: BOUNDS });
    const twoCharSql = twoChar.queryRaw.mock.calls.map(([query]) =>
      sqlText(query),
    );
    expect(twoCharSql.some((sql) => sql.includes('FROM users'))).toBe(true);
    expect(twoCharSql.some((sql) => sql.includes('FROM polls'))).toBe(false);
  });
});

describe('AutocompleteService — poll lane (rank-only, K1 slots)', () => {
  it('caps poll rows at 3 with prefix-tier first', async () => {
    const { service } = createHarness({
      pollRows: [
        {
          poll_id: 'poll-fuzzy-high',
          question: 'best breakfast tacos?',
          sim: 0.9,
          is_prefix: false,
        },
        {
          poll_id: 'poll-prefix',
          question: 'tacos or barbecue tonight?',
          sim: 0.4,
          is_prefix: true,
        },
        {
          poll_id: 'poll-fuzzy-mid',
          question: 'late night tacos?',
          sim: 0.6,
          is_prefix: false,
        },
        {
          poll_id: 'poll-fuzzy-low',
          question: 'chips and queso or tacos?',
          sim: 0.2,
          is_prefix: false,
        },
      ],
    });

    const response = await service.autocompleteEntities({
      query: 'tacos',
      bounds: BOUNDS,
    });
    const pollIds = response.matches
      .filter((match) => match.matchType === 'poll')
      .map((match) => match.entityId);

    expect(pollIds).toEqual([
      'poll-prefix',
      'poll-fuzzy-high',
      'poll-fuzzy-mid',
    ]);
  });
});

describe('AutocompleteService — cross-lane RRF fusion', () => {
  it('fuses lane ranks with the evidence-tier tie-break: exact entity > same-rank prefix user > rank-2 entity', async () => {
    const { service } = createHarness({
      entityResults: [
        {
          entityId: 'food-exact',
          name: 'ramen',
          type: EntityType.food,
          similarity: 1.0,
          evidence: 'exact',
        },
        {
          entityId: 'food-prefix',
          name: 'ramen burger',
          type: EntityType.food,
          similarity: 0.9,
          evidence: 'prefix',
        },
      ],
      userRows: [
        {
          user_id: 'user-ramen',
          username: 'ramenlover',
          display_name: 'Ramen Lover',
          sim: 0.8,
          is_prefix: true,
        },
      ],
    });

    const response = await service.autocompleteEntities({ query: 'ramen' });
    expect(response.matches.map((match) => match.entityId)).toEqual([
      'food-exact', // lane rank 1, evidence strength: exact
      'user-ramen', // lane rank 1, prefix — outranks any rank-2 row
      'food-prefix', // lane rank 2
    ]);
  });

  it('never lets a same-rank same-evidence user row displace an entity (lane-order tie-break)', async () => {
    const { service } = createHarness({
      entityResults: [
        {
          entityId: 'food-prefix',
          name: 'mariscos plate',
          type: EntityType.food,
          similarity: 0.9,
          evidence: 'prefix',
        },
      ],
      userRows: [
        {
          user_id: 'user-prefix',
          username: 'mariposa',
          display_name: 'Mariposa',
          sim: 0.9,
          is_prefix: true,
        },
      ],
    });

    const response = await service.autocompleteEntities({ query: 'mari' });
    expect(response.matches.map((match) => match.entityId)).toEqual([
      'food-prefix',
      'user-prefix',
    ]);
  });

  it('caps the panel at the ratified 8 rows', async () => {
    const entityResults = Array.from({ length: 12 }, (_, index) => ({
      entityId: `food-${index}`,
      name: `taco dish ${String.fromCharCode(97 + index)}`,
      type: EntityType.food,
      similarity: 0.9,
      evidence: 'prefix',
    }));
    const { service } = createHarness({ entityResults });

    const response = await service.autocompleteEntities({ query: 'taco' });
    expect(response.matches).toHaveLength(8);
  });
});

describe('AutocompleteService — impression instrumentation', () => {
  it('emits one autocomplete_impressions info line with lane/position rows and hashed query refs', async () => {
    const { service, logger } = createHarness({
      entityResults: [
        {
          entityId: 'food-exact',
          name: 'ramen',
          type: EntityType.food,
          similarity: 1.0,
          evidence: 'exact',
        },
      ],
      querySuggestions: [
        {
          text: 'ramen near me',
          globalCount: 5,
          userCount: 0,
          source: 'global',
        },
      ],
    });

    await service.autocompleteEntities({ query: 'ramen' });

    const impressionCalls = logger.info.mock.calls.filter(
      ([message]) => message === 'autocomplete_impressions',
    ) as Array<[string, unknown]>;
    expect(impressionCalls).toHaveLength(1);

    const meta = impressionCalls[0][1] as {
      event: string;
      queryLength: number;
      rows: Array<{
        lane: string;
        entityType: string;
        entityRef: string;
        position: number;
        evidenceTier: string | null;
      }>;
    };
    expect(meta.event).toBe('autocomplete_impressions');
    expect(meta.queryLength).toBe(5);

    const entityRow = meta.rows.find((row) => row.lane === 'entity');
    expect(entityRow).toMatchObject({
      entityType: EntityType.food,
      entityRef: 'food-exact',
      evidenceTier: 'exact',
    });
    expect(typeof entityRow?.position).toBe('number');

    const queryRow = meta.rows.find((row) => row.lane === 'query');
    expect(queryRow).toBeDefined();
    // Query text is hashed — a stable 16-hex ref, never the raw string.
    expect(queryRow?.entityRef).toMatch(/^[0-9a-f]{16}$/);
    expect(queryRow?.entityRef).not.toContain('ramen');

    const stripRows = meta.rows.filter((row) => row.lane === 'query_strip');
    expect(stripRows.length).toBeGreaterThan(0);
    expect(stripRows[0].entityRef).toMatch(/^[0-9a-f]{16}$/);

    // Positions are contiguous within the panel rows.
    const panelRows = meta.rows.filter((row) => row.lane !== 'query_strip');
    expect(panelRows.map((row) => row.position)).toEqual(
      panelRows.map((_, index) => index),
    );
  });
});

describe('AutocompleteService — query lane rank-only', () => {
  it('seats personal suggestions (own recency) above global ones inside the query lane', async () => {
    const { service } = createHarness({
      querySuggestions: [
        {
          text: 'global hit',
          globalCount: 40,
          userCount: 0,
          source: 'global',
        },
        {
          text: 'my recent search',
          globalCount: 0,
          userCount: 1,
          source: 'personal',
        },
      ],
    });
    // A user object is not needed for lane mechanics — the suggestion source
    // already encodes personal vs global.
    const response = await service.autocompleteEntities(
      { query: 'searchterm' },
      { userId: 'user-1' } as User,
    );

    const queryNames = response.matches
      .filter((match) => match.matchType === 'query')
      .map((match) => match.name);
    expect(queryNames).toEqual(['my recent search', 'global hit']);
  });
});
