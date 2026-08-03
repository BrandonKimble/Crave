import { Prisma } from '@prisma/client';

/**
 * ACT IDENTITY — the one home for the ledger's dedupe fragments (docket #8,
 * abstraction audit 2026-07-30).
 *
 * These were duplicated VERBATIM across the aggregate rebuild, the
 * signal-demand read service, and the demand-mass reader — three dialects of
 * one law is exactly how the fresh/aggregate arms diverged once before (the
 * midnight step-discontinuity). Stated once, consumed everywhere; `s` is the
 * signals alias at every call site by convention.
 *
 * An act's identity is (kind, request-id): 'search' and
 * 'autocomplete_selection' deliberately SHARE meta.searchRequestId (one
 * submit = two acts), so the key is always paired with s.kind by callers.
 */
export const DEDUPE_KEY_SQL = Prisma.sql`COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.signal_id::text)`;

/**
 * The demand-mass reader's WIDER key: it also collapses the on_demand_ask
 * echo onto its parent search act (meta.askSearchRequestId carries the SAME
 * originating id — see ECHO_SIGNAL_KINDS).
 */
export const ACT_KEY_SQL = Prisma.sql`COALESCE(s.meta->>'searchRequestId', s.meta->>'cacheRevealRequestId', s.meta->>'askSearchRequestId', s.signal_id::text)`;

/** Per-row act weight (backfilled legacy rows carry meta.eventCount). */
export const EVENT_COUNT_SQL = Prisma.sql`GREATEST(1, COALESCE((s.meta->>'eventCount')::int, 1))`;

/**
 * THE §4 daily-acts CTE, stated once — filter, grain, and roll-up together.
 *
 * WHY THIS IS A STATEMENT AND NOT THREE FRAGMENTS (2026-08-02). Two readers
 * implemented this law differently over the SAME table:
 *
 *   demand-mass.reader.ts   excluded echo kinds, required an entity subject,
 *                           and grouped by KIND (MAX per kind, then SUM) —
 *                           because two kinds on one day are two acts.
 *   signal-demand-read.ts   did none of that: no echo exclusion, no
 *                           subject_type filter, and no kind in the GROUP BY,
 *                           collapsing every kind of that day to a single MAX.
 *
 * Same entity, same day, different scores — and the looser one is what the
 * collector's territory read used to decide what gets enriched.
 *
 * The first fix published a `dayActsFilterSql` helper and a
 * `DAY_ACTS_GRAIN_SQL` constant, and a test asserted the readers mentioned
 * them. One reader adopted the filter; the mass reader adopted neither, and
 * the grain constant was never referenced by anything at all — a test can
 * assert a shared fragment EXISTS but not that the SQL is built from it. So
 * there were still three dialects with a shared vocabulary on top.
 *
 * A builder cannot be half-adopted. What varies between the three call sites
 * (their dimensions, their join, their extra predicates) is parameters; what
 * is the law — the horizon, the echo exclusion, the subject scope, and `kind`
 * being IN the grain — is not reachable from outside.
 *
 * `a` is the signal_demand_daily alias at every call site, by the same
 * convention as `s` above.
 */
export interface DailyActsCte {
  /** Grouped expressions this reader needs downstream, with their aliases. */
  dimensions: Prisma.Sql;
  /** The grain those dimensions group by (aliases are not groupable). */
  dimensionGrain: Prisma.Sql;
  /** FROM + any JOINs. Must expose `a` as signal_demand_daily. */
  from: Prisma.Sql;
  /** Extra predicates ANDed after the law's. */
  where?: Prisma.Sql;
  /** Aggregates beyond the act count (e.g. MAX(a.last_occurred_at)). */
  extraAggregates?: Prisma.Sql;
  /** Column name for the per-(actor, day, kind) act count. */
  actsAlias: string;
  echoKinds: readonly string[];
  sinceDayKey: string;
  /**
   * 'entity' requires a resolvable entity subject — the filter the signals
   * reader was missing. 'any' is for tile-level mass, which counts acts
   * against a territory regardless of what they named.
   *
   * HONESTLY: measured against a subject-less fixture row, removing this
   * clause changes NO reader's output — every entity-scoped consumer joins
   * core_entities or groups by subject_id, so a NULL subject is dropped
   * downstream anyway. It stays because pruning at the scan is cheaper than
   * carrying rows to a join that discards them, not because it is the thing
   * standing between us and a wrong number. The kind grain and the echo
   * exclusion ARE that thing — mutating either moves all three readers.
   */
  subjectScope: 'entity' | 'any';
}

export function dailyActsCteSql(cte: DailyActsCte): Prisma.Sql {
  const subjectFilter =
    cte.subjectScope === 'entity'
      ? Prisma.sql`AND a.subject_type = 'entity' AND a.subject_id IS NOT NULL`
      : Prisma.empty;
  return Prisma.sql`
    SELECT
      ${cte.dimensions},
      a.actor_id,
      a.day,
      -- MAX, not SUM: the daily aggregate already carries the de-duplicated
      -- act count for this (actor, day, kind).
      MAX(a.signal_count) AS ${Prisma.raw(`"${cte.actsAlias}"`)}
      ${cte.extraAggregates ? Prisma.sql`, ${cte.extraAggregates}` : Prisma.empty}
    FROM ${cte.from}
    WHERE a.day >= ${cte.sinceDayKey}::date
      -- Docket #6: no upper bound — the aggregate INCLUDES today (the
      -- 15-minute rebuild cadence IS the freshness), and the fresh-ledger arm
      -- where the midnight divergence lived is deleted.
      AND a.kind <> ALL(${[...cte.echoKinds]}::text[])
      ${subjectFilter}
      ${cte.where ? Prisma.sql`AND (${cte.where})` : Prisma.empty}
    -- a.kind IS LOAD-BEARING: two different kinds by one actor on one day
    -- are two acts and must SUM downstream, so collapsing them into a single
    -- MAX here silently under-counts demand.
    GROUP BY ${cte.dimensionGrain}, a.actor_id, a.day, a.kind
  `;
}
