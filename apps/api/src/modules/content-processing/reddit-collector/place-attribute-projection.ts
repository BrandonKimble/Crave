/**
 * THE ONE WRITER of `core_entities.restaurant_attributes` for the
 * evidence-owned classes (redteam-l2 K1, 2026-08-26).
 *
 * The column is a PROJECTION of `core_restaurant_attribute_evidence` —
 * the union of every source class's live claims, filtered to ACTIVE
 * attribute entities so archived vocabulary drops out on its own. Before
 * this, four writers UNIONED into the array (testimony, the cuisine lane's
 * two paths, the poll seed) while this projection REPLACED it — so a lane
 * rerun that dropped an attribute could delete its evidence row yet leave
 * the id in the column search reads until an unrelated reddit document
 * happened to trigger a rebuild. Now every lane writes EVIDENCE and calls
 * this projection for its own place ids in the same operation: correction
 * reaches the read column immediately, and "what search sees" cannot
 * diverge from "what the ledger says".
 *
 * (Testimony's in-transaction union write in unified-processing remains as
 * a same-tx read-visibility fast path; projection-rebuild reconciles it
 * against the ledger on every rebuild, so it cannot drift durably.)
 */
import type { Prisma, PrismaClient } from '@prisma/client';

type SqlExecutor = Pick<PrismaClient | Prisma.TransactionClient, '$executeRaw'>;

export async function derivePlaceAttributes(
  db: SqlExecutor,
  placeIds: string[],
): Promise<void> {
  if (!placeIds.length) return;
  await db.$executeRaw`
    UPDATE core_entities r
    SET restaurant_attributes = COALESCE(ev.attrs, ARRAY[]::uuid[])
    FROM (
      SELECT rid AS restaurant_id,
             (SELECT array_agg(DISTINCT a.attribute_id)
              FROM core_restaurant_attribute_evidence a
              JOIN core_entities ae
                ON ae.entity_id = a.attribute_id AND ae.status = 'active'
              WHERE a.restaurant_id = rid) AS attrs
      FROM unnest(${placeIds}::uuid[]) AS rid
    ) ev
    WHERE r.entity_id = ev.restaurant_id
      AND r.type = 'place'
  `;
}
