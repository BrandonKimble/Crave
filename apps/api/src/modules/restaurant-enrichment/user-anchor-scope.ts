/**
 * THE USER-ANCHOR PREDICATE — one home, never hand-copied (grounding red
 * team 2026-08-31; the servable-place-scope pattern: pure SQL fragments
 * consumers embed via `Prisma.raw`, so the meaning of "a user points at
 * this entity" cannot fork across readers).
 *
 * AUTHORITY AND DRIFT: `scripts/reload/preserved-anchors.sql` is the
 * AUTHORITATIVE statement of the anchor law for the WIPE path — it builds
 * the preserved sets (temp tables), carries the FK-policy legend, the
 * transitive redirect closure, and the place-grounded RESTAURANT LAW (the
 * ~$118 lesson), none of which belong in a live per-entity predicate. This
 * module MIRRORS its per-entity anchor sources for runtime consumers (the
 * janitor's never-archive-a-user-anchored-entity guard). Drift between the
 * two is prevented by `user-anchor-scope.spec.ts`, which extracts the
 * roster of anchor SOURCE TABLES from both files and asserts set equality
 * — a roster invariant, not a semantics proof, so a NEW anchor source
 * added to either file fails the spec until it appears in both.
 *
 * Before this file, the janitor hand-copied 2 of the ~8 entity anchor
 * sources (user_list_items direct + via connection) — a poll target, a
 * shared entity in a DM, a photo, a curated-list row, or a signal was NOT
 * enough to keep an ungroundable entity from being archived.
 *
 * Deliberately NOT mirrored here (wipe-only concerns): the transitive
 * redirect closure (a live active entity is not a merge loser) and the
 * grounded-restaurant law (the janitor's gate already requires
 * NO grounded location separately).
 */

/**
 * SQL boolean: some user data points at `${alias}.entity_id`
 * (core_entities alias). Embed via `Prisma.raw` inside a larger WHERE.
 */
export function userAnchoredEntitySql(alias: string): string {
  const id = `${alias}.entity_id`;
  return `(
    -- poll topics: targets and the category/seed uuid[] arrays (no FK — sole)
    EXISTS (
      SELECT 1 FROM poll_topics pt
      WHERE pt.target_dish_id = ${id}
         OR pt.target_restaurant_id = ${id}
         OR pt.target_food_attribute_id = ${id}
         OR pt.target_restaurant_attribute_id = ${id}
         OR ${id} = ANY(pt.category_entity_ids)
         OR ${id} = ANY(pt.seed_entity_ids)
    )
    -- user list items (direct restaurant anchor)
    OR EXISTS (
      SELECT 1 FROM user_list_items uli WHERE uli.restaurant_id = ${id}
    )
    -- photos
    OR EXISTS (
      SELECT 1 FROM photos ph WHERE ph.restaurant_id = ${id}
    )
    -- curated list items (entity or restaurant axis; Cascade — sole)
    OR EXISTS (
      SELECT 1 FROM curated_list_items cli
      WHERE cli.entity_id = ${id} OR cli.restaurant_id = ${id}
    )
    -- on-demand requests
    OR EXISTS (
      SELECT 1 FROM collection_on_demand_requests odr
      WHERE odr.entity_id = ${id}
    )
    -- signal acts: raw ledger AND the durable daily aggregate (uuid
    -- columns, no FK — sole); see preserved-anchors.sql for why both.
    -- NO ::text here (red team 2026-09-04, CI wave 0c): both subject_id
    -- columns are uuid, and casting the entity id to text made the whole
    -- predicate 'uuid = text' — the janitor's ungroundable gate threw on
    -- every run since the shared predicate landed, and the spec that
    -- proves it sat behind a CI step nobody had seen green in 25 days.
    OR EXISTS (
      SELECT 1 FROM signals s
      WHERE s.subject_type = 'entity' AND s.subject_id = ${id}
    )
    OR EXISTS (
      SELECT 1 FROM signal_demand_daily sdd
      WHERE sdd.subject_type = 'entity' AND sdd.subject_id = ${id}
    )
    -- poll endorsements: bare uuid subject, or either half of the
    -- poll-local 'restaurantId::foodId' composite (no FK — sole)
    OR EXISTS (
      SELECT 1 FROM poll_endorsements pe
      WHERE pe.subject_id = ${id}::text
         OR pe.subject_id LIKE ${id}::text || '::%'
         OR pe.subject_id LIKE '%::' || ${id}::text
    )
    -- DM entity shares (F1250): bare text id, no FK — sole
    OR EXISTS (
      SELECT 1 FROM messages m
      WHERE m.kind = 'entity_share'
        AND m.shared_entity_kind IN ('restaurant', 'dish')
        AND m.shared_entity_id = ${id}::text
    )
    -- poll comment entity spans (F4936): GIN containment on the derived
    -- span array; non-array entity_spans simply fail containment.
    OR EXISTS (
      SELECT 1 FROM poll_comments pc
      WHERE pc.entity_spans @> jsonb_build_array(
        jsonb_build_object('entityId', ${id}::text)
      )
    )
    -- transitively via an anchored connection: a dish/restaurant reached
    -- through a core_restaurant_items row whose connection user data
    -- points at (user_list_items / photos / curated_list_items)
    OR EXISTS (
      SELECT 1 FROM core_restaurant_items ri
      WHERE (ri.restaurant_id = ${id} OR ri.food_id = ${id})
        AND (
          EXISTS (SELECT 1 FROM user_list_items uli2
                  WHERE uli2.connection_id = ri.connection_id)
          OR EXISTS (SELECT 1 FROM photos ph2
                     WHERE ph2.connection_id = ri.connection_id)
          OR EXISTS (SELECT 1 FROM curated_list_items cli2
                     WHERE cli2.connection_id = ri.connection_id)
        )
    )
  )`;
}
