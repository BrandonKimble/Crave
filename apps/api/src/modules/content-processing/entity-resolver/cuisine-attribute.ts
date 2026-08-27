/**
 * THE CUISINE VOCABULARY — one mint policy, one status predicate
 * (redteam-l2 K5, 2026-08-26).
 *
 * Before this file, the same vocabulary had two minters that disagreed
 * (the dish-knowledge lane minted facet='cuisine'; the venue-facts lane
 * minted facet-NULL with the schema's implicit active default — a cuisine
 * the system would never treat as a cuisine) and three read predicates
 * (search registry `status <> 'archived'`, grain bridge NO status filter —
 * the K2 resurrection vector — and derivePlaceAttributes `status =
 * 'active'`).
 *
 * THE STATUS DECISION, written down: read surfaces are ACTIVE-ONLY.
 * Adjudication's contract (attribute-ontology.service.ts applyPlan) is that
 * `pending` means quarantined-until-judged — pending rows are visible ONLY
 * to the adjudication queue and to resolution's dedup probes (so a repeat
 * mention reuses the pending row instead of minting a twin), never to a
 * read surface; `archived` rows are tombstones that absorb repeat junk.
 * A pending cuisine in the SEARCH registry compiles a hard two-column wall
 * against a vocabulary row no active-only projection will ever satisfy —
 * a query that grounds and returns zero rows. So every consumer of "the
 * cuisine set" (search registry, grain bridge, projections) uses this one
 * predicate: facet='cuisine' AND status='active'.
 */
import {
  EntityStatus,
  EntityType,
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { addSurfaces, type SurfaceSource } from './entity-surface.service';
import { identityInsertData } from './entity-identity';

export const CUISINE_FACET = 'cuisine';

/**
 * THE cuisine-vocabulary predicate, as a composable SQL fragment over an
 * aliased core_entities row. Compose with Prisma.sql / $queryRaw only —
 * the alias is interpolated raw and must be a code literal, never input.
 */
export function cuisineVocabularySql(alias: string): Prisma.Sql {
  const a = Prisma.raw(alias);
  return Prisma.sql`${a}.type = 'place_attribute'::entity_type
    AND ${a}.facet = ${CUISINE_FACET}
    AND ${a}.status = 'active'::entity_status`;
}

/**
 * THE ONE CUISINE MINTER. Both lanes that can meet an unknown tradition —
 * dish-knowledge synthesis and venue-facts (cuisine) extraction — call this
 * to create the canonical facet='cuisine' place_attribute row. Status is
 * EXPLICIT (the schema default is invisible policy): cuisines mint ACTIVE
 * because the vocabulary is a curated closed-ish set resolved against the
 * shared canonical rows, not quarantined collection vocabulary — the
 * shipped dish-lane shape, now the only shape.
 *
 * Race-safe: uq_attribute_identity_key makes the find-then-create race lose
 * loudly; the loser refetches the winner. Returns null only when even the
 * refetch finds nothing (a non-identity failure the caller logs).
 */
export async function mintCuisineFacetRow(
  prisma: PrismaClient,
  name: string,
  surfaces: { forms: string[]; source: SurfaceSource },
): Promise<{ entityId: string; created: boolean } | null> {
  try {
    const created = await prisma.entity.create({
      data: {
        name,
        type: EntityType.place_attribute,
        facet: CUISINE_FACET,
        status: EntityStatus.active,
        ...identityInsertData(name, EntityType.place_attribute),
      },
      select: { entityId: true },
    });
    const forms = surfaces.forms.length ? surfaces.forms : [name];
    await prisma.$transaction((tx) =>
      addSurfaces(
        tx,
        created.entityId,
        forms.map((form) => ({
          form,
          source: surfaces.source,
        })),
        { markEmbeddingStale: false },
      ),
    );
    return { entityId: created.entityId, created: true };
  } catch {
    const winner = await prisma.entity.findFirst({
      where: {
        type: EntityType.place_attribute,
        name,
        status: { in: [EntityStatus.active, EntityStatus.pending] },
      },
      select: { entityId: true },
    });
    if (winner) {
      return { entityId: winner.entityId, created: false };
    }
    return null;
  }
}
