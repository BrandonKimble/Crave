import { Injectable } from '@nestjs/common';
import { EntityType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { foldSurfacesFromMerge } from '../entity-resolver/entity-surface.service';

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
  async affectedPlacesForDocuments(documentIds: string[]): Promise<string[]> {
    if (documentIds.length === 0) return [];
    const rows = await this.prisma.$queryRaw<Array<{ place_id: string }>>(
      Prisma.sql`
        SELECT DISTINCT restaurant_id FROM core_restaurant_entity_events
        WHERE source_document_id = ANY(${documentIds}::uuid[])
        UNION
        SELECT DISTINCT restaurant_id FROM core_restaurant_events
        WHERE source_document_id = ANY(${documentIds}::uuid[])`,
    );
    return rows.map((row) => row.place_id);
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
export function activePlaceEventExistsSql(placeRef: string): string {
  return `EXISTS (
    SELECT 1 FROM core_restaurant_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${placeRef}
  )`;
}

export function activePlaceEventCountSql(placeRef: string): string {
  return `(SELECT count(*)::int FROM core_restaurant_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${placeRef})`;
}

export function activeEntityEventCountSql(placeRef: string): string {
  return `(SELECT count(*)::int FROM core_restaurant_entity_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${placeRef})`;
}

/** FROM-clause source for readers that aggregate over ACTIVE restaurant
 *  events directly (praise lane — final red team #2: praise read the raw
 *  ledger and counted retained superseded generations). Exposes ev_scope. */
export function activePlaceEventsSourceSql(): string {
  return `core_restaurant_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id`;
}

/** FROM-clause source: the DISTINCT (restaurant, platform, community)
 *  crediting pairs over ACTIVE events of BOTH ledgers — market-membership's
 *  "which community's corpus credits this place?" question (v17 S4). Both
 *  ledgers, for the same reason as affectedPlacesForDocuments (D7): a
 *  praise-only restaurant lives solely in core_restaurant_events. */
export function activeCreditingCommunitiesSourceSql(): string {
  return `(
    SELECT ev_scope.restaurant_id, d_scope.platform, lower(d_scope.community) AS community
    FROM core_restaurant_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE d_scope.community IS NOT NULL
    UNION
    SELECT ev_scope.restaurant_id, d_scope.platform, lower(d_scope.community)
    FROM core_restaurant_entity_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE d_scope.community IS NOT NULL
  )`;
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
export function activeCommunitiesArraySql(placeRef: string): string {
  return `COALESCE((SELECT array_agg(DISTINCT lower(d_scope.community)) FILTER (WHERE d_scope.community IS NOT NULL)
    FROM core_restaurant_entity_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${placeRef}), '{}')`;
}

export function dominantCommunitySql(placeRef: string): string {
  return `(SELECT lower(d_scope.community)
    FROM core_restaurant_entity_events ev_scope
    JOIN collection_source_documents d_scope
      ON d_scope.document_id = ev_scope.source_document_id
     AND d_scope.active_extraction_run_id = ev_scope.extraction_run_id
    WHERE ev_scope.restaurant_id = ${placeRef} AND d_scope.community IS NOT NULL
    GROUP BY lower(d_scope.community)
    ORDER BY count(*) DESC, lower(d_scope.community)
    LIMIT 1)`;
}

/**
 * THE ONE SUPERSEDE-AND-ACTIVATE (F472–F474).
 *
 * This operation — "the events of the runs this activation replaces die, and
 * the documents' pointer flips" — had forked into THREE copies
 * (collection-evidence, unified-processing, replay). Each was fixed AFTER its
 * sibling: the within-generation prompt-hash scoping landed in
 * unified-processing (c6798321), then had to be re-landed in
 * collection-evidence, then again in replay — because a live re-ingest was
 * deleting a RETAINED superseded generation's events and silently destroying
 * the rollback target. A law that must be re-discovered three times is not a
 * law; it is a coincidence. It lives here now, once.
 *
 * TWO SEMANTICS, one deliberate distinction:
 *  - 'delete' (default) — WITHIN-generation churn: the same prompt re-extracts
 *    a document because new comments arrived. The newest run strictly
 *    supersedes; retaining would accumulate unbounded junk on every
 *    re-collection. Only runs sharing the activating run's system_prompt_hash
 *    are superseded — cross-generation deletion belongs EXCLUSIVELY to the
 *    explicit discard (shadow-discard.sql).
 *  - 'retain' — CROSS-generation switches (activate-shadow): the corpus flips
 *    to a NEW prompt's runs after owner review. The superseded generation's
 *    events stay (every reader filters on the active run, so they are inert)
 *    and rollback becomes a pointer flip instead of a re-paid extraction.
 *
 * Returns the restaurants that LOSE evidence, with their rebuild advisory
 * locks already taken in this transaction, so the caller rebuilds them
 * post-commit.
 */
export async function supersedeAndActivate(
  tx: Prisma.TransactionClient,
  activateRunId: string,
  documentIds: string[],
  options: { scope?: 'delete' | 'retain' } = {},
): Promise<string[]> {
  const ids = Array.from(new Set(documentIds.filter(Boolean)));
  if (!ids.length) {
    return [];
  }
  const scope = options.scope ?? 'delete';

  const flip = () =>
    tx.sourceDocument.updateMany({
      where: { documentId: { in: ids } },
      data: { activeExtractionRunId: activateRunId },
    });

  if (scope === 'retain') {
    await flip();
    return [];
  }

  const activatingRun = await tx.extractionRun.findUniqueOrThrow({
    where: { extractionRunId: activateRunId },
    select: { systemPromptHash: true },
  });

  // D7: the losing set MUST union BOTH event ledgers — a restaurant whose
  // evidence is only restaurant-level (praise with no dish entity) lives
  // solely in core_restaurant_events, and omitting it leaves its projections
  // serving the pre-activation graph.
  const losing = await tx.$queryRaw<Array<{ place_id: string }>>`
    SELECT DISTINCT ev.restaurant_id FROM (
      SELECT e.restaurant_id, e.extraction_run_id
      FROM core_restaurant_entity_events e
      WHERE e.source_document_id = ANY(${ids}::uuid[])
        AND e.extraction_run_id <> ${activateRunId}::uuid
      UNION
      SELECT e.restaurant_id, e.extraction_run_id
      FROM core_restaurant_events e
      WHERE e.source_document_id = ANY(${ids}::uuid[])
        AND e.extraction_run_id <> ${activateRunId}::uuid
    ) ev
    JOIN collection_extraction_runs r ON r.extraction_run_id = ev.extraction_run_id
    WHERE r.system_prompt_hash = ${activatingRun.systemPromptHash}
  `;
  // Sorted so overlapping activations cannot deadlock on the rebuild locks.
  const losingIds = losing.map((entry) => entry.place_id).sort();
  for (const placeId of losingIds) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rebuild:place:${placeId}`}))`;
  }

  await tx.placeEntityEvent.deleteMany({
    where: {
      sourceDocumentId: { in: ids },
      extractionRunId: { not: activateRunId },
      extractionRun: { systemPromptHash: activatingRun.systemPromptHash },
    },
  });
  await tx.placeEvent.deleteMany({
    where: {
      sourceDocumentId: { in: ids },
      extractionRunId: { not: activateRunId },
      extractionRun: { systemPromptHash: activatingRun.systemPromptHash },
    },
  });
  await flip();
  return losingIds;
}

/**
 * ACTIVE-WINNER REDIRECT MAP — loser id → the live entity that absorbed it.
 *
 * Only pairs where the FROM side is archived and the TO side is active
 * qualify: that is exactly the state a completed merge leaves behind
 * (finalizeMergeCompletion archives the loser, flattens chains so one hop is
 * always enough, and drops stale redirects FROM live winners). A redirect
 * whose target is itself archived is stranded evidence — the tombstone sweep
 * counts it for a human; this map deliberately does not follow it.
 */
export async function activeWinnerRedirectMap(
  tx: Prisma.TransactionClient,
  entityIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = Array.from(
    new Set(entityIds.filter((id): id is string => Boolean(id))),
  );
  if (!unique.length) {
    return new Map();
  }
  const rows = await tx.$queryRaw<Array<{ from_id: string; to_id: string }>>`
    SELECT r.from_entity_id AS from_id, r.to_entity_id AS to_id
    FROM entity_redirects r
    JOIN core_entities loser
      ON loser.entity_id = r.from_entity_id AND loser.status = 'archived'
    JOIN core_entities winner
      ON winner.entity_id = r.to_entity_id AND winner.status = 'active'
    WHERE r.from_entity_id = ANY(${unique}::uuid[])`;
  return new Map(rows.map((row) => [row.from_id, row.to_id]));
}

/**
 * THE EVENT-WRITE CHOKEPOINTS — redirect resolution at write time.
 *
 * Why (2026-08-11 convergence audit, ranked change #1): a merge rekeys both
 * ledgers in-transaction, but a writer holding a PRE-merge resolution
 * snapshot lands its events on the archived loser AFTER the merge commits,
 * and the projection rebuild reads by restaurant with no redirect hop — so
 * the evidence silently vanished until the nightly tombstone sweep found it.
 * The invariant "no new event references a merged-away entity" is owned
 * HERE, at the moment of insert: every id (restaurant dimension and entity
 * dimension) resolves through the active-winner redirect map first.
 *
 * `skipDuplicates` closes the re-map collision for free: if the winner
 * already heard this (run, doc, restaurant[, entity], type) claim, the
 * re-pointed row is the same claim and is dropped, mirroring exactly what
 * the merge rekey and the sweep do with redundant copies.
 *
 * The tombstone sweep remains as the CRASH-WINDOW backstop only (a merge
 * committing between this resolution read and the insert's commit).
 * Writers must not call tx.restaurantEvent/.restaurantEntityEvent.createMany
 * directly — these functions are the ledger's front door.
 */
export async function writePlaceEvents(
  tx: Prisma.TransactionClient,
  rows: Prisma.PlaceEventCreateManyInput[],
): Promise<void> {
  if (!rows.length) {
    return;
  }
  const redirects = await activeWinnerRedirectMap(
    tx,
    rows.map((row) => row.placeId),
  );
  const resolved = redirects.size
    ? rows.map((row) =>
        redirects.has(row.placeId)
          ? { ...row, placeId: redirects.get(row.placeId)! }
          : row,
      )
    : rows;
  await tx.placeEvent.createMany({
    data: resolved,
    skipDuplicates: true,
  });
}

export async function writePlaceEntityEvents(
  tx: Prisma.TransactionClient,
  rows: Prisma.PlaceEntityEventCreateManyInput[],
): Promise<void> {
  if (!rows.length) {
    return;
  }
  const redirects = await activeWinnerRedirectMap(
    tx,
    rows.flatMap((row) => [row.placeId, row.entityId]),
  );
  const resolved = redirects.size
    ? rows.map((row) => {
        const placeId = redirects.get(row.placeId) ?? row.placeId;
        const entityId = redirects.get(row.entityId) ?? row.entityId;
        return placeId === row.placeId && entityId === row.entityId
          ? row
          : { ...row, placeId, entityId };
      })
    : rows;
  await tx.placeEntityEvent.createMany({
    data: resolved,
    skipDuplicates: true,
  });
}

/** SET-BASED merge re-key (round-10 violence red team: the per-event
 *  loop paid two round-trips per event and blew the transaction budget
 *  above ~3,000 events — on prod RTT the largest restaurant was already
 *  at the cliff, so the pair could never merge, silently, forever).
 *  Rows whose content key already exists on the winner DELETE; the rest
 *  re-key. Lives HERE because consumers never name the event ledgers. */
export async function rekeyPlaceEventsToCanonical(
  tx: Prisma.TransactionClient,
  canonicalId: string,
  duplicateId: string,
): Promise<void> {
  // SELF-MERGE ANNIHILATION GUARD (round-11 fuzz D1, executed: with
  // canonical === duplicate the DELETE self-join matched every row
  // against itself and silently destroyed the entire ledger, archived
  // the restaurant, and wrote a self-redirect).
  if (canonicalId === duplicateId) {
    return;
  }
  await tx.$executeRaw`
    DELETE FROM core_restaurant_events ev
    USING core_restaurant_events dup
    WHERE ev.restaurant_id = ${duplicateId}::uuid
      AND dup.restaurant_id = ${canonicalId}::uuid
      AND dup.extraction_run_id = ev.extraction_run_id
      AND dup.source_document_id = ev.source_document_id
      AND dup.evidence_type = ev.evidence_type`;
  await tx.$executeRaw`
    UPDATE core_restaurant_events
    SET restaurant_id = ${canonicalId}::uuid
    WHERE restaurant_id = ${duplicateId}::uuid`;
}

export async function rekeyPlaceEntityEventsToCanonical(
  tx: Prisma.TransactionClient,
  canonicalId: string,
  duplicateId: string,
): Promise<void> {
  // SELF-MERGE ANNIHILATION GUARD (round-11 fuzz D1, executed: with
  // canonical === duplicate the DELETE self-join matched every row
  // against itself and silently destroyed the entire ledger, archived
  // the restaurant, and wrote a self-redirect).
  if (canonicalId === duplicateId) {
    return;
  }
  await tx.$executeRaw`
    DELETE FROM core_restaurant_entity_events ev
    USING core_restaurant_entity_events dup
    WHERE ev.restaurant_id = ${duplicateId}::uuid
      AND dup.restaurant_id = ${canonicalId}::uuid
      AND dup.extraction_run_id = ev.extraction_run_id
      AND dup.source_document_id = ev.source_document_id
      AND dup.entity_id = ev.entity_id
      AND dup.evidence_type = ev.evidence_type`;
  await tx.$executeRaw`
    UPDATE core_restaurant_entity_events
    SET restaurant_id = ${canonicalId}::uuid
    WHERE restaurant_id = ${duplicateId}::uuid`;
}

/** Set-based ENTITY-dimension re-key (food/attribute merges re-point
 *  ev.entity_id, not ev.restaurant_id) — same shape and reasons as the
 *  restaurant-dimension pair above (round-12 audit: the food merge kept
 *  the per-event loop with the default 5s budget; a taco/tacos merge —
 *  2,478 events — could never complete, silently, forever). */
export async function rekeyEntityDimensionEventsToCanonical(
  tx: Prisma.TransactionClient,
  canonicalId: string,
  duplicateId: string,
): Promise<void> {
  if (canonicalId === duplicateId) {
    return;
  }
  await tx.$executeRaw`
    DELETE FROM core_restaurant_entity_events ev
    USING core_restaurant_entity_events dup
    WHERE ev.entity_id = ${duplicateId}::uuid
      AND dup.entity_id = ${canonicalId}::uuid
      AND dup.extraction_run_id = ev.extraction_run_id
      AND dup.source_document_id = ev.source_document_id
      AND dup.restaurant_id = ev.restaurant_id
      AND dup.evidence_type = ev.evidence_type`;
  await tx.$executeRaw`
    UPDATE core_restaurant_entity_events
    SET entity_id = ${canonicalId}::uuid
    WHERE entity_id = ${duplicateId}::uuid`;
}

/** THE MERGE COMPLETION CONTRACT — one implementation for every entity
 *  merge (round-12 audit: the restaurant and food merges each carried a
 *  copy-pasted tail that had DIVERGED; the divergence is where the live
 *  defects lived). Alias-banks the loser's names on the winner
 *  (case-preserving), archives the loser, optionally prunes its public
 *  scores, and flattens the redirect graph (A→B then B→C rewrites A→C;
 *  stale redirects FROM the live winner drop). */
export async function finalizeMergeCompletion(
  tx: Prisma.TransactionClient,
  canonicalId: string,
  duplicateId: string,
  options: { pruneLoserScores?: boolean } = {},
): Promise<void> {
  if (canonicalId === duplicateId) {
    throw new Error(`self-merge refused: ${canonicalId}`);
  }
  // A1: the loser's name + surface ROWS fold onto the winner through THE
  // surface writer — provenance ('merge_fold') and each carried row's
  // locale survive, where the old array_agg destroyed both.
  await foldSurfacesFromMerge(tx, canonicalId, duplicateId);
  await tx.$executeRaw`
    UPDATE core_entities SET status = 'archived'
    WHERE entity_id = ${duplicateId}::uuid`;
  if (options.pruneLoserScores !== false) {
    await tx.$executeRaw`
      DELETE FROM core_public_entity_scores
      WHERE subject_id = ${duplicateId}::uuid`;
  }
  await tx.$executeRaw`
    UPDATE entity_redirects SET to_entity_id = ${canonicalId}::uuid
    WHERE to_entity_id = ${duplicateId}::uuid`;
  await tx.$executeRaw`
    DELETE FROM entity_redirects WHERE from_entity_id = ${canonicalId}::uuid`;
  await tx.$executeRaw`
    INSERT INTO entity_redirects (from_entity_id, to_entity_id)
    VALUES (${duplicateId}::uuid, ${canonicalId}::uuid)
    ON CONFLICT (from_entity_id)
    DO UPDATE SET to_entity_id = ${canonicalId}::uuid`;
}

/** THE ONE lock-key derivation for identity mutual exclusion — creator
 *  and both merge services derive their advisory-lock string HERE, keyed
 *  off the LIVE entity_type enum values ('item'/'place'). Rename residue
 *  (red-team lens 1, 2026-08-17): the merges free-composed
 *  'entity:food:…'/'entity:restaurant:…' while the creator composed from
 *  the live enum ('item'/'place') — two namespaces, H3 race protection
 *  void. No caller may free-compose an 'entity:' lock string. */
export function identityMergeLockKey(
  entityType: EntityType,
  key: string,
): string {
  return `entity:${entityType}:${key}`;
}

/** Identity advisory locks for a merge — the SAME locks the creation
 *  path takes (async-integrity H3; round-12 audit: the plan asserted
 *  this and the code didn't do it — a creator could adopt the loser
 *  while the merge archived it). Sorted so overlapping merges cannot
 *  deadlock. */
export async function acquireIdentityMergeLocks(
  tx: Prisma.TransactionClient,
  entityType: EntityType,
  lockKeys: string[],
): Promise<void> {
  for (const key of [...lockKeys].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identityMergeLockKey(entityType, key)}))`;
  }
}

/** Active-support EXISTS on the connection projection — the D5 predicate.
 *  Exported so the dedupe sweeps consume THIS instead of an inline copy. */
export function activeSupportExistsSql(entityRef: string): string {
  return `EXISTS (
    SELECT 1 FROM core_restaurant_items c_scope
    WHERE ${entityRef} IN (c_scope.restaurant_id, c_scope.food_id)
  )`;
}
