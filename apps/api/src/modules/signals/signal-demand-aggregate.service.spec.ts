import 'reflect-metadata';
import { SignalDemandAggregateService } from './signal-demand-aggregate.service';

/**
 * §22 item 6 aggregate specs: the rebuild unit is a whole UTC day
 * (delete-and-reinsert from the ledger), so INCREMENTAL maintenance and a
 * FROM-SCRATCH rebuild are the same operation applied to different day sets —
 * the equivalence and idempotency laws are proven here at the statement
 * level (identical SQL per day), and the wrap-aware attribution predicate is
 * the canonical lngIntervalsIntersect (proven in the polls kernel spec; the
 * SQL restates it verbatim — asserted structurally below).
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

function createHarness(options: { minOccurredAt?: Date | null } = {}) {
  const statements: CapturedStatement[] = [];
  const capture =
    () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push({ text: strings.join('¤'), values });
      return Promise.resolve(0);
    };
  const tx = { $executeRaw: jest.fn(capture()) };
  const prisma = {
    $transaction: jest.fn((fn: (client: typeof tx) => Promise<unknown>) =>
      fn(tx),
    ),
    $queryRaw: jest.fn(() =>
      Promise.resolve([{ min_occurred: options.minOccurredAt ?? null }]),
    ),
  };
  const service = new SignalDemandAggregateService(
    prisma as never,
    createLogger() as never,
  );
  return { service, prisma, tx, statements };
}

function flatten(statement: CapturedStatement): string {
  // Nested Prisma.sql fragments arrive as values; fold their text in so the
  // full statement is assertable.
  const parts = [statement.text];
  for (const value of statement.values) {
    if (value && typeof value === 'object' && 'strings' in value) {
      parts.push(((value as { strings: string[] }).strings ?? []).join('¤'));
    }
  }
  return parts.join('¤');
}

describe('SignalDemandAggregateService — the §3 day-slice rebuild', () => {
  it('rebuildDay = advisory lock + whole-day DELETE + single re-derive INSERT (global tile ∪ place tiles)', async () => {
    const { service, statements } = createHarness();
    await service.rebuildDay(new Date('2026-07-19T13:45:00Z'));

    expect(statements).toHaveLength(3);
    const [lock, del, insert] = statements.map(flatten);
    expect(lock).toContain('pg_advisory_xact_lock');
    expect(del).toContain('DELETE FROM signal_demand_daily WHERE day =');
    expect(insert).toContain('INSERT INTO signal_demand_daily');
    // The two tilings of the same day slice, in one statement.
    expect(insert).toContain('UNION ALL');
    expect(insert).toContain('NULL, d.actor_id'); // global tile (place NULL)
    expect(insert).toContain('JOIN places p'); // place tiles
    // Wrap-aware longitude intersection: the canonical 4-case predicate
    // (both-cross ⇒ TRUE arm; one-cross ⇒ OR-split arms).
    expect(insert).toContain('THEN TRUE');
    expect(insert).toContain(
      'd.geo_min_lng <= p.bbox_max_lng OR d.geo_max_lng >= p.bbox_min_lng',
    );
    expect(insert).toContain(
      'p.bbox_min_lng <= d.geo_max_lng OR p.bbox_max_lng >= d.geo_min_lng',
    );
    // §3 judge-at-read dedupe folded into the day slice.
    expect(insert).toContain("s.meta->>'searchRequestId'");
    expect(insert).toContain("s.meta->>'cacheRevealRequestId'");

    // Day bounds: [day, day+1) — the DELETE and the INSERT govern the SAME
    // whole UTC day.
    expect(del.includes('day =')).toBe(true);
    const delDay = statements[1].values.find((v) => v === '2026-07-19');
    expect(delDay).toBe('2026-07-19');
    expect(statements[2].values).toContain('2026-07-19');
    expect(statements[2].values).toContain('2026-07-20');
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

  it('the cron refresh rebuilds today + yesterday only, and the kill switch stops it', async () => {
    const { service, statements } = createHarness();
    await service.refreshRecentDays();
    const dayScalars = statements
      .flatMap((s) => s.values)
      .filter(
        (v): v is string =>
          typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v),
      );
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(dayScalars).toContain(today);
    expect(dayScalars).toContain(yesterday);
    // Exactly two day-slices rebuilt (3 statements each).
    expect(statements).toHaveLength(6);

    statements.splice(0);
    process.env.SIGNAL_DEMAND_AGGREGATE_REFRESH_ENABLED = 'false';
    try {
      await service.refreshRecentDays();
      expect(statements).toHaveLength(0);
    } finally {
      delete process.env.SIGNAL_DEMAND_AGGREGATE_REFRESH_ENABLED;
    }
  });
});
