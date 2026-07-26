-- LISTS canonicalization (owner-ratified 2026-07-26).
--
-- NAMING CHOICE (recorded per the ratification): the user-list trio becomes
-- user_lists / user_list_items / user_list_collaborators / user_list_share_events.
-- Bare "lists" was rejected as too generic in SQL and mentally collides with
-- curated_lists; the user_ vs curated_ prefix symmetry IS the disambiguation
-- the owner asked for.
--
-- Pure renames (tables, enums, constraints, indexes) so prisma migrate deploy
-- and the generated client agree on every mapped name, then the kind law.

-- ── Tables ──────────────────────────────────────────────────────────────────
ALTER TABLE "favorite_lists" RENAME TO "user_lists";
ALTER TABLE "favorite_list_items" RENAME TO "user_list_items";
ALTER TABLE "list_collaborators" RENAME TO "user_list_collaborators";
ALTER TABLE "favorite_list_share_events" RENAME TO "user_list_share_events";

-- ── Enums ───────────────────────────────────────────────────────────────────
ALTER TYPE "favorite_list_type" RENAME TO "user_list_type";
ALTER TYPE "favorite_list_visibility" RENAME TO "user_list_visibility";
ALTER TYPE "favorite_list_share_event_type" RENAME TO "user_list_share_event_type";

-- ── Constraints (PKs, FKs, checks — table renames don't rename these) ───────
ALTER TABLE "user_lists" RENAME CONSTRAINT "favorite_lists_pkey" TO "user_lists_pkey";
ALTER TABLE "user_lists" RENAME CONSTRAINT "favorite_lists_owner_user_id_fkey" TO "user_lists_owner_user_id_fkey";

ALTER TABLE "user_list_items" RENAME CONSTRAINT "favorite_list_items_pkey" TO "user_list_items_pkey";
ALTER TABLE "user_list_items" RENAME CONSTRAINT "favorite_list_items_one_target" TO "user_list_items_one_target";
ALTER TABLE "user_list_items" RENAME CONSTRAINT "favorite_list_items_list_id_fkey" TO "user_list_items_list_id_fkey";
ALTER TABLE "user_list_items" RENAME CONSTRAINT "favorite_list_items_added_by_user_id_fkey" TO "user_list_items_added_by_user_id_fkey";
ALTER TABLE "user_list_items" RENAME CONSTRAINT "favorite_list_items_restaurant_id_fkey" TO "user_list_items_restaurant_id_fkey";
ALTER TABLE "user_list_items" RENAME CONSTRAINT "favorite_list_items_connection_id_fkey" TO "user_list_items_connection_id_fkey";
ALTER TABLE "user_list_items" RENAME CONSTRAINT "favorite_list_items_location_id_fkey" TO "user_list_items_location_id_fkey";

ALTER TABLE "user_list_collaborators" RENAME CONSTRAINT "list_collaborators_pkey" TO "user_list_collaborators_pkey";
ALTER TABLE "user_list_collaborators" RENAME CONSTRAINT "list_collaborators_list_id_fkey" TO "user_list_collaborators_list_id_fkey";
ALTER TABLE "user_list_collaborators" RENAME CONSTRAINT "list_collaborators_user_id_fkey" TO "user_list_collaborators_user_id_fkey";
ALTER TABLE "user_list_collaborators" RENAME CONSTRAINT "list_collaborators_invited_by_user_id_fkey" TO "user_list_collaborators_invited_by_user_id_fkey";

ALTER TABLE "user_list_share_events" RENAME CONSTRAINT "favorite_list_share_events_pkey" TO "user_list_share_events_pkey";
ALTER TABLE "user_list_share_events" RENAME CONSTRAINT "favorite_list_share_events_list_id_fkey" TO "user_list_share_events_list_id_fkey";

-- ── Indexes ─────────────────────────────────────────────────────────────────
ALTER INDEX "favorite_lists_owner_type_name" RENAME TO "user_lists_owner_type_name";
ALTER INDEX "favorite_lists_share_slug_key" RENAME TO "user_lists_share_slug_key";
ALTER INDEX "idx_favorite_lists_owner" RENAME TO "idx_user_lists_owner";
ALTER INDEX "idx_favorite_lists_visibility" RENAME TO "idx_user_lists_visibility";
ALTER INDEX "idx_favorite_lists_type" RENAME TO "idx_user_lists_type";
ALTER INDEX "idx_favorite_lists_updated_at" RENAME TO "idx_user_lists_updated_at";
ALTER INDEX "favorite_list_items_list_restaurant" RENAME TO "user_list_items_list_restaurant";
ALTER INDEX "favorite_list_items_list_connection" RENAME TO "user_list_items_list_connection";
ALTER INDEX "idx_favorite_list_items_list" RENAME TO "idx_user_list_items_list";
ALTER INDEX "idx_favorite_list_items_restaurant" RENAME TO "idx_user_list_items_restaurant";
ALTER INDEX "idx_favorite_list_items_connection" RENAME TO "idx_user_list_items_connection";
ALTER INDEX "idx_favorite_list_items_added_by" RENAME TO "idx_user_list_items_added_by";
ALTER INDEX "idx_list_collaborators_user" RENAME TO "idx_user_list_collaborators_user";
ALTER INDEX "favorite_list_share_events_dedupe_key" RENAME TO "user_list_share_events_dedupe_key";
ALTER INDEX "idx_favorite_list_share_events_list" RENAME TO "idx_user_list_share_events_list";
ALTER INDEX "idx_favorite_list_share_events_type" RENAME TO "idx_user_list_share_events_type";

-- ── The kind law (Spotify Liked-Songs model) ────────────────────────────────
-- system_kind already carried the four signup-default kinds; it CANONICALIZES
-- into `kind` rather than living next to a second kind-ish column:
--   kind ∈ 'standard' | 'favorites' | 'been' | 'want_to_go' | 'tried' | 'want_to_try'.
-- The 'standard' fill below is the NULL→'standard' spelling change for
-- existing normal lists — it is NOT a favorites backfill: nobody has a
-- favorites-kind list yet; that list is LAZILY created on first heart.
ALTER TABLE "user_lists" RENAME COLUMN "system_kind" TO "kind";
-- Ordering is load-bearing: the OLD unique (favorite_lists_owner_system_kind,
-- now covering the renamed column, NULLs-distinct) must drop BEFORE the
-- NULL->'standard' fill — with it live, a user's second normal list becomes
-- a duplicate ('standard','standard') and the fill P2002s (bitten locally
-- 2026-07-26).
DROP INDEX "favorite_lists_owner_system_kind";
UPDATE "user_lists" SET "kind" = 'standard' WHERE "kind" IS NULL;
ALTER TABLE "user_lists" ALTER COLUMN "kind" SET DEFAULT 'standard';
ALTER TABLE "user_lists" ALTER COLUMN "kind" SET NOT NULL;

-- One row per (owner, non-standard kind): subsumes the old
-- favorite_lists_owner_system_kind once-ever contract AND enforces at most
-- ONE kind='favorites' list per owner. Partial — any number of 'standard'
-- lists. (Not expressible in Prisma schema; documented on the model.)
CREATE UNIQUE INDEX "user_lists_owner_kind"
  ON "user_lists" ("owner_user_id", "kind")
  WHERE "kind" <> 'standard';
