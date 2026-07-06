CREATE TABLE "api_usage_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "service" VARCHAR(32) NOT NULL,
    "operation" VARCHAR(64) NOT NULL,
    "sku_tier" VARCHAR(32),
    "model" VARCHAR(128),
    "mode" VARCHAR(16),
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "cached_tokens" INTEGER,
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "caller" VARCHAR(128) NOT NULL,
    "run_key" VARCHAR(256),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "api_usage_ledger_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "idx_api_usage_service_created" ON "api_usage_ledger"("service", "created_at");
CREATE INDEX "idx_api_usage_run_key" ON "api_usage_ledger"("run_key");
