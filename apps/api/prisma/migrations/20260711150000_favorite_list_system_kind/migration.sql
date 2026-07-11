-- Auto-created default lists (page-registry §8.7): system_kind marks the four
-- signup-provisioned lists ('been' | 'want_to_go' | 'tried' | 'want_to_try').
-- NULL = a normal user list (Postgres treats NULLs as distinct, so the unique
-- only constrains the system rows — one of each kind per owner, ever).
ALTER TABLE "favorite_lists" ADD COLUMN "system_kind" VARCHAR(16);

CREATE UNIQUE INDEX "favorite_lists_owner_system_kind"
  ON "favorite_lists" ("owner_user_id", "system_kind");
