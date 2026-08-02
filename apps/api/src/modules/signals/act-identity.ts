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
 * THE §4 daily-acts rule, stated once.
 *
 * WHY (red team 2026-08-02). Two readers implemented this law differently over
 * the SAME table:
 *
 *   demand-mass.reader.ts   excluded echo kinds, required an entity subject,
 *                           and grouped by KIND (MAX per kind, then SUM) —
 *                           because two kinds on one day are two acts.
 *   signal-demand-read.ts   did none of that: no echo exclusion, no
 *                           subject_type filter, and no kind in the GROUP BY,
 *                           collapsing every kind of that day to a single MAX.
 *
 * Same entity, same day, different scores — and the looser one is what the
 * collector's territory read used to decide what gets enriched. The RECENCY
 * half of this law was already hoisted into `dayRecencySql` for exactly this
 * reason; the act-identity half was left behind.
 *
 * `a` is the signal_demand_daily alias at every call site, by the same
 * convention as `s` above.
 */
export function dayActsFilterSql(
  echoKinds: readonly string[],
  sinceDayKey: string,
): Prisma.Sql {
  return Prisma.sql`
    a.day >= ${sinceDayKey}::date
    AND a.subject_type = 'entity'
    AND a.subject_id IS NOT NULL
    AND a.kind <> ALL(${[...echoKinds]}::text[])
  `;
}

/**
 * The grain a daily-acts aggregate MUST group by. `kind` is load-bearing: two
 * different kinds by one actor on one day are two acts and must SUM, so
 * collapsing them into a single MAX silently under-counts demand.
 */
export const DAY_ACTS_GRAIN_SQL = Prisma.sql`a.actor_id, a.day, a.kind, a.subject_id`;
