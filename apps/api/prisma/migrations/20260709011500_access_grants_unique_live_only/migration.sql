-- The idempotency backstop applies to LIVE rows only: a revoked grant must
-- not block re-granting the same intent (e.g. PRODUCT_CHANGE moving a
-- subscription's sourceRef to a new entitlement code, or an uncancellation).
DROP INDEX "access_grants_user_source_ref_key";
CREATE UNIQUE INDEX "access_grants_user_source_ref_key"
  ON "access_grants" ("user_id", "source", "source_ref")
  WHERE "source_ref" IS NOT NULL AND "source" <> 'comp' AND "revoked_at" IS NULL;
