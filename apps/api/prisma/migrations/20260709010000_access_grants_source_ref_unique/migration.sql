-- Idempotency backstop for the ledger: one live intent per (user, source,
-- sourceRef). comp is excluded (its sourceRef is a free-text note, not a key).
CREATE UNIQUE INDEX "access_grants_user_source_ref_key"
  ON "access_grants" ("user_id", "source", "source_ref")
  WHERE "source_ref" IS NOT NULL AND "source" <> 'comp';
