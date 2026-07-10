-- Promote grantedDays out of JSON metadata: the day/absolute split is now
-- schema-expressed. A grant is EITHER absolute (expires_at, NULL=lifetime)
-- OR a day grant (granted_days, coverage derived at read) — never both.
ALTER TABLE "access_grants" ADD COLUMN "granted_days" INTEGER;

-- Backfill from metadata (all historical day grants wrote metadata.grantedDays).
UPDATE "access_grants"
SET "granted_days" = ("metadata"->>'grantedDays')::int
WHERE "metadata" ? 'grantedDays';

-- Legacy pre-derivation day grants stored absolute expiries alongside the
-- metadata; the column takes precedence, so clear their expiry to make the
-- either/or invariant true before enforcing it.
UPDATE "access_grants"
SET "expires_at" = NULL
WHERE "granted_days" IS NOT NULL AND "expires_at" IS NOT NULL;

ALTER TABLE "access_grants"
  ADD CONSTRAINT "access_grants_day_xor_absolute"
  CHECK ("granted_days" IS NULL OR "expires_at" IS NULL);
