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
