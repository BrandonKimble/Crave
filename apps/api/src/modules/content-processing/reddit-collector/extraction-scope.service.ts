import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * THE ONE HOME for "which facts belong to the current extraction?"
 *
 * Why this exists (foundational re-derivation, 2026-08-01): four red-team
 * rounds produced eight critical defects and SEVEN were the same defect —
 * the same domain question hand-written as ad-hoc SQL at 37 non-test call
 * sites across 12 files, each with its own join, each a fresh chance to be
 * subtly wrong:
 *
 *  - D2  activate-shadow's "which docs does this run own" was wrong
 *        (13,912 prod docs, 15.5%, would have flipped to a run that never
 *        extracted them).
 *  - D7  activate-shadow's "which restaurants are affected" missed
 *        core_restaurant_events entirely — while replay.service had a
 *        CORRECT implementation five files away that it simply didn't call.
 *  - D12 shadow-diff's "which runs are this shadow" wasn't community-scoped.
 *  - D5  the nightly merge sweeps never asked at all, so they treated
 *        shadow-minted vocabulary as real.
 *
 * A generation column on the derived tables was the first proposed fix and
 * it was WRONG: `core_entities` is the IDENTITY layer and is deliberately
 * shared across extractions — that sharing is exactly why a user's saved
 * restaurant survives a re-extraction (181 list items over 41 entities on
 * prod). Tagging identity with a generation would break the property the
 * system exists to protect. Evidence is versioned; identity is not.
 *
 * So: no new dimension. One definition per question, tested once, used
 * everywhere — and `extraction-scope-lockdown.spec.ts` fails the build if a
 * 38th hand-rolled join appears.
 */
@Injectable()
export class ExtractionScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Documents a run OWNS — i.e. documents whose ACTIVE run is the run this
   * one replayed. A document rides in more than one run's inputs whenever
   * it was pulled in as thread context (`extract_from_post=false`) or by an
   * overlapping keyword lane, so "appears in the run's inputs" is NOT
   * ownership: a context-only replay would take the pointer and its
   * supersede-delete would destroy the real mentions (D2).
   */
  async documentsOwnedByRun(
    runId: string,
    options: { excludePlatform?: string } = {},
  ): Promise<string[]> {
    const excludePlatform = options.excludePlatform ?? 'poll_surface';
    const rows = await this.prisma.$queryRaw<Array<{ document_id: string }>>(
      Prisma.sql`
        SELECT DISTINCT eid.document_id
        FROM collection_extraction_inputs ei
        JOIN collection_extraction_input_documents eid
          ON eid.input_id = ei.input_id
        JOIN collection_source_documents d
          ON d.document_id = eid.document_id
        JOIN collection_extraction_runs r
          ON r.extraction_run_id = ei.extraction_run_id
        WHERE ei.extraction_run_id = ${runId}::uuid
          AND d.platform <> ${excludePlatform}
          AND d.active_extraction_run_id
              = (r.metadata->>'replayOfExtractionRunId')::uuid`,
    );
    return rows.map((row) => row.document_id);
  }

  /**
   * Every restaurant a document set touches. MUST union both event ledgers:
   * a restaurant whose evidence is only restaurant-level (praise with no
   * dish entity) lives solely in core_restaurant_events, and omitting it
   * leaves its projections serving the pre-activation graph (D7).
   */
  async affectedRestaurantsForDocuments(
    documentIds: string[],
  ): Promise<string[]> {
    if (documentIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ restaurant_id: string }>>(
      Prisma.sql`
        SELECT DISTINCT restaurant_id FROM core_restaurant_entity_events
        WHERE source_document_id = ANY(${documentIds}::uuid[])
        UNION
        SELECT DISTINCT restaurant_id FROM core_restaurant_events
        WHERE source_document_id = ANY(${documentIds}::uuid[])`,
    );
    return rows.map((row) => row.restaurant_id);
  }

  /**
   * The completed runs that ARE a given shadow, scoped to the communities
   * under review. Global scoping silently suppressed OWNER-DECISION rows in
   * a rolling/global campaign: an entity the candidate stopped supporting in
   * Austin but still supports in NY looked supported (D12).
   */
  async shadowRunsFor(
    promptHash: string,
    communities: string[],
  ): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ run_id: string }>>(
      Prisma.sql`
        SELECT DISTINCT r.extraction_run_id AS run_id
        FROM collection_extraction_runs r
        JOIN collection_extraction_inputs ei
          ON ei.extraction_run_id = r.extraction_run_id
        JOIN collection_extraction_input_documents eid
          ON eid.input_id = ei.input_id
        JOIN collection_source_documents d
          ON d.document_id = eid.document_id
        WHERE r.system_prompt_hash = ${promptHash}
          AND r.status = 'completed'
          AND d.community = ANY(${communities})`,
    );
    return rows.map((row) => row.run_id);
  }

  /**
   * Entities with support in the ACTIVE extraction — the predicate the
   * nightly merge sweeps were missing (D5).
   *
   * Note there is no new column: the projection rebuild only writes
   * `core_restaurant_items` from events whose run IS the document's active
   * run. CAVEAT (round-six regression #3): the converse is NOT exact —
   * STARVED ANCHORS (user-anchored entities whose evidence lost active
   * support) deliberately KEEP their connection rows, so this predicate
   * reads them as "supported". That is the safe direction for the merge
   * sweeps (an anchored entity must never be treated as garbage), but do
   * not reuse this predicate where "has live evidence" must be literal —
   * use the event-ledger counts for that.
   */
  activeSupportFilter(alias = 'e'): Prisma.Sql {
    return Prisma.raw(`EXISTS (
      SELECT 1 FROM core_restaurant_items c
      WHERE ${alias}.entity_id IN (c.restaurant_id, c.food_id)
    )`);
  }

  async entityIdsWithActiveSupport(candidateIds: string[]): Promise<string[]> {
    if (candidateIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ entity_id: string }>>(
      Prisma.sql`
        SELECT DISTINCT e.entity_id
        FROM core_entities e
        WHERE e.entity_id = ANY(${candidateIds}::uuid[])
          AND EXISTS (
            SELECT 1 FROM core_restaurant_items c
            WHERE e.entity_id IN (c.restaurant_id, c.food_id)
          )`,
    );
    return rows.map((row) => row.entity_id);
  }
}

/**
 * Pure SQL fragments of THE active-scope definition, for readers that embed
 * raw SQL (search eligibility, curated ranking, merge inputs, ops counts).
 * Final-final red team #1: five readers queried the raw event ledgers with
 * NO active-run filter — with retain-activation, a superseded generation's
 * events would keep dead restaurants search-eligible, double-count curated
 * mention volume, and skew merge decisions (the "23,358 dark rows, 2-4x
 * double-counting" incident class). The fragment lives HERE so the
 * definition cannot fork; readers import it, never hand-roll the join.
 */
export function activeRestaurantEventExistsSql(restaurantRef: string): string {
  return `EXISTS (
    SELECT 1 FROM core_restaurant_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${restaurantRef}
  )`;
}

export function activeRestaurantEventCountSql(restaurantRef: string): string {
  return `(SELECT count(*)::int FROM core_restaurant_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${restaurantRef})`;
}

export function activeEntityEventCountSql(restaurantRef: string): string {
  return `(SELECT count(*)::int FROM core_restaurant_entity_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${restaurantRef})`;
}

/** FROM-clause source for readers that aggregate over ACTIVE restaurant
 *  events directly (praise lane — final red team #2: praise read the raw
 *  ledger and counted retained superseded generations). Exposes ev_scope. */
export function activeRestaurantEventsSourceSql(): string {
  return `core_restaurant_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id`;
}

/** FROM-clause source over ACTIVE entity events (ops rollups). */
export function activeEntityEventsSourceSql(): string {
  return `core_restaurant_entity_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id`;
}

/** ACTIVE-scope community aggregates for merge identity judgments (final
 *  red team #1: any-overlap community gating cross-metro-merged Gueros →
 *  Gueros Brooklyn off one stray mention; identity wants the DOMINANT
 *  community of each side). */
export function activeCommunitiesArraySql(restaurantRef: string): string {
  return `COALESCE((SELECT array_agg(DISTINCT lower(d_scope.community)) FILTER (WHERE d_scope.community IS NOT NULL)
    FROM core_restaurant_entity_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${restaurantRef}), '{}')`;
}

export function dominantCommunitySql(restaurantRef: string): string {
  return `(SELECT lower(d_scope.community)
    FROM core_restaurant_entity_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${restaurantRef} AND d_scope.community IS NOT NULL
    GROUP BY lower(d_scope.community)
    ORDER BY count(*) DESC, lower(d_scope.community)
    LIMIT 1)`;
}

/** Active-support EXISTS on the connection projection — the D5 predicate.
 *  Exported so the dedupe sweeps consume THIS instead of an inline copy. */
export function activeSupportExistsSql(entityRef: string): string {
  return `EXISTS (
    SELECT 1 FROM core_restaurant_items c_scope
    WHERE ${entityRef} IN (c_scope.restaurant_id, c_scope.food_id)
  )`;
}
