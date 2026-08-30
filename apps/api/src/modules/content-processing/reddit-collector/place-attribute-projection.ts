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
 *
 * THE NAME-VOTE (D5, 2026-08-30): rows with source_class 'venue_name'
 * (VenueCuisineEvidenceService — a cuisine-vocab word in the venue's own
 * name) are VOTES, not facts. Measured ~98% right, but every failure is a
 * product-word homograph ("Texas French Bread" the bakery, "Go Greek
 * Yogurt") that other evidence must OUTVOTE
 * (plans/cuisine-name-signal-measurement.md). A venue_name claim projects
 * only when:
 *   1. CORROBORATED — any other source class asserts the same attribute
 *      ("Aha Indian" + reddit testimony 'indian'); or
 *   2. UNOPPOSED — the place has (a) NO cuisine claim from any other
 *      source class (if Google/editorial/testimony/dish-set named ANY
 *      cuisine and it isn't this one, the name loses: "French Quarter
 *      Grille" is cajun, not french) and (b) NO product-counter venue-kind
 *      evidence (a bakery/dessert/coffee counter is where the cuisine word
 *      modifies the product, not the kitchen — the measured homograph
 *      pattern; see PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES).
 * Every other source class remains a plain union — the vote gates only
 * the name lane's own rows, so it can never subtract another lane's
 * evidence.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES } from '../../restaurant-enrichment/google-place-type-attributes';

type SqlExecutor = Pick<PrismaClient | Prisma.TransactionClient, '$executeRaw'>;

export const VENUE_NAME_SOURCE_CLASS = 'venue_name';

export async function derivePlaceAttributes(
  db: SqlExecutor,
  placeIds: string[],
): Promise<void> {
  if (!placeIds.length) return;
  const productKinds = [...PRODUCT_VENUE_KIND_ATTRIBUTE_NAMES];
  await db.$executeRaw`
    UPDATE core_entities r
    SET restaurant_attributes = COALESCE(ev.attrs, ARRAY[]::uuid[])
    FROM (
      SELECT rid AS restaurant_id,
             (SELECT array_agg(DISTINCT a.attribute_id)
              FROM core_restaurant_attribute_evidence a
              JOIN core_entities ae
                ON ae.entity_id = a.attribute_id AND ae.status = 'active'
              WHERE a.restaurant_id = rid
                AND (
                  a.source_class <> ${VENUE_NAME_SOURCE_CLASS}
                  -- corroborated: any non-name source asserts the same id
                  OR EXISTS (
                    SELECT 1 FROM core_restaurant_attribute_evidence c
                    WHERE c.restaurant_id = rid
                      AND c.attribute_id = a.attribute_id
                      AND c.source_class <> ${VENUE_NAME_SOURCE_CLASS}
                  )
                  -- unopposed: no other-source cuisine claim at all…
                  -- ARCHIVED IDS NEITHER CORROBORATE NOR OPPOSE (acceptance
                  -- red team 2026-08-30, the Bhatti class): a row pointing
                  -- at an archived attribute id cannot corroborate (the
                  -- outer join is active-only), so letting it OPPOSE gives a
                  -- dead id a one-way veto — it kills the very tag it would
                  -- have confirmed. Active-only on both counter-subqueries;
                  -- the redirect-heal script repoints the stale rows so
                  -- their vote comes back as corroboration.
                  OR (
                    NOT EXISTS (
                      SELECT 1 FROM core_restaurant_attribute_evidence o
                      JOIN core_entities oe
                        ON oe.entity_id = o.attribute_id
                       AND oe.facet = 'cuisine'
                       AND oe.status = 'active'
                      WHERE o.restaurant_id = rid
                        AND o.source_class <> ${VENUE_NAME_SOURCE_CLASS}
                    )
                    -- …and no product-counter venue-kind evidence
                    AND NOT EXISTS (
                      SELECT 1 FROM core_restaurant_attribute_evidence k
                      JOIN core_entities ke
                        ON ke.entity_id = k.attribute_id
                       AND ke.facet = 'venue_kind'
                       AND ke.status = 'active'
                      WHERE k.restaurant_id = rid
                        AND k.source_class <> ${VENUE_NAME_SOURCE_CLASS}
                        AND ke.name = ANY(${productKinds}::text[])
                    )
                  )
                )) AS attrs
      FROM unnest(${placeIds}::uuid[]) AS rid
    ) ev
    WHERE r.entity_id = ev.restaurant_id
      AND r.type = 'place'
  `;
}
