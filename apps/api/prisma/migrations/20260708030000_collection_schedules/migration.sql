CREATE TABLE "collection_schedules" (
    "community" VARCHAR(255) NOT NULL,
    "work_kind" VARCHAR(32) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "interval_days" DOUBLE PRECISION NOT NULL,
    "next_due_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_ran_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_schedules_pkey" PRIMARY KEY ("community", "work_kind")
);
CREATE INDEX "idx_collection_schedules_due" ON "collection_schedules"("enabled", "next_due_at");
