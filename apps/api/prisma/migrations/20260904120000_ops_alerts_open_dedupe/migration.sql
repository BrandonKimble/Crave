-- OPS-ALERT DEDUPE IS SCOPED TO OPEN ALERTS (red team 2026-09-04 G-6).
-- The table-wide unique on dedupe_key made every static key a PERMANENT
-- silencer: 'source-table-collapse:<table>' fired once per table for the
-- life of the database, and acknowledging did not re-arm it (the alarm's
-- own body text said it would). Uniqueness now holds only among alerts
-- nobody has acknowledged, so an ack re-arms the key. createMany with
-- skipDuplicates (ON CONFLICT DO NOTHING) honours partial uniques.
-- NOTE for AUTHORING.md class 1: `prisma migrate dev` cannot model this
-- partial index and will offer to DROP it — refuse.
DROP INDEX IF EXISTS "ops_alerts_dedupe_key_key";
CREATE UNIQUE INDEX "ops_alerts_open_dedupe_key"
  ON "ops_alerts" ("dedupe_key")
  WHERE "acknowledged_at" IS NULL;
CREATE INDEX "idx_ops_alerts_dedupe_key" ON "ops_alerts" ("dedupe_key");
