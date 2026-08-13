/**
 * Gemini list pricing — §16 K4 VENDOR FACTS (fetched live from
 * ai.google.dev/gemini-api/docs/pricing, 2026-07-24). Used to meter the
 * gemini.monthlySpend governance pool from ACTUAL per-request token counts
 * at the usage-ledger chokepoint: the same declared-vs-actual philosophy as
 * every other pool, priced in the vendor's own currency (micro-USD — cents
 * are too coarse for per-request metering).
 *
 * Rates are text-modality per 1M tokens; audio is priced higher by the
 * vendor but no caller sends audio today (a model/modality this table
 * doesn't know meters at the highest-known flash rate rather than silently
 * free — unknown-spend must fail LOUD-ish, not disappear). Batch mode is a
 * flat 50% discount across models. Thinking tokens bill as output — callers
 * already sum them into outputTokens (cost-recon audit 2026-07-10).
 *
 * What changes this file: the vendor repricing, never tuning.
 */

interface ModelRates {
  /** USD per 1M uncached input tokens. */
  input: number;
  /** USD per 1M cached input tokens. */
  cachedInput: number;
  /** USD per 1M output tokens. */
  output: number;
  /** USD per 1M cached tokens held for one HOUR (context-cache storage).
   *  Storage is billed for as long as the cache lives, independently of
   *  whether anything reads it. */
  cacheStorage: number;
}

export const GEMINI_RATES: Record<string, ModelRates> = {
  'gemini-3-flash-preview': {
    input: 0.5,
    cachedInput: 0.05,
    output: 3.0,
    cacheStorage: 1.0,
  },
  'gemini-3.1-flash-lite-preview': {
    input: 0.25,
    cachedInput: 0.025,
    output: 1.5,
    cacheStorage: 1.0,
  },
  'gemini-3.1-flash-lite': {
    input: 0.25,
    cachedInput: 0.025,
    output: 1.5,
    cacheStorage: 1.0,
  },
  'gemini-3.5-flash': {
    input: 1.5,
    cachedInput: 0.15,
    output: 9.0,
    cacheStorage: 1.0,
  },
  'gemini-2.5-flash-lite': {
    input: 0.1,
    cachedInput: 0.01,
    output: 0.4,
    cacheStorage: 1.0,
  },
  'gemini-embedding-001': {
    input: 0.15,
    cachedInput: 0.15,
    output: 0,
    cacheStorage: 1.0,
  },
};

/** Unknown-model fallback: spend from a model this table hasn't met must
 *  OVER-meter, never vanish. That invariant is "the per-field max of the
 *  table", so it is DERIVED from the table rather than written as a literal
 *  a future editor must remember to bump when a pricier model lands. */
export const UNKNOWN_MODEL_RATES: ModelRates = (() => {
  const entries = Object.values(GEMINI_RATES);
  const maxOf = (field: keyof ModelRates): number =>
    entries.reduce((max, rates) => Math.max(max, rates[field]), 0);
  return {
    input: maxOf('input'),
    cachedInput: maxOf('cachedInput'),
    output: maxOf('output'),
    cacheStorage: maxOf('cacheStorage'),
  };
})();

const BATCH_DISCOUNT = 0.5;

export interface GeminiUsageTokens {
  model?: string;
  mode?: 'interactive' | 'batch';
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  /** Cache-storage rows: hours the cached tokens are held. When set, the
   *  cached tokens are priced as STORAGE (token-hours) instead of as a
   *  cached-read discount — they are different products. */
  durationHours?: number;
}

/** §24 red team finding 6 ("NaN spend must not vanish"): a finite-or-zero
 *  coercion for one token field. Without this, a NaN token count (a
 *  malformed vendor response, a bad upstream sum) propagates through the
 *  arithmetic below to a NaN cost — and `micros <= 0` guards elsewhere
 *  (usage-ledger's meterGeminiSpend, spend-campaign's recordSpend) treat
 *  NaN as falsy-ish and SILENTLY no-op the meter, spending real vendor
 *  dollars with zero record. Coercing to 0 here makes the failure LOUD
 *  instead: usage-ledger.meterGeminiSpend warns once per malformed event
 *  (the metering under-counts visibly rather than vanishing silently). */
function finiteOrZero(value: number | undefined): number {
  return Number.isFinite(value) ? (value as number) : 0;
}

/** Micro-USD (1e-6 USD) cost of one usage event, from actual token counts.
 *  inputTokens is the FULL prompt count (cached included) as the vendor
 *  reports it; cached tokens re-price the cached share, they don't add. */
export function geminiCostMicros(usage: GeminiUsageTokens): number {
  const rates = GEMINI_RATES[usage.model ?? ''] ?? UNKNOWN_MODEL_RATES;

  // CACHE STORAGE is a different product from a cached READ: it bills per
  // token-hour for as long as the cache lives, whether or not anything
  // reads it. Priced here so the spend governor — which meters exclusively
  // from ledger rows — can finally see it. Storage rows carry no input or
  // output tokens, so they never mix with generation pricing.
  const durationHours = Math.max(0, finiteOrZero(usage.durationHours));
  if (durationHours > 0) {
    const heldTokens = Math.max(0, finiteOrZero(usage.cachedTokens));
    const storageUsd =
      (heldTokens * durationHours * rates.cacheStorage) / 1_000_000;
    return Math.round(storageUsd * 1_000_000);
  }

  const cached = Math.max(0, finiteOrZero(usage.cachedTokens));
  const uncachedIn = Math.max(0, finiteOrZero(usage.inputTokens) - cached);
  const out = Math.max(0, finiteOrZero(usage.outputTokens));
  const usd =
    (uncachedIn * rates.input +
      cached * rates.cachedInput +
      out * rates.output) /
    1_000_000;
  const discounted = usage.mode === 'batch' ? usd * BATCH_DISCOUNT : usd;
  return Math.round(discounted * 1_000_000);
}

/** One priced ledger row: the shared row→micros mapping for every
 *  findMany/queryRaw → loop → geminiCostMicros summation site (ops-summary,
 *  spend-analytics). Accepts both the prisma camelCase select shape and the
 *  raw-SQL snake_case shape (whose counts may arrive as bigint). */
export function pricedGeminiRow(row: {
  model?: string | null;
  mode?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedTokens?: number | null;
  input_tokens?: number | bigint | null;
  output_tokens?: number | bigint | null;
  cached_tokens?: number | bigint | null;
  durationHours?: number | null;
  duration_hours?: number | null;
}): number {
  const num = (
    camel: number | null | undefined,
    snake: number | bigint | null | undefined,
  ): number => (camel != null ? camel : snake != null ? Number(snake) : 0);
  return geminiCostMicros({
    model: row.model ?? undefined,
    mode: (row.mode as 'interactive' | 'batch' | undefined) ?? undefined,
    durationHours: num(row.durationHours, row.duration_hours),
    inputTokens: num(row.inputTokens, row.input_tokens),
    outputTokens: num(row.outputTokens, row.output_tokens),
    cachedTokens: num(row.cachedTokens, row.cached_tokens),
  });
}

/**
 * THE ONE RATE AUTHORITY for campaign-attributable spend (estimator ideal
 * shape, 2026-08-12). Every consumer that turns api_usage_ledger rows into
 * dollars for an estimate or a report — reextract-estimate's call plan, its
 * replay-prior, reextract-report's actuals — goes through THIS projection.
 *
 * Why one home: the projection's silent failure mode is a missing `mode`
 * column. `mode` is load-bearing in pricedGeminiRow (batch rows are billed
 * at half price), so a hand-rolled GROUP BY that forgets it prices batch
 * traffic at interactive rates and inflates a quote 2x without a single
 * error. Here `mode` is ALWAYS selected and ALWAYS grouped — a caller
 * cannot opt out of it. Scope is an explicit argument: campaign-scoped
 * (a campaign's own tagged rows) or windowed-callers (a trailing window of
 * named callers), the only two shapes any estimator consumer uses.
 *
 * Non-gemini rows are returned UNPRICED and counted, never $0 — the $118
 * lesson: an unpriced line must read as "unpriced", not as free.
 */
export type AttributableScope =
  | { kind: 'campaign'; campaignId: string }
  | { kind: 'window'; callers: readonly string[]; windowDays: number };

export interface AttributableRateRow {
  caller: string;
  service: string;
  model: string | null;
  /** Always present in the projection — see the docblock. */
  mode: string | null;
  calls: number;
  /** Priced micro-USD for gemini rows; 0 for unpriced services. */
  micros: number;
  priced: boolean;
}

export interface AttributableRates {
  rows: AttributableRateRow[];
  /** Total priced (gemini) micro-USD across the scope. */
  geminiMicros: number;
  /** Calls from services this authority cannot price (places, tomtom…). */
  unpricedCalls: number;
  /** Priced micro-USD summed per caller (gemini only). */
  byCaller: Map<string, number>;
}

type RawLedgerClient = {
  $queryRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
};

export async function campaignAttributableRates(
  db: RawLedgerClient,
  scope: AttributableScope,
): Promise<AttributableRates> {
  type Row = {
    caller: string;
    service: string;
    model: string | null;
    mode: string | null;
    input_tokens: bigint;
    output_tokens: bigint;
    cached_tokens: bigint;
    duration_hours: number | null;
    calls: bigint;
  };
  // duration_hours rides along so cache-STORAGE rows price as storage, not
  // as a zero-token generation; summed because storage bills token-hours.
  const raw =
    scope.kind === 'campaign'
      ? await db.$queryRaw<Row[]>`
          SELECT caller, service, model, mode,
                 sum(input_tokens)  AS input_tokens,
                 sum(output_tokens) AS output_tokens,
                 sum(cached_tokens) AS cached_tokens,
                 sum(duration_hours) AS duration_hours,
                 count(*)           AS calls
          FROM api_usage_ledger
          WHERE campaign_id = ${scope.campaignId}::uuid
          GROUP BY caller, service, model, mode`
      : await db.$queryRaw<Row[]>`
          SELECT caller, service, model, mode,
                 sum(input_tokens)  AS input_tokens,
                 sum(output_tokens) AS output_tokens,
                 sum(cached_tokens) AS cached_tokens,
                 sum(duration_hours) AS duration_hours,
                 count(*)           AS calls
          FROM api_usage_ledger
          WHERE service = 'gemini'
            AND caller = ANY(${scope.callers as string[]})
            AND created_at > now() - make_interval(days => ${scope.windowDays}::int)
          GROUP BY caller, service, model, mode`;

  const rows: AttributableRateRow[] = [];
  const byCaller = new Map<string, number>();
  let geminiMicros = 0;
  let unpricedCalls = 0;
  for (const row of raw) {
    const priced = row.service === 'gemini';
    const micros = priced
      ? pricedGeminiRow({
          model: row.model,
          mode: row.mode,
          input_tokens: row.input_tokens,
          output_tokens: row.output_tokens,
          cached_tokens: row.cached_tokens,
          duration_hours: row.duration_hours,
        })
      : 0;
    if (priced) {
      geminiMicros += micros;
      byCaller.set(row.caller, (byCaller.get(row.caller) ?? 0) + micros);
    } else {
      unpricedCalls += Number(row.calls);
    }
    rows.push({
      caller: row.caller,
      service: row.service,
      model: row.model,
      mode: row.mode,
      calls: Number(row.calls),
      micros,
      priced,
    });
  }
  return { rows, geminiMicros, unpricedCalls, byCaller };
}

/**
 * K4 vendor fact: the AI Studio monthly spend cap resets on the first day
 * of each month, PST (the console says so verbatim), with ~10min
 * enforcement latency. Poison horizon for a vendor cap-429: next month
 * start in UTC-8 plus one hour of grace.
 */
export function msUntilVendorMonthReset(now: Date = new Date()): number {
  const PST_OFFSET_MS = 8 * 60 * 60 * 1000;
  const pstNow = new Date(now.getTime() - PST_OFFSET_MS);
  const nextMonthStartPst = Date.UTC(
    pstNow.getUTCFullYear(),
    pstNow.getUTCMonth() + 1,
    1,
  );
  const resetUtcMs = nextMonthStartPst + PST_OFFSET_MS + 60 * 60 * 1000;
  return Math.max(0, resetUtcMs - now.getTime());
}
