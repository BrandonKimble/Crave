-- S4 market membership at grounding (hand-authored, 2026-08-26).
--
-- core_entities.market_excluded_at: the stored market-membership verdict
-- for place entities. Non-NULL = every geocoded location of the place sits
-- outside every crediting community's market (the community's engine
-- territory geometry, or within 50 miles of its centroid — the
-- v16-defect-sizing class-4 definition). Search membership and the public
-- score pool read `market_excluded_at IS NULL`; the row itself is NEVER
-- deleted (place-grounded restaurants are never deleted).
--
-- Plain nullable ADD COLUMN — no table rewrite (AUTHORING.md §1), no
-- parallel-worker guard needed. The corpus sweep runs through the
-- MarketMembershipService reconciler (app code), not here: the verdict
-- depends on PostGIS territory geometry and active-run event scope, and a
-- migration-time copy of that SQL would be a second definition that drifts.

ALTER TABLE "core_entities"
  ADD COLUMN "market_excluded_at" TIMESTAMPTZ(3);
