import {
  COLLAPSE_DROP_FRACTION,
  SOURCE_TABLES,
  SourceTableCollapseAlarmService,
} from './source-table-collapse-alarm.service';

/**
 * THE SOURCE-TABLE ROW-COLLAPSE ALARM, both directions (08-16 incident).
 *
 * RED cases: a wipe to zero and a >20% single-step drop must raise the
 * critical deduped alert naming the table. GREEN cases: first sight seeds a
 * baseline silently, growth ratchets silently, and churn inside the margin
 * never alarms — an alarm that cries on ordinary nights is an alarm people
 * route around. The registry mutation disarms the threshold comparison and
 * requires the RED cases here to fail.
 */

const logger = {
  setContext: () => logger,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
} as never;

function build(opts: {
  counts: Partial<Record<string, number>>;
  snapshots: Partial<Record<string, number>>;
}) {
  const emitted: unknown[] = [];
  const writes: Array<{ op: string; table: string; count: bigint }> = [];
  const prisma = {
    $queryRawUnsafe: jest.fn((sql: string) => {
      const table = SOURCE_TABLES.find((t) => sql.includes(`FROM ${t}`));
      return Promise.resolve([{ n: BigInt(opts.counts[table ?? ''] ?? 0) }]);
    }),
    sourceTableHighWater: {
      findUnique: jest.fn(({ where }: { where: { tableName: string } }) => {
        const highWater = opts.snapshots[where.tableName];
        return Promise.resolve(
          highWater === undefined
            ? null
            : { tableName: where.tableName, highWaterCount: BigInt(highWater) },
        );
      }),
      create: jest.fn(
        ({ data }: { data: { tableName: string; highWaterCount: bigint } }) => {
          writes.push({
            op: 'create',
            table: data.tableName,
            count: data.highWaterCount,
          });
          return Promise.resolve(data);
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { tableName: string };
          data: { highWaterCount: bigint };
        }) => {
          writes.push({
            op: 'update',
            table: where.tableName,
            count: data.highWaterCount,
          });
          return Promise.resolve(data);
        },
      ),
    },
  };
  const opsAlerts = {
    emit: jest.fn((alert: unknown) => emitted.push(alert)),
  };
  const service = new SourceTableCollapseAlarmService(
    prisma as never,
    opsAlerts as never,
    logger,
  );
  return { service, emitted, writes, opsAlerts };
}

/** Same steady state for every table except the overrides. */
function steady(count: number): Record<string, number> {
  return Object.fromEntries(SOURCE_TABLES.map((t) => [t, count]));
}

describe('source-table row-collapse alarm', () => {
  it('a wipe to ZERO raises a critical deduped alert naming the table (the 08-16 shape)', async () => {
    const { service, emitted } = build({
      counts: { ...steady(10_000), core_entities: 0 },
      snapshots: steady(10_000),
    });
    const verdicts = await service.runCensus('boot');
    expect(verdicts.find((v) => v.table === 'core_entities')?.outcome).toBe(
      'collapsed',
    );
    const alert = emitted.find(
      (a) =>
        (a as { dedupeKey: string }).dedupeKey ===
        'source-table-collapse:core_entities',
    ) as { severity: string; title: string } | undefined;
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('critical');
    expect(alert?.title).toContain('core_entities');
  });

  it('a single-step drop beyond the fraction alarms; the other tables stay silent', async () => {
    // 10,000 -> 7,900 is a 21% drop — just past the stated threshold.
    const { service, emitted } = build({
      counts: { ...steady(10_000), core_restaurant_events: 7_900 },
      snapshots: steady(10_000),
    });
    const verdicts = await service.runCensus('nightly');
    expect(
      verdicts.find((v) => v.table === 'core_restaurant_events')?.outcome,
    ).toBe('collapsed');
    expect(emitted).toHaveLength(1);
  });

  it('churn INSIDE the margin never alarms — ordinary nights stay quiet', async () => {
    // 10,000 -> 8,100 is a 19% drop — inside the generous margin.
    const { service, emitted } = build({
      counts: { ...steady(10_000), entity_surface: 8_100 },
      snapshots: steady(10_000),
    });
    const verdicts = await service.runCensus('nightly');
    expect(verdicts.every((v) => v.outcome === 'steady')).toBe(true);
    expect(emitted).toHaveLength(0);
  });

  it('growth RATCHETS the high water silently', async () => {
    const { service, emitted, writes } = build({
      counts: steady(12_000),
      snapshots: steady(10_000),
    });
    const verdicts = await service.runCensus('nightly');
    expect(verdicts.every((v) => v.outcome === 'ratcheted')).toBe(true);
    expect(emitted).toHaveLength(0);
    expect(writes.every((w) => w.op === 'update' && w.count === 12_000n)).toBe(
      true,
    );
  });

  it('first observation seeds the baseline and never alarms — no history, no comparison', async () => {
    const { service, emitted, writes } = build({
      counts: steady(5_000),
      snapshots: {},
    });
    const verdicts = await service.runCensus('boot');
    expect(verdicts.every((v) => v.outcome === 'baseline-seeded')).toBe(true);
    expect(emitted).toHaveLength(0);
    expect(writes.every((w) => w.op === 'create')).toBe(true);
  });

  it('the threshold constant is the stated one — the alert prose derives from it', () => {
    expect(COLLAPSE_DROP_FRACTION).toBe(0.2);
  });
});
