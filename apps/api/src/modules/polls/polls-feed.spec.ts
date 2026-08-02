/**
 * §22 item 5 — the polls FEED cut (plans/geo-demand-foundation-rebuild.md §6):
 * places-in-view membership (+ descendants of the commensurate subject),
 * §2 header verdict stamped, keyset
 * cursor stability under mid-pagination inserts, batch place labels, and
 * the cold-start promise state.
 *
 * The prisma fake evaluates the REAL SQL parameters (membership arrays,
 * keyset tuple, limit) against an in-memory poll table, so the paging
 * contract is exercised end-to-end through the service.
 */
import 'reflect-metadata';
import { PollsService } from './polls.service';
import { ViewportVerdictService } from '../places/viewport-verdict.service';

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
      if (sql.includes('GROUP BY p.place_id, pl.name')) {
        // buildPlaceOptions: GROUP BY place over the membership set, joined
        // to names (fake rows are all 'active' → inside the LIVE+CLOSED
        // universe). Zero-poll places simply produce no row.
        const placeIds = values[0] as string[];
        const counts = new Map<string, number>();
        for (const row of options.pollTable) {
          if (row.place_id && placeIds.includes(row.place_id)) {
            counts.set(row.place_id, (counts.get(row.place_id) ?? 0) + 1);
          }
        }
        return Promise.resolve(
          [...counts.entries()]
            .filter(([place_id]) => placeNames.has(place_id))
            .map(([place_id, poll_count]) => ({
              place_id,
              name: placeNames.get(place_id),
              poll_count,
            })),
        );
      }
      if (sql.includes('ORDER BY p.created_at DESC')) {
        // The 'new'-sort page query.
        //
        // Params are located BY SHAPE, not by index. They used to be read
        // positionally with the layout spelled out in a comment, so a change
        // to the WHERE clause silently shifted every read — which is exactly
        // what happened when the launchedAfter null-trick (which bound the
        // same value twice) was replaced by a conditional clause. placeIds is
        // the only array parameter, so it can simply be found.
        const placeIds = values.find((value) =>
          Array.isArray(value),
        ) as string[];
        const limit = values[values.length - 1] as number;
        const hasCursor = sql.includes('(p.created_at, p.poll_id) <');
        let rows = options.pollTable.filter(
          (row) => row.place_id !== null && placeIds.includes(row.place_id),
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
    pollLeaderboardEntry: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    pollEndorsement: { findMany: jest.fn().mockResolvedValue([]) },
    entity: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const placesCatalog = {
    catalogWatermark: jest.fn().mockResolvedValue('2026-08-01T00:00:00.000Z'),
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

  // The REAL shared seam (Job: one law, one implementation) wired over the
  // same fakes — the feed exercises the extracted composition end-to-end.
  const viewportVerdict = new ViewportVerdictService(
    prisma as never,
    placesCatalog as never,
  );
  const service = new PollsService(
    prisma as never,
    createLogger() as never,
    {} as never, // sanitizer
    {} as never, // moderation
    {} as never, // pollEntitySeedService
    {} as never, // gateway
    {} as never, // llmService
    {} as never, // entityTextSearch
    { record: jest.fn() } as never, // signals
    placesCatalog as never,
    viewportVerdict,
    { blockedPeerIds: jest.fn().mockResolvedValue(new Set()) } as never, // blocks
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
  it('feed = in-view places + descendants of the commensurate subject; over-scale subdivision+ places excluded; place-keying is the ONLY membership (backfilled legacy rows join via their place)', async () => {
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
      // BACKFILLED legacy row (legacy-poll expiry): market_key still stamped
      // but place-keyed like every other row — joins via its place, and only
      // when that place is a member.
      {
        poll_id: pollId(4),
        place_id: TOWN,
        market_key: 'Austin-Metro',
        created_at: new Date(now - 4000),
      },
      // A place outside the view's membership never joins, market_key or not.
      {
        poll_id: pollId(5),
        place_id: '99999999-9999-9999-9999-999999999999',
        market_key: 'elsewhere',
        created_at: new Date(now - 5000),
      },
    ];
    const { service } = createHarness({
      pollTable: table,
      placesInView: [TOWN_IN_VIEW, STATE_IN_VIEW],
      parents: { [STATE]: [] }, // parentless root → structurally subdivision+
      descendants: [NEIGHBORHOOD],
    });

    const response = await service.queryPolls({ bounds: VIEW_BOUNDS });
    const ids = (response.polls as Array<{ pollId: string }>).map(
      (poll) => poll.pollId,
    );
    expect(ids).toEqual([pollId(1), pollId(2), pollId(4)]);
  });

  it('stamps the §2 header verdict (place name) and per-poll place labels via ONE batch query', async () => {
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
    // The legacy market envelope is DEAD (wave-6 item 8): no marketName mirror.
    expect(response).not.toHaveProperty('marketName');
    expect(response).not.toHaveProperty('marketKey');

    const polls = response.polls as Array<{
      pollId: string;
      placeName: string | null;
    }>;
    expect(polls[0].placeName).toBe('Round Rock');
    expect(polls[1].placeName).toBe('Old Town');
    expect(polls[0]).not.toHaveProperty('marketName');

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

  it('placeOptions: membership places ranked by pollCount desc / name asc; zero-poll places ABSENT', async () => {
    const now = Date.now();
    const EMPTY_TOWN = '77777777-7777-7777-7777-777777777777';
    const { service } = createHarness({
      pollTable: [
        // 2 polls in the descendant neighborhood, 1 in the town itself.
        {
          poll_id: pollId(1),
          place_id: NEIGHBORHOOD,
          market_key: null,
          created_at: new Date(now - 1000),
        },
        {
          poll_id: pollId(2),
          place_id: NEIGHBORHOOD,
          market_key: null,
          created_at: new Date(now - 2000),
        },
        {
          poll_id: pollId(3),
          place_id: TOWN,
          market_key: null,
          created_at: new Date(now - 3000),
        },
      ],
      placesInView: [
        TOWN_IN_VIEW,
        // In view, a member — but carries ZERO polls: never listed.
        {
          placeId: EMPTY_TOWN,
          name: 'Hutto',
          coverageOfView: 0.1,
          placeArea: 0.5,
        },
      ],
      descendants: [NEIGHBORHOOD],
    });

    const response = await service.queryPolls({ bounds: VIEW_BOUNDS });
    expect((response as { placeOptions: unknown }).placeOptions).toEqual([
      { placeId: NEIGHBORHOOD, name: 'Old Town', pollCount: 2 },
      { placeId: TOWN, name: 'Round Rock', pollCount: 1 },
    ]);
  });

  it('placeFilterId slices the feed to the DAG SUBTREE: a poll in a CHILD place appears when filtering by the parent; a SIBLING place is excluded — while placeOptions stays unfiltered', async () => {
    const now = Date.now();
    const SIBLING = '88888888-8888-8888-8888-888888888888';
    const table: FakePollRow[] = [
      {
        poll_id: pollId(1),
        place_id: TOWN, // the filter place itself
        market_key: null,
        created_at: new Date(now - 1000),
      },
      {
        poll_id: pollId(2),
        place_id: NEIGHBORHOOD, // CHILD of TOWN (subtree member)
        market_key: null,
        created_at: new Date(now - 2000),
      },
      {
        poll_id: pollId(3),
        place_id: SIBLING, // in the viewport membership, NOT in the subtree
        market_key: null,
        created_at: new Date(now - 3000),
      },
    ];
    const { service } = createHarness({
      pollTable: table,
      placesInView: [
        TOWN_IN_VIEW,
        {
          placeId: SIBLING,
          name: 'Pflugerville',
          coverageOfView: 0.15,
          placeArea: 0.8,
        },
      ],
      descendants: [NEIGHBORHOOD],
    });

    // RED-provable both ways: unfiltered feed carries the sibling…
    const unfiltered = await service.queryPolls({ bounds: VIEW_BOUNDS });
    expect(
      (unfiltered.polls as Array<{ pollId: string }>).map((p) => p.pollId),
    ).toEqual([pollId(1), pollId(2), pollId(3)]);

    // …the parent-filtered feed keeps self + child and drops the sibling.
    const filtered = await service.queryPolls({
      bounds: VIEW_BOUNDS,
      placeFilterId: TOWN,
    });
    expect(
      (filtered.polls as Array<{ pollId: string }>).map((p) => p.pollId),
    ).toEqual([pollId(1), pollId(2)]);

    // The selector options are computed over the UNFILTERED membership, so
    // the sibling never vanishes from its own selector.
    expect(
      (
        filtered as { placeOptions: Array<{ placeId: string }> }
      ).placeOptions.map((option) => option.placeId),
    ).toEqual(expect.arrayContaining([TOWN, NEIGHBORHOOD, SIBLING]));
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
