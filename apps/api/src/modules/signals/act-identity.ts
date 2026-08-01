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
