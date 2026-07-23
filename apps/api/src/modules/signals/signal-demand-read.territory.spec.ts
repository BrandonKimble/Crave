import 'reflect-metadata';
import { SignalDemandReadService } from './signal-demand-read.service';
import {
  DEMAND_HALF_LIFE_DAYS,
  RECENCY_FLAT_DAYS,
} from '../polls/supply/poll-supply.constants';

/**
 * §22 item 7 demand-input parity specs: the collector's demand read moved
 * from user_search_demand_daily onto the signals substrate. Parity is
 * asserted structurally over the emitted SQL: same load-bearing features as
 * the old read (per-actor log2 saturation, recency kernel, redirect
 * resolution, window scoping) with territory PLACE scoping replacing market
 * keys — and ZERO reads of the dying tables.
 */

const PLACE_A = '11111111-1111-1111-1111-111111111111';
const PLACE_B = '22222222-2222-2222-2222-222222222222';
const ENTITY = '33333333-3333-3333-3333-333333333333';

interface CapturedQuery {
  text: string;
  values: unknown[];
}

/** Fold nested Prisma.sql fragment text into the statement (fragments ride
 *  in as template VALUES at the mocked $queryRaw boundary). */
function flattenFragments(query: CapturedQuery): string {
  const parts = [query.text];
  const walk = (value: unknown) => {
    if (value && typeof value === 'object' && 'strings' in value) {
      const fragment = value as { strings: string[]; values?: unknown[] };
      parts.push((fragment.strings ?? []).join('¤'));
      (fragment.values ?? []).forEach(walk);
    }
  };
  query.values.forEach(walk);
  return parts.join('¤');
}

function createHarness(rows: unknown[] = []) {
  const queries: CapturedQuery[] = [];
  const prisma = {
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const text = strings.join('¤');
        queries.push({ text, values });
        // The containment-read place expansion (recursive lineage walk) runs
        // BEFORE the demand query; give it an empty lineage.
        if (text.includes('RECURSIVE lineage')) {
          return Promise.resolve([]);
        }
        return Promise.resolve(rows);
      },
    ),
    entityRedirect: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  const logger = {
    setContext: jest.fn().mockReturnThis(),
    debug: jest.fn(),
  };
  const service = new SignalDemandReadService(prisma as never, logger as never);
  return { service, prisma, queries };
}

describe('territoryEntityDemand (C3: demand reaches collection only through the ledger)', () => {
  it('reads ONLY the signals substrate — the dying demand tables are dead here', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A, PLACE_B],
      windowDays: 30,
      limit: 100,
      entityTypes: ['restaurant', 'food'],
    });
    const demandSql = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!.text;
    expect(demandSql).toContain('FROM signals');
    // NO query in the whole read touches a dying table or market keys.
    for (const query of h.queries) {
      expect(query.text).not.toContain('user_search_demand_daily');
      expect(query.text).not.toContain('search_events');
      expect(query.text).not.toContain('market_key');
    }
  });

  it('carries the ONE §4 demand kernel: per-actor log2 saturation over recency-weighted acts', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    const query = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!;
    // Per-actor saturation before actors sum (R6: no single act is loud).
    expect(query.text).toContain('SUM(LN(1 + acts) / LN(2))');
    // The K1 recency constants ride in through the kernel fragment's binds.
    const flattened = JSON.stringify(query.values, (_key, value: unknown) =>
      typeof value === 'bigint' ? Number(value) : value,
    );
    expect(flattened).toContain(`${RECENCY_FLAT_DAYS}`);
    expect(flattened).toContain(`${DEMAND_HALF_LIFE_DAYS}`);
  });

  it('MAX-dedupes acts per (actor, subject, day) across territory places (set semantics under intersection attribution)', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A, PLACE_B],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    const sql = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!.text;
    // A signal intersecting two territory places carries two aggregate rows;
    // MAX per (actor, subject, day) counts it once for the engine.
    expect(sql).toContain('MAX(a.signal_count)');
  });

  it('resolves identity through entity_redirects at read (the ledger is never rekeyed)', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    const demandSql = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!.text;
    expect(demandSql).toContain('entity_redirects');
    expect(demandSql).toContain('COALESCE(r.to_entity_id, a.subject_id)');
  });

  it('kinds are deliberately UNFILTERED (self-provisioning at the K2 uniform weight)', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    const demandSql = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!.text;
    expect(demandSql).not.toMatch(/a\.kind\s*=/);
  });

  it('the fresh TODAY arm is wrap-aware (wave-5 F4): the canonical crossing CASE, never a plain lng range test', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    const query = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!;
    const sql = flattenFragments(query);
    // A crossing-geo signal (min > max) reaches its place through the
    // canonical lng-intersect CASE (signals/lng-intersect.ts).
    expect(sql).toContain('s.geo_min_lng > s.geo_max_lng');
    expect(sql).toContain('THEN TRUE');
  });

  it('the fresh TODAY arm judges membership by the §2.5(c) containment law (C3 cut): polygon-first, geometry-null bbox fallback — the lng intersect is only the prefilter', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    const query = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!;
    const sql = flattenFragments(query);
    expect(sql).toContain('ST_Covers(pg.geometry,'); // place ground ⊇ geo
    expect(sql).toContain('ST_CoveredBy(pg.geometry,'); // geo ⊇ place ground
    expect(sql).toContain('place_geometries');
  });

  it('the fresh cross-day dedupe is KIND-aware (wave-5 F1): search and autocomplete_selection share a request-id but are distinct acts', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    const query = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!;
    expect(flattenFragments(query)).toContain('prior.kind = s.kind');
  });

  it('fresh-lane instants are coerced to naive UTC (wave-5, live-proven session-TZ skew)', async () => {
    const h = createHarness();
    await h.service.territoryEntityDemand({
      placeIds: [PLACE_A],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    const query = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!;
    // occurred_at is naive UTC; Dates bind as timestamptz — comparisons must
    // pass through AT TIME ZONE 'UTC' or the session TZ shifts "today".
    expect(flattenFragments(query)).toContain("AT TIME ZONE 'UTC'");
  });

  it('empty territory returns [] without querying', async () => {
    const h = createHarness();
    const result = await h.service.territoryEntityDemand({
      placeIds: [],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    expect(result).toEqual([]);
    expect(h.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('maps rows to the collector contract shape', async () => {
    const h = createHarness([
      {
        entity_id: ENTITY,
        entity_type: 'restaurant',
        entity_name: 'Franklin Barbecue',
        demand_score: 4.2,
        distinct_actors: BigInt(3),
        last_seen_at: new Date('2026-07-18T00:00:00Z'),
      },
    ]);
    const [row] = await h.service.territoryEntityDemand({
      placeIds: [PLACE_A],
      windowDays: 30,
      limit: 10,
      entityTypes: ['restaurant'],
    });
    expect(row).toEqual({
      entityId: ENTITY,
      entityType: 'restaurant',
      entityName: 'Franklin Barbecue',
      demandScore: 4.2,
      distinctActors: 3,
      lastSeenAt: new Date('2026-07-18T00:00:00Z'),
    });
  });
});

describe('territoryUnmetAsks (kind-filtered ask read)', () => {
  it('reads ask rows DIRECTLY (the ask IS the act here) with the wrap-aware lng intersect (wave-5 F4)', async () => {
    const h = createHarness();
    await h.service.territoryUnmetAsks({
      placeIds: [PLACE_A],
      since: new Date('2026-07-01T00:00:00Z'),
      limit: 10,
    });
    const query = h.queries.find((q) => q.text.includes('on_demand_ask'))!;
    const sql = flattenFragments(query);
    expect(sql).toContain('s.geo_min_lng > s.geo_max_lng');
    expect(sql).toContain('THEN TRUE');
    // The two ask sites of one search still collapse per (request, term).
    expect(sql).toContain('askSearchRequestId');
    // §2.5(c) containment membership (C3 cut) — same law as the demand arm.
    expect(sql).toContain('ST_Covers(pg.geometry,');
    expect(sql).toContain('ST_CoveredBy(pg.geometry,');
  });
});

describe('territory trend + global specialization reads', () => {
  it('trend reads two windows from the aggregate with the same territory MAX-dedupe', async () => {
    const h = createHarness();
    await h.service.territoryEntityTrend({
      placeIds: [PLACE_A],
      entityIds: [ENTITY],
      trendWindowDays: 7,
    });
    const sql = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!.text;
    expect(sql).toContain('MAX(a.signal_count)');
    expect(sql).toContain('FILTER');
  });

  it('global demand reads the GLOBAL tile (place_id IS NULL — every signal once)', async () => {
    const h = createHarness();
    await h.service.globalEntityDemand({
      entityIds: [ENTITY],
      windowDays: 30,
    });
    const sql = h.queries.find((q) =>
      q.text.includes('signal_demand_daily'),
    )!.text;
    expect(sql).toContain('a.place_id IS NULL');
  });
});
