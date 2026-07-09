-- Collection workKind: make invalid kinds unrepresentable
CREATE TYPE "CollectionWorkKind" AS ENUM ('chronological', 'keyword', 'on_demand_hot_spike');
ALTER TABLE "collection_schedules"
  ALTER COLUMN "work_kind" TYPE "CollectionWorkKind" USING "work_kind"::"CollectionWorkKind";

-- Usage ledger: idempotency by key, not statement ordering
ALTER TABLE "api_usage_ledger" ADD COLUMN "dedupe_key" VARCHAR(256);
CREATE UNIQUE INDEX "api_usage_ledger_dedupe_key_key" ON "api_usage_ledger"("dedupe_key");
