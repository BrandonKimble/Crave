import { Prisma } from '@prisma/client';
import type { EntityType } from '@prisma/client';
import { ENTITY_DEDUPE_RULE_VERSION } from './entity-dedupe-rule';
import { canonicalFold, FOLD_ALGORITHM_VERSION } from './entity-identity';

/**
 * THE COURT'S MEMORY IS THE LEDGER (owner-approved rederivation, 2026-09-04).
 *
 * Until today a judge REJECT had no ledger row: its "durable memory" was the
 * archived, redirect-free row the sink landed on, so `status = 'archived'
 * AND no redirect` WAS the verdict — and every archive made for another
 * reason wore the reject's clothes. Proven on staging: 134 places the
 * janitor archived as UNGROUNDABLE (Google never grounded them, nobody
 * judged them) swallowed 632 of 29,451 place mentions in the v23 shadow
 * ("Arlo's" ate every "Arlos is the BEST" that belonged to the live,
 * grounded "Arlo's Junior"); 714 items archived on 2026-08-20/22 with no
 * verdict anywhere swallowed 428 of 13,080 dish mentions ("hard shell taco"
 * sank, and the place vouch riding on it vanished with no event and no
 * refusal row).
 *
 * The law now, in three predicates that every site embeds verbatim:
 *
 *  - A REJECT IS A LEDGERED VERDICT (`ledgeredRejectSql`): lane
 *    'entity_reject', claim_key = `<kind>|<canonical fold>` — the same
 *    fold `identity_key` carries, so the ledger row and the archived
 *    landing row agree by construction. Rule- and fold-versioned like the
 *    entity_match lane it is heard alongside (same judge, same contract):
 *    a rule bump re-opens the question, it does not keep sinking under a
 *    rule no longer in force.
 *  - GOOGLE CLOSED IT (`googleClosedSql`): every location the place has
 *    reports CLOSED_PERMANENTLY — Google's own verdict, the one the
 *    janitor's closed arm acts on. Never status alone.
 *  - A PARKED NAME (`parkedNameSql`): archived, redirect-free, born to no
 *    shadow, with NEITHER of the above. Not a death — a name nobody has
 *    ruled on, waiting. A mention that would otherwise MINT this fold
 *    REVIVES the parked row instead (unified-processing's mint block and
 *    write-time revalidation; the rehearsal flip for shadows).
 *
 * The sink LANDS on an archived row — it needs somewhere inert to put the
 * mention — but the row is no longer the evidence. A ledgered reject with
 * no landing row (a verdict flipped from a shadow, a row deleted) simply
 * reaches the judge again; the judge re-rejects, `ensureRejectTombstone`
 * mints the landing, and the next mention is free.
 *
 * ATTRIBUTE VOCABULARY IS NOT ON THIS LANE: item/place attributes are
 * judged by the ontology adjudicator, whose archive IS its verdict
 * (markEntitiesForCreation's attribute sink). Only the three judge kinds
 * — place, item, ingredient — carry reject verdicts here.
 */
export const ENTITY_REJECT_LANE = 'entity_reject';

export type EntityRejectKind = 'place' | 'item' | 'ingredient';

/** The judge kinds that carry reject verdicts; every other type is null —
 *  the attribute ontology has its own court. */
export function entityRejectKindOf(type: EntityType): EntityRejectKind | null {
  switch (type) {
    case 'place':
      return 'place';
    case 'item':
      return 'item';
    case 'ingredient':
      return 'ingredient';
    default:
      return null;
  }
}

/** claim_key = `<kind>|<canonical fold>` — spelled by the SAME fold that
 *  spells `identity_key`, so SQL can join the ledger to the landing row
 *  without re-folding anything. */
export function entityRejectClaimKey(
  kind: EntityRejectKind,
  term: string,
): string {
  return `${kind}|${canonicalFold(term)}`;
}

export const ENTITY_REJECT_FOLD_VERSION = FOLD_ALGORITHM_VERSION;

/** The kind expression for a core_entities row (only the three judge
 *  kinds; anything else never matches a reject row). */
function kindExprSql(alias: string): Prisma.Sql {
  const e = Prisma.raw(alias);
  return Prisma.sql`(CASE ${e}.type
      WHEN 'place'::entity_type THEN 'place'
      WHEN 'item'::entity_type THEN 'item'
      WHEN 'ingredient'::entity_type THEN 'ingredient'
    END)`;
}

/**
 * A ledgered reject IN FORCE for this row's fold: rule version and fold
 * version must equal the versions in force (the `=` law every lane obeys —
 * a rollback re-opens the question too). Rehearsal verdicts are visible
 * only to their own run (decidedVerdicts' self-visibility rule); a live
 * reader passes null and sees steady verdicts only.
 */
export function ledgeredRejectSql(
  alias: string,
  rehearsalRunId: string | null,
): Prisma.Sql {
  const e = Prisma.raw(alias);
  const rehearsalSource = rehearsalRunId ? `rehearsal:${rehearsalRunId}` : '';
  return Prisma.sql`EXISTS (
    SELECT 1 FROM claim_verdicts v
     WHERE v.lane = ${ENTITY_REJECT_LANE}
       AND v.outcome = 'reject'
       AND v.rule_version = ${ENTITY_DEDUPE_RULE_VERSION}
       AND v.fold_version = ${ENTITY_REJECT_FOLD_VERSION}
       AND ${e}.identity_key IS NOT NULL
       AND v.claim_key = ${kindExprSql(alias)} || '|' || ${e}.identity_key
       AND (v.source NOT LIKE 'rehearsal:%' OR v.source = ${rehearsalSource})
  )`;
}

/** Google reported every location closed — the janitor's closed-arm
 *  verdict, restated for a row of any status. A place with no location at
 *  all is NOT closed (no evidence is not a verdict). */
export function googleClosedSql(alias: string): Prisma.Sql {
  const e = Prisma.raw(alias);
  return Prisma.sql`(${e}.type = 'place'::entity_type
    AND EXISTS (
      SELECT 1 FROM core_restaurant_locations l
       WHERE l.restaurant_id = ${e}.entity_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM core_restaurant_locations l
       WHERE l.restaurant_id = ${e}.entity_id
         AND (l.business_status IS NULL
              OR l.business_status <> 'CLOSED_PERMANENTLY')
    ))`;
}

/** Archived, redirect-free (a redirect means merge-loser, never junk), and
 *  born to no shadow (a rejected shadow's residue is neither a verdict nor
 *  a parked name — red team 2026-09-04 T1-1). */
export function redirectFreeArchivedSql(alias: string): Prisma.Sql {
  const e = Prisma.raw(alias);
  return Prisma.sql`(${e}.status = 'archived'::entity_status
    AND ${e}.born_extraction_run_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM entity_redirects r WHERE r.from_entity_id = ${e}.entity_id
    ))`;
}

/** The sink's evidence: a ledgered reject in force, or Google's closure. */
export function sinkVerdictSql(
  alias: string,
  rehearsalRunId: string | null,
): Prisma.Sql {
  return Prisma.sql`(${ledgeredRejectSql(alias, rehearsalRunId)} OR ${googleClosedSql(alias)})`;
}

/** A parked name: archived and redirect-free with NO verdict against it. */
export function parkedNameSql(
  alias: string,
  rehearsalRunId: string | null,
): Prisma.Sql {
  const e = Prisma.raw(alias);
  return Prisma.sql`(${redirectFreeArchivedSql(alias)}
    AND ${e}.type IN ('place'::entity_type, 'item'::entity_type, 'ingredient'::entity_type)
    AND NOT ${sinkVerdictSql(alias, rehearsalRunId)})`;
}

/** No active/pending row of the same type holds this row's fold — the
 *  partial unique identity index's slot is free, so the row may come back. */
export function identitySlotFreeSql(alias: string): Prisma.Sql {
  const e = Prisma.raw(alias);
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM core_entities live
     WHERE live.type = ${e}.type
       AND live.identity_key = ${e}.identity_key
       AND live.status IN ('active'::entity_status, 'pending'::entity_status)
  )`;
}

export type ArchivedRowFate = 'sink' | 'parked' | 'shadow-residue';

/**
 * WHAT AN ARCHIVED, REDIRECT-FREE ID MEANS at write time — the one
 * classification the time-of-use revalidation and the mint block share.
 *   'sink'           — a verdict stands (ledgered reject or Google closed):
 *                      absorb the mention, write nothing.
 *   'parked'         — no verdict: the name is waiting; revive (live) or
 *                      adopt as-is (shadow — the flip revives at activation).
 *   'shadow-residue' — born to a rejected shadow: neither; the row is
 *                      nobody's verdict and nobody's name.
 * Ids that are not archived, or that carry a redirect, are absent from the
 * result — the caller handles those by their own rules.
 */
export async function classifyArchivedRedirectFree(
  tx: Prisma.TransactionClient,
  entityIds: readonly string[],
  rehearsalRunId: string | null,
): Promise<Map<string, ArchivedRowFate>> {
  if (!entityIds.length) return new Map();
  const rows = await tx.$queryRaw<
    Array<{ entity_id: string; fate: ArchivedRowFate }>
  >(Prisma.sql`
    SELECT e.entity_id,
           CASE
             WHEN e.born_extraction_run_id IS NOT NULL THEN 'shadow-residue'
             -- Attribute vocabulary: the ontology's archive IS its verdict.
             WHEN e.type NOT IN ('place'::entity_type, 'item'::entity_type,
                                 'ingredient'::entity_type) THEN 'sink'
             WHEN ${sinkVerdictSql('e', rehearsalRunId)} THEN 'sink'
             ELSE 'parked'
           END AS fate
      FROM core_entities e
     WHERE e.entity_id = ANY(${[...entityIds]}::uuid[])
       AND e.status = 'archived'::entity_status
       AND NOT EXISTS (
         SELECT 1 FROM entity_redirects r WHERE r.from_entity_id = e.entity_id
       )`);
  return new Map(rows.map((row) => [row.entity_id, row.fate]));
}

/**
 * REVIVE a parked name: back to the status a fresh live mint would get
 * (active — the three judge kinds are never quarantined at birth). The
 * row keeps everything else, `enrichment_failure_count` included, so a
 * revived ungroundable place does not re-arm the Places spend loop: the
 * money guard in restaurant-location-enrichment refuses at the threshold
 * exactly as before. Returns false when a live twin already holds the
 * fold's identity slot — the caller then resolves onto the twin, which IS
 * the fold's owner.
 */
export async function reviveParkedName(
  tx: Prisma.TransactionClient,
  entityId: string,
): Promise<boolean> {
  const updated = await tx.$executeRaw(Prisma.sql`
    UPDATE core_entities e
       SET status = 'active'::entity_status,
           last_updated = now()
     WHERE e.entity_id = ${entityId}::uuid
       AND ${parkedNameSql('e', null)}
       AND ${identitySlotFreeSql('e')}`);
  return updated === 1;
}
