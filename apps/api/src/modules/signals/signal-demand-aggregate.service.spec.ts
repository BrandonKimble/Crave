import 'reflect-metadata';
import { SignalDemandAggregateService } from './signal-demand-aggregate.service';

/**
 * §22 item 6 aggregate specs — the red-teamed rebuild laws:
 * - 1a: every day rebuild runs under SET LOCAL TIME ZONE 'UTC' (naive-UTC
 *   occurred_at → timestamptz last_occurred_at coerces AS UTC, DST-free).
 * - 1b: the cron is WATERMARK-driven — it rebuilds exactly the days that
 *   have ledger rows recorded since the last pass (closed days included),
 *   then advances the watermark monotonically.
 * - 1c: retry dedupe is window-wide and geo-free — first occurrence of a
 *   request-id wins (in-day window function + prior-day anti-join).
 * - 3a/3b: place attribution is §3 containment-TILING (smallest containing
 *   place + coarsest contained tiling via envelope operators on the places
 *   GiST index), never bbox intersection.
 * The rebuild unit stays a whole UTC day (delete-and-reinsert), so
 * incremental maintenance and a from-scratch rebuild are the same operation
 * applied to different day sets — proven at the statement level.
 */

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

interface CapturedStatement {
  text: string;
  values: unknown[];
}

function createHarness(
  options: {
    minOccurredAt?: Date | null;
    watermark?: Date | null;
    rebuildDays?: string[];
  } = {},
) {
  const statements: CapturedStatement[] = [];
  const queries: CapturedStatement[] = [];
  const capture =
    (sink: CapturedStatement[]) =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      sink.push({ text: strings.join('¤'), values });
      return Promise.resolve(0);
    };
  const tx = { $executeRaw: jest.fn(capture(statements)) };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    $executeRaw: jest.fn(capture(statements)),
    $queryRaw: jest.fn(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        queries.push({ text: strings.join('¤'), values });
        const text = strings.join(' ');
        if (text.includes('signal_demand_rebuild_state')) {
          return Promise.resolve([
            {
              watermark: options.watermark ?? null,
              next_watermark: new Date('2026-07-19T12:00:00Z'),
            },
          ]);
        }
        if (text.includes('DISTINCT (s.occurred_at::date)')) {
          return Promise.resolve(
            (options.rebuildDays ?? []).map((day) => ({ day })),
          );
        }
        return Promise.resolve([
          { min_occurred: options.minOccurredAt ?? null },
        ]);
      },
    ),
  };
  const service = new SignalDemandAggregateService(
    prisma as never,
    createLogger() as never,
  );
  return { service, prisma, tx, statements, queries };
}

function flatten(statement: CapturedStatement): string {
  // Nested Prisma.sql fragments arrive as values; fold their text in so the
  // full statement is assertable.
  const parts = [statement.text];
  const walk = (value: unknown) => {
    if (value && typeof value === 'object' && 'strings' in value) {
      const fragment = value as { strings: string[]; values?: unknown[] };
      parts.push((fragment.strings ?? []).join('¤'));
      (fragment.values ?? []).forEach(walk);
    }
  };
  statement.values.forEach(walk);
  return parts.join('¤');
}

describe('SignalDemandAggregateService — the §3 day-slice rebuild', () => {
  it('rebuildDay = UTC session + advisory lock + whole-day DELETE + single re-derive INSERT (global tile ∪ containment tiling)', async () => {
    const { service, statements } = createHarness();
    await service.rebuildDay(new Date('2026-07-19T13:45:00Z'));

    expect(statements).toHaveLength(4);
    const [utc, lock, del, insert] = statements.map(flatten);
    // Red-team 1a: the coercion law.
    expect(utc).toContain("SET LOCAL TIME ZONE 'UTC'");
    expect(lock).toContain('pg_advisory_xact_lock');
    expect(del).toContain('DELETE FROM signal_demand_daily WHERE day =');
    expect(insert).toContain('INSERT INTO signal_demand_daily');
    // The two tilings of the same day slice, in one statement.
    expect(insert).toContain('UNION ALL');
    expect(insert).toContain('NULL, d.actor_id'); // global tile (place NULL)
    // Red-team 3a: containment-tiling storage — envelope containment
    // operators (GiST-indexed), smallest-containing pick, coarsest tiling —
    // and NO bbox-intersection join.
    expect(insert).toContain('ST_MakeEnvelope');
    expect(insert).toMatch(/~\s*¤?\s*ST_MakeEnvelope/); // place CONTAINS geo
    expect(insert).toMatch(/@\s*¤?\s*ST_MakeEnvelope/); // place CONTAINED in geo
    // §2.5(c) polygon-first (C1/C5 cut): where real ground exists it JUDGES —
    // the containing pick requires ST_Covers(ground, geo) and ranks
    // polygon-covered candidates (by real ground area) BEFORE geometry-null
    // bbox candidates (by bbox area); bbox containment survives only for
    // geometry-null rows.
    expect(insert).toContain('ST_Covers(pg.geometry,');
    expect(insert).toContain('pg.geometry IS NULL');
    expect(insert).toContain('(pg.geometry IS NOT NULL) DESC');
    expect(insert).toContain('ST_Area(pg.geometry)');
    expect(insert).toContain('ELSE x.area END ASC');
    expect(insert).toContain('x.place_id ASC'); // deterministic pick anchor
    // Tiling direction: ground-⊆-geo through the geometry GiST index; the
    // bbox arms are fenced to geometry-null places, and parent domination
    // speaks the same law (parent ground judges when present).
    expect(insert).toContain('ST_CoveredBy(pg.geometry,');
    expect(insert).toContain('ST_CoveredBy(ppg.geometry,');
    expect(insert).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM place_geometries pg/);
    // Coarsest tiling: parent-domination via per-row PK probe (never a
    // contained×contained self-join — the proven O(N²) planner trap).
    expect(insert).toContain('unnest(c.parent_place_ids)');
    expect(insert).toContain('pp.place_id = parent.place_id');
    expect(insert).not.toContain('d.geo_min_lat <= p.bbox_max_lat'); // no intersection join
    // Wrap-awareness: crossing geos split into two segments.
    expect(insert).toContain('geo_min_lng > geo_max_lng');
    expect(insert).toContain('180::numeric');
    // Red-team 1c: window-wide, geo-free retry dedupe — first occurrence
    // wins in-day, prior days excluded by anti-join.
    expect(insert).toContain("s.meta->>'searchRequestId'");
    expect(insert).toContain("s.meta->>'cacheRevealRequestId'");
    expect(insert).toContain('ROW_NUMBER() OVER');
    expect(insert).toContain('NOT EXISTS');
    expect(insert).toContain('p.occurred_at <');
    // Wave-5 F1: the act's identity is (kind, request-id) — search and
    // autocomplete_selection share meta.searchRequestId by design (one
    // submit = two acts), so BOTH the in-day window partition and the
    // cross-day anti-join must be kind-aware or one kind of every selected
    // search silently vanishes from the aggregate.
    expect(insert).toContain('PARTITION BY s.kind,');
    expect(insert).toContain('AND p.kind = d.kind');

    // Day bounds: [day, day+1) — the DELETE and the INSERT govern the SAME
    // whole UTC day.
    const delDay = statements[2].values.find((v) => v === '2026-07-19');
    expect(delDay).toBe('2026-07-19');
    expect(statements[3].values).toContain('2026-07-19');
    expect(statements[3].values).toContain('2026-07-20');
  });

  it('rebuild is idempotent by construction: re-running a day issues byte-identical statements', async () => {
    const { service, statements } = createHarness();
    await service.rebuildDay(new Date('2026-07-19T00:00:00Z'));
    const firstRun = statements.splice(0).map((s) => ({
      text: flatten(s),
      scalars: s.values.filter((v) => typeof v !== 'object'),
    }));
    await service.rebuildDay(new Date('2026-07-19T23:59:59Z'));
    const secondRun = statements.splice(0).map((s) => ({
      text: flatten(s),
      scalars: s.values.filter((v) => typeof v !== 'object'),
    }));
    expect(secondRun).toEqual(firstRun);
  });

  it('incremental == from-scratch: rebuildRange emits exactly the per-day statements of rebuildDay for every day', async () => {
    const range = createHarness();
    await range.service.rebuildRange({
      startDay: new Date('2026-07-17T00:00:00Z'),
      endDayExclusive: new Date('2026-07-20T00:00:00Z'),
    });
    const rangeStatements = range.statements.map(flatten);

    const daily = createHarness();
    for (const day of ['2026-07-17', '2026-07-18', '2026-07-19']) {
      await daily.service.rebuildDay(new Date(`${day}T00:00:00Z`));
    }
    const dailyStatements = daily.statements.map(flatten);

    expect(rangeStatements).toEqual(dailyStatements);
    expect(
      range.statements
        .flatMap((s) => s.values)
        .filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)),
    ).toEqual(
      daily.statements
        .flatMap((s) => s.values)
        .filter((v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)),
    );
  });

  it('rebuildAll derives its range from the ledger and is a no-op on an empty ledger', async () => {
    const empty = createHarness({ minOccurredAt: null });
    await expect(empty.service.rebuildAll()).resolves.toBeNull();
    expect(empty.statements).toHaveLength(0);

    const seeded = createHarness({
      minOccurredAt: new Date('2026-07-10T05:00:00Z'),
    });
    const result = await seeded.service.rebuildAll();
    expect(result?.startDay).toBe('2026-07-10');
    // endDayExclusive = tomorrow (today's slice is included).
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(result?.endDayExclusive).toBe(tomorrow);
  });

  it('mid-window mint/now-invariance golden (wave-5 §17b): rebuilds at two different "now"s yield byte-identical non-today slices', async () => {
    // §3's mint-invariance law at the statement level: a day slice's rebuild
    // is a pure function of (day, ledger) — the wall clock NEVER enters a
    // day's statements. Rebuilding the same window at two different "now"s
    // (e.g. before and after a mid-window neighborhood mint re-triggers the
    // watermark pass) must emit identical SQL for every completed day; only
    // WHICH days rebuild may differ (today's slice appears when now moves).
    const minOccurredAt = new Date('2026-07-10T05:00:00Z');
    const nowSpy = jest.spyOn(Date, 'now');
    try {
      nowSpy.mockReturnValue(new Date('2026-07-19T08:00:00Z').getTime());
      const early = createHarness({ minOccurredAt });
      await early.service.rebuildAll();
      const earlyStatements = early.statements.map(flatten);

      nowSpy.mockReturnValue(new Date('2026-07-19T23:59:00Z').getTime());
      const late = createHarness({ minOccurredAt });
      await late.service.rebuildAll();
      const lateStatements = late.statements.map(flatten);

      // Same day within the window: the two rebuilds are byte-identical.
      expect(lateStatements).toEqual(earlyStatements);

      // Now crosses midnight: every shared (non-today) day slice is STILL
      // byte-identical; the only delta is the new day's own slice.
      nowSpy.mockReturnValue(new Date('2026-07-20T00:05:00Z').getTime());
      const nextDay = createHarness({ minOccurredAt });
      await nextDay.service.rebuildAll();
      const nextDayStatements = nextDay.statements.map(flatten);
      expect(nextDayStatements.slice(0, earlyStatements.length)).toEqual(
        earlyStatements,
      );
      // Exactly one extra day slice (4 statements per day).
      expect(nextDayStatements.length - earlyStatements.length).toBe(4);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('the watermark refresh rebuilds EXACTLY the days with newly-recorded rows — closed days included (1b)', async () => {
    // A late write into a long-closed day (2026-06-05) plus a fresh one:
    // both days rebuild; nothing else does.
    const { service, statements, queries } = createHarness({
      watermark: new Date('2026-07-19T10:00:00Z'),
      rebuildDays: ['2026-06-05', '2026-07-19'],
    });
    await service.refreshFromWatermark();

    // The day scan filters on recorded_at > watermark.
    const dayScan = queries.find((q) =>
      q.text.includes('DISTINCT (s.occurred_at::date)'),
    );
    expect(dayScan).toBeDefined();
    expect(flatten(dayScan!)).toContain('s.recorded_at >');

    const dayScalars = statements
      .flatMap((s) => s.values)
      .filter(
        (v): v is string =>
          typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v),
      );
    expect(dayScalars).toContain('2026-06-05');
    expect(dayScalars).toContain('2026-07-19');
    // Two day-slices (4 statements each) + the watermark upsert.
    expect(statements).toHaveLength(9);
    const upsert = flatten(statements[statements.length - 1]);
    expect(upsert).toContain('signal_demand_rebuild_state');
    expect(upsert).toContain('GREATEST'); // monotone watermark
  });

  it('a NULL watermark (first pass) scans the whole ledger; no new rows means no day rebuilds but the watermark still advances', async () => {
    const first = createHarness({ watermark: null, rebuildDays: [] });
    await first.service.refreshFromWatermark();
    const dayScan = first.queries.find((q) =>
      q.text.includes('DISTINCT (s.occurred_at::date)'),
    );
    expect(flatten(dayScan!)).not.toContain('s.recorded_at >');
    // No day rebuilds — only the watermark upsert.
    expect(first.statements).toHaveLength(1);
    expect(flatten(first.statements[0])).toContain(
      'signal_demand_rebuild_state',
    );
  });

  it('the kill switch stops the watermark refresh', async () => {
    const { service, statements, queries } = createHarness({
      rebuildDays: ['2026-07-19'],
    });
    process.env.SIGNAL_DEMAND_AGGREGATE_REFRESH_ENABLED = 'false';
    try {
      await service.refreshFromWatermark();
      expect(statements).toHaveLength(0);
      expect(queries).toHaveLength(0);
    } finally {
      delete process.env.SIGNAL_DEMAND_AGGREGATE_REFRESH_ENABLED;
    }
  });
});
