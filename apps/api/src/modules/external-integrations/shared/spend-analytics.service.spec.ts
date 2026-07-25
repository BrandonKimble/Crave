import { SpendAnalyticsService } from './spend-analytics.service';
import { geminiCostMicros } from './gemini-pricing';

/**
 * §24.2 Leg A: the unit-cost derivation must PROVE per-document math for the
 * gemini work class from fixture ledger rows, and PROVE the
 * 'unattributed.<service>' catch-all appears for unjoinable spend (§24.2 —
 * "spend never vanishes"). Both are exercised against the real
 * geminiCostMicros K4 table, not a re-implemented shadow calculation.
 */

const WINDOW_END = new Date('2026-07-24T03:40:00Z');
const MODEL = 'gemini-3.1-flash-lite-preview'; // {input:0.25,cached:0.025,output:1.5}/1M, batch = 50% off

function stubLogger() {
  return {
    setContext: jest.fn().mockReturnThis(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

/** Build a prisma double whose calls are answered in the exact sequence
 *  refreshUnitCosts issues them: (1) refreshGeminiPerDocument's joined
 *  $queryRaw, (2) unattributedGeminiMicros's apiUsageEvent.findMany,
 *  (3) tomtom refreshUnattributed's aggregate, (4) google_places
 *  refreshUnattributed's aggregate, (5) attributeLaneCosts's $queryRaw. */
function buildPrisma(params: {
  joinedRows: unknown[];
  unattributedGeminiEvents: unknown[];
  tomtomAgg: {
    _sum: { requestCount: number | null };
    _count: { _all: number };
  };
  placesAgg: {
    _sum: { requestCount: number | null };
    _count: { _all: number };
  };
  laneJoinRows: unknown[];
}) {
  const queryRawCalls = [params.joinedRows, params.laneJoinRows];
  let queryRawIndex = 0;
  const aggregateCalls = [params.tomtomAgg, params.placesAgg];
  let aggregateIndex = 0;
  const upsert = jest.fn().mockResolvedValue(undefined);
  return {
    $queryRaw: jest.fn().mockImplementation(() => {
      const value = queryRawCalls[queryRawIndex];
      queryRawIndex += 1;
      return Promise.resolve(value);
    }),
    apiUsageEvent: {
      findMany: jest.fn().mockResolvedValue(params.unattributedGeminiEvents),
      aggregate: jest.fn().mockImplementation(() => {
        const value = aggregateCalls[aggregateIndex];
        aggregateIndex += 1;
        return Promise.resolve(value);
      }),
    },
    spendUnitCost: { upsert, findMany: jest.fn().mockResolvedValue([]) },
  };
}

function emptyAgg() {
  return { _sum: { requestCount: null }, _count: { _all: 0 } };
}

describe('SpendAnalyticsService.refreshUnitCosts (§24.2 Leg A)', () => {
  it('derives micro-USD-per-document for gemini from real token math, and folds a thin/unjoined batch cost plus interactive spend into unattributed.gemini', async () => {
    // 150 documents (>= the MIN_SAMPLE_UNITS floor) joined to one batch row.
    const joinedRow = {
      input_tokens: 10_000_000n,
      output_tokens: 2_000_000n,
      cached_tokens: 0n,
      model: MODEL,
      mode: 'batch',
      doc_count: 150n,
    };
    const expectedBatchCostMicros = geminiCostMicros({
      model: MODEL,
      mode: 'batch',
      inputTokens: 10_000_000,
      outputTokens: 2_000_000,
      cachedTokens: 0,
    });

    // An interactive relevance-gate event with no run_key join at all —
    // this is the unjoinable spend that must not vanish.
    const unattributedEvent = {
      inputTokens: 5_000,
      outputTokens: 500,
      cachedTokens: 0,
      model: 'gemini-3.1-flash-lite-preview',
      mode: 'interactive',
    };
    const expectedUnattributedCostMicros = geminiCostMicros({
      model: unattributedEvent.model,
      mode: 'interactive',
      inputTokens: unattributedEvent.inputTokens,
      outputTokens: unattributedEvent.outputTokens,
      cachedTokens: unattributedEvent.cachedTokens,
    });

    const prisma = buildPrisma({
      joinedRows: [joinedRow],
      unattributedGeminiEvents: [unattributedEvent],
      tomtomAgg: emptyAgg(),
      placesAgg: emptyAgg(),
      laneJoinRows: [],
    });
    const logger = stubLogger();
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      logger as never,
      registry as never,
    );

    const rows = await service.refreshUnitCosts(WINDOW_END);

    const docRow = rows.find((r) => r.workClass === 'gemini.reddit_extraction');
    expect(docRow).toBeDefined();
    expect(docRow!.unit).toBe('document');
    expect(docRow!.sampleUnits).toBe(150);
    expect(docRow!.microUsdPerUnit).toBeCloseTo(expectedBatchCostMicros / 150);

    const unattributedRow = rows.find(
      (r) => r.workClass === 'unattributed.gemini',
    );
    expect(unattributedRow).toBeDefined();
    // Only the interactive event is unjoined here — the batch row met the
    // sample floor and got its own priced row above.
    expect(unattributedRow!.sampleUnits).toBe(1);
    expect(unattributedRow!.microUsdPerUnit).toBeCloseTo(
      expectedUnattributedCostMicros,
    );

    // No fabricated $-per-call rate for vendors with no price table.
    expect(
      rows.find((r) => r.workClass === 'unattributed.tomtom'),
    ).toBeUndefined();
    expect(
      rows.find((r) => r.workClass === 'unattributed.google_places'),
    ).toBeUndefined();
  });

  it('a thin sample (below MIN_SAMPLE_UNITS) never publishes a per-document rate — its cost folds into unattributed.gemini instead', async () => {
    const thinRow = {
      input_tokens: 100_000n,
      output_tokens: 20_000n,
      cached_tokens: 0n,
      model: MODEL,
      mode: 'batch',
      doc_count: 5n, // far under the 100-unit floor
    };
    const prisma = buildPrisma({
      joinedRows: [thinRow],
      unattributedGeminiEvents: [],
      tomtomAgg: emptyAgg(),
      placesAgg: emptyAgg(),
      laneJoinRows: [],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
    );

    const rows = await service.refreshUnitCosts(WINDOW_END);

    expect(
      rows.find((r) => r.workClass === 'gemini.reddit_extraction'),
    ).toBeUndefined();
    const unattributedRow = rows.find(
      (r) => r.workClass === 'unattributed.gemini',
    );
    expect(unattributedRow).toBeDefined();
    expect(unattributedRow!.microUsdPerUnit).toBeGreaterThan(0);
  });

  it('surfaces request-counted (unpriced) rows for vendors with ledger activity but no $-rate table', async () => {
    const prisma = buildPrisma({
      joinedRows: [],
      unattributedGeminiEvents: [],
      tomtomAgg: { _sum: { requestCount: 12 }, _count: { _all: 4 } },
      placesAgg: emptyAgg(),
      laneJoinRows: [],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
    );

    const rows = await service.refreshUnitCosts(WINDOW_END);
    const tomtomRow = rows.find((r) => r.workClass === 'unattributed.tomtom');
    expect(tomtomRow).toBeDefined();
    expect(tomtomRow!.sampleUnits).toBe(12);
    expect(tomtomRow!.microUsdPerUnit).toBe(0);
  });

  it('feeds joined per-source lane spend into CollectorSourceRegistryService.recordLaneCost (Leg B wiring)', async () => {
    const laneJoinRow = {
      source_id: 'src-1',
      input_tokens: 1_000_000n,
      output_tokens: 200_000n,
      cached_tokens: 0n,
      model: MODEL,
      mode: 'batch',
    };
    const prisma = buildPrisma({
      joinedRows: [],
      unattributedGeminiEvents: [],
      tomtomAgg: emptyAgg(),
      placesAgg: emptyAgg(),
      laneJoinRows: [laneJoinRow],
    });
    const registry = { recordLaneCost: jest.fn().mockResolvedValue(undefined) };
    const service = new SpendAnalyticsService(
      prisma as never,
      stubLogger() as never,
      registry as never,
    );

    await service.refreshUnitCosts(WINDOW_END);

    expect(registry.recordLaneCost).toHaveBeenCalledTimes(1);
    const [sourceId, lane, costMicros] = registry.recordLaneCost.mock
      .calls[0] as [string, string, number];
    expect(sourceId).toBe('src-1');
    expect(lane).toBe('keyword');
    expect(costMicros).toBeGreaterThan(0);
  });
});
