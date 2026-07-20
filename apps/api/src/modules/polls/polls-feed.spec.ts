/**
 * §22 item 5 — the polls FEED cut (plans/geo-demand-foundation-rebuild.md §6):
 * places-in-view membership (+ descendants of the commensurate subject,
 * + legacy in-view markets interim), §2 header verdict stamped, keyset
 * cursor stability under mid-pagination inserts, batch place labels, and
 * the cold-start promise state.
 *
 * The prisma fake evaluates the REAL SQL parameters (membership arrays,
 * keyset tuple, limit) against an in-memory poll table, so the paging
 * contract is exercised end-to-end through the service.
 */
import 'reflect-metadata';
import { PollsService } from './polls.service';

const TOWN = '11111111-1111-1111-1111-111111111111';
const STATE = '44444444-4444-4444-4444-444444444444';
const NEIGHBORHOOD = '55555555-5555-5555-5555-555555555555';

const VIEW_BOUNDS = {
  northEast: { lat: 1, lng: 1 },
  southWest: { lat: 0, lng: 0 },
};

interface FakePollRow {
  poll_id: string;
  place_id: string | null;
  market_key: string | null;
  created_at: Date;
}

function pollId(n: number): string {
  return `aaaaaaaa-aaaa-aaaa-aaaa-${String(n).padStart(12, '0')}`;
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

function createHarness(options: {
  pollTable: FakePollRow[];
  placesInView: Array<{
    placeId: string;
    name: string;
    coverageOfView: number;
    placeArea: number;
  }>;
  /** placeId → deduped parent edges (drives the structural §4 bigness). */
  parents?: Record<string, string[]>;
  /** Descendant rows the subtree CTE returns (roots echo + these). */
  descendants?: string[];
  legacyMarkets?: string[];
}) {
  const parents = options.parents ?? {};
  const placeNames = new Map<string, string>(
    options.placesInView.map((entry) => [entry.placeId, entry.name]),
  );
  placeNames.set(NEIGHBORHOOD, 'Old Town');

  const prisma = {
    $queryRaw: jest.fn((query: { sql: string; values: unknown[] }) => {
      const { sql, values } = query;
      if (sql.includes('WITH RECURSIVE subtree')) {
        const roots = values[0] as string[];
        const ids = [...new Set([...roots, ...(options.descendants ?? [])])];
        return Promise.resolve(ids.map((place_id) => ({ place_id })));
      }
      if (sql.includes('ORDER BY p.created_at DESC')) {
        // The 'new'-sort page query. Filter template param order:
        // state, mode, mode, launchedAfter, launchedAfter, placeIds,
        // marketKeys, [cursorDate, cursorId], limit+1.
        const placeIds = values[5] as string[];
        const marketKeys = values[6] as string[];
        const limit = values[values.length - 1] as number;
        const hasCursor = sql.includes('(p.created_at, p.poll_id) <');
        let rows = options.pollTable.filter(
          (row) =>
            (row.place_id !== null && placeIds.includes(row.place_id)) ||
            (row.place_id === null &&
              row.market_key !== null &&
              marketKeys.includes(row.market_key.toLowerCase())),
        );
        rows = [...rows].sort(
          (a, b) =>
            b.created_at.getTime() - a.created_at.getTime() ||
            (a.poll_id < b.poll_id ? 1 : -1),
        );
        if (hasCursor) {
          const cursorDate = values[values.length - 3] as Date;
          const cursorId = values[values.length - 2] as string;
          rows = rows.filter(
            (row) =>
              row.created_at.getTime() < cursorDate.getTime() ||
              (row.created_at.getTime() === cursorDate.getTime() &&
                row.poll_id < cursorId),
          );
        }
        return Promise.resolve(rows.slice(0, limit));
      }
      if (sql.includes('comment_count')) {
        return Promise.resolve([]); // attachPollStats counts
      }
      throw new Error(`unexpected raw query: ${sql.slice(0, 80)}`);
    }),
    poll: {
      findMany: jest.fn(({ where }: { where: { pollId: { in: string[] } } }) =>
        Promise.resolve(
          options.pollTable
            .filter((row) => where.pollId.in.includes(row.poll_id))
            .map((row) => ({
              pollId: row.poll_id,
              placeId: row.place_id,
              marketKey: row.market_key,
              state: 'active',
              mode: 'ranked',
              origin: 'seeded',
              createdByUserId: null,
              createdAt: row.created_at,
              launchedAt: row.created_at,
              metadata: {},
              topic: null,
            })),
        ),
      ),
    },
    place: {
      findMany: jest.fn(
        ({
          where,
          select,
        }: {
          where: { placeId: { in: string[] } };
          select: Record<string, boolean>;
        }) => {
          if (select.parentPlaceIds) {
            // isSubdivisionOrBigger's upward walk.
            return Promise.resolve(
              where.placeId.in
                .filter((id) => id in parents)
                .map((id) => ({ placeId: id, parentPlaceIds: parents[id] })),
            );
          }
          // attachPlaceLabels' ONE batch name lookup.
          return Promise.resolve(
            where.placeId.in
              .filter((id) => placeNames.has(id))
              .map((id) => ({ placeId: id, name: placeNames.get(id) })),
          );
        },
      ),
    },
    market: {
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const keys = options.legacyMarkets ?? [];
        if (where.marketKey && (where.marketKey as { in?: string[] }).in) {
          // attachMarketLabels' label lookup.
          return Promise.resolve(
            keys
              .filter((key) =>
                ((where.marketKey as { in: string[] }).in ?? []).includes(
                  key.toLowerCase(),
                ),
              )
              .map((key) => ({
                marketKey: key,
                marketName: `${key} name`,
                marketShortName: null,
              })),
          );
        }
        // legacyMarketKeysInView (isActive + bbox intersect).
        return Promise.resolve(keys.map((marketKey) => ({ marketKey })));
      }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    pollLeaderboardEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    pollEndorsement: { findMany: jest.fn().mockResolvedValue([]) },
    entity: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const placesCatalog = {
    placesInView: jest.fn().mockResolvedValue(
      options.placesInView.map((entry) => {
        const half = Math.sqrt(entry.placeArea) / 2;
        return {
          place: { placeId: entry.placeId, name: entry.name },
          bbox: {
            minLat: 0.5 - half,
            minLng: 0.5 - half,
            maxLat: 0.5 + half,
            maxLng: 0.5 + half,
          },
          coverageOfView: entry.coverageOfView,
          placeArea: entry.placeArea,
        };
      }),
    ),
  };

  const service = new PollsService(
    prisma as never,
    createLogger() as never,
    {} as never, // sanitizer
    {} as never, // moderation
    {} as never, // pollEntitySeedService
    {} as never, // gateway
    {} as never, // userEventService
    {} as never, // llmService
    {} as never, // entityTextSearch
    { record: jest.fn() } as never, // signals
    placesCatalog as never,
  );
  return { service, prisma, placesCatalog };
}

const TOWN_IN_VIEW = {
  placeId: TOWN,
  name: 'Round Rock',
  coverageOfView: 0.9,
  placeArea: 1.2,
};
const STATE_IN_VIEW = {
  placeId: STATE,
  name: 'Texas',
  coverageOfView: 1,
  placeArea: 400,
};

describe('PollsService.queryPolls — the §6 places-in-view feed', () => {
  it('feed = in-view places + descendants of the commensurate subject + legacy in-view markets; over-scale subdivision+ places excluded', async () => {
    const now = Date.now();
    const table: FakePollRow[] = [
      {
        poll_id: pollId(1),
        place_id: TOWN,
        market_key: null,
        created_at: new Date(now - 1000),
      },
      // Descendant of the commensurate town — NOT itself in the viewport read.
      {
        poll_id: pollId(2),
        place_id: NEIGHBORHOOD,
        market_key: null,
        created_at: new Date(now - 2000),
      },
      // Subdivision+ over-scale place: §4 feed-at-that-zoom → excluded here.
      {
        poll_id: pollId(3),
        place_id: STATE,
        market_key: null,
        created_at: new Date(now - 3000),
      },
      // Legacy marketKey-only rows: in-view market included, foreign market not.
      {
        poll_id: pollId(4),
        place_id: null,
        market_key: 'Austin-Metro',
        created_at: new Date(now - 4000),
      },
      {
        poll_id: pollId(5),
        place_id: null,
        market_key: 'elsewhere',
        created_at: new Date(now - 5000),
      },
    ];
    const { service } = createHarness({
      pollTable: table,
      placesInView: [TOWN_IN_VIEW, STATE_IN_VIEW],
      parents: { [STATE]: [] }, // parentless root → structurally subdivision+
      descendants: [NEIGHBORHOOD],
      legacyMarkets: ['austin-metro'],
    });

    const response = await service.queryPolls({ bounds: VIEW_BOUNDS });
    const ids = (response.polls as Array<{ pollId: string }>).map(
      (poll) => poll.pollId,
    );
    expect(ids).toEqual([pollId(1), pollId(2), pollId(4)]);
  });

  it('stamps the §2 header verdict (place name; legacy marketName mirrors it) and per-poll place labels via ONE batch query', async () => {
    const now = Date.now();
    const { service, prisma } = createHarness({
      pollTable: [
        {
          poll_id: pollId(1),
          place_id: TOWN,
          market_key: null,
          created_at: new Date(now - 1000),
        },
        {
          poll_id: pollId(2),
          place_id: NEIGHBORHOOD,
          market_key: null,
          created_at: new Date(now - 2000),
        },
      ],
      placesInView: [TOWN_IN_VIEW],
      descendants: [NEIGHBORHOOD],
    });

    const response = await service.queryPolls({ bounds: VIEW_BOUNDS });
    expect(response.header).toEqual({ placeName: 'Round Rock' });
    expect(response.marketName).toBe('Round Rock'); // legacy envelope mirror

    const polls = response.polls as Array<{
      pollId: string;
      placeName: string | null;
      marketName: string | null;
    }>;
    expect(polls[0].placeName).toBe('Round Rock');
    expect(polls[1].placeName).toBe('Old Town');
    // Place-keyed rows mirror placeName into the legacy marketName label.
    expect(polls[0].marketName).toBe('Round Rock');

    // ONE batch place-name lookup for the whole page.
    const labelCalls = prisma.place.findMany.mock.calls.filter(
      ([args]: [{ select: Record<string, boolean> }]) => args.select.name,
    );
    expect(labelCalls).toHaveLength(1);
  });

  it('CURSOR KEYSET stability: rows inserting mid-pagination cause no skips and no duplicates', async () => {
    const base = Date.now();
    const table: FakePollRow[] = [1, 2, 3, 4, 5].map((n) => ({
      poll_id: pollId(n),
      place_id: TOWN,
      market_key: null,
      created_at: new Date(base - n * 1000),
    }));
    const { service } = createHarness({
      pollTable: table,
      placesInView: [TOWN_IN_VIEW],
    });

    const seen: string[] = [];
    const page1 = await service.queryPolls({ bounds: VIEW_BOUNDS, limit: 2 });
    seen.push(
      ...(page1.polls as Array<{ pollId: string }>).map((poll) => poll.pollId),
    );
    expect(page1.nextCursor).toBeTruthy();

    // A brand-new poll lands between pages.
    table.push({
      poll_id: pollId(9),
      place_id: TOWN,
      market_key: null,
      created_at: new Date(base + 1000),
    });

    const page2 = await service.queryPolls({
      bounds: VIEW_BOUNDS,
      limit: 2,
      cursor: page1.nextCursor as string,
    });
    seen.push(
      ...(page2.polls as Array<{ pollId: string }>).map((poll) => poll.pollId),
    );
    const page3 = await service.queryPolls({
      bounds: VIEW_BOUNDS,
      limit: 2,
      cursor: page2.nextCursor as string,
    });
    seen.push(
      ...(page3.polls as Array<{ pollId: string }>).map((poll) => poll.pollId),
    );

    // Every original row exactly once, in order; the mid-pagination insert
    // neither displaces (skip) nor repeats (dupe) anything.
    expect(seen).toEqual([1, 2, 3, 4, 5].map(pollId));
    expect(page3.nextCursor).toBeNull();
  });

  it('cold-start promise state: zero polls on a SEEDED town → typed weekly-drop promise with the place name', async () => {
    const { service } = createHarness({
      pollTable: [],
      placesInView: [TOWN_IN_VIEW],
    });
    const response = await service.queryPolls({ bounds: VIEW_BOUNDS });
    expect(response.polls).toEqual([]);
    expect(response.promise).toEqual({
      kind: 'weekly_drop_pending',
      placeName: 'Round Rock',
    });
  });

  it('unnamed ground stays honest: no place, no promise, header null', async () => {
    const { service } = createHarness({ pollTable: [], placesInView: [] });
    const response = await service.queryPolls({ bounds: VIEW_BOUNDS });
    expect(response.header).toEqual({ placeName: null });
    expect(response.promise).toBeNull();
  });

  it('no view (no bounds, no legacy marketKey) → empty renderable envelope', async () => {
    const { service, placesCatalog } = createHarness({
      pollTable: [],
      placesInView: [],
    });
    const response = await service.queryPolls({});
    expect(response.polls).toEqual([]);
    expect(response.nextCursor).toBeNull();
    expect(response.header).toEqual({ placeName: null });
    expect(placesCatalog.placesInView).not.toHaveBeenCalled();
  });
});
