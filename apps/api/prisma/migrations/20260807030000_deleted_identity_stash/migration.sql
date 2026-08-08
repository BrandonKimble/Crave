-- D148 — the deletion-time identity stash.
--
-- Deletion is now ANONYMOUS FROM THE FIRST MOMENT: deleteAccount moves
-- {username, displayName, avatarUrl} out of the visible columns and into this
-- JSONB stash, and restoreAccount moves them back. NULL is unique-safe here —
-- `username` is a NULLABLE citext, so many nulled shells coexist and no
-- tombstone value is needed.
--
-- The CHECK is the whole integrity story: a stash may only exist on a row that
-- is actually deleted. A live account carrying a stash would mean the restore
-- lost a race, and this refuses to record that state at all.
--
-- LIGHTWEIGHT: adding a nullable column with no default is a catalog-only
-- change in Postgres (no table rewrite), and the CHECK's validation scan is a
-- single pass over a small table. No parallel-worker guard is required (see
-- prisma/migrations/AUTHORING.md §1, which scopes that rule to rewrites and
-- unbounded UPDATEs).

ALTER TABLE "users" ADD COLUMN "deleted_identity" JSONB;

ALTER TABLE "users"
  ADD CONSTRAINT "users_deleted_identity_requires_deleted_at"
  CHECK ("deleted_at" IS NOT NULL OR "deleted_identity" IS NULL);
