CREATE TABLE "access_grants" (
    "grant_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "entitlement_code" VARCHAR(64) NOT NULL,
    "source" VARCHAR(32) NOT NULL,
    "source_ref" VARCHAR(256),
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" VARCHAR(256),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "access_grants_pkey" PRIMARY KEY ("grant_id"),
    CONSTRAINT "access_grants_user_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE
);
CREATE INDEX "idx_access_grants_user_code" ON "access_grants"("user_id", "entitlement_code");
CREATE INDEX "idx_access_grants_source" ON "access_grants"("source");
CREATE INDEX "idx_access_grants_expires" ON "access_grants"("expires_at");
