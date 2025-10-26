CREATE TABLE "entity_priority_metrics" (
    "entity_id" UUID NOT NULL,
    "entity_type" "entity_type" NOT NULL,
    "priority_score" DECIMAL(9,4) DEFAULT 0,
    "data_recency_score" DECIMAL(9,4) DEFAULT 0,
    "data_quality_score" DECIMAL(9,4) DEFAULT 0,
    "user_demand_score" DECIMAL(9,4) DEFAULT 0,
    "is_new_entity" BOOLEAN NOT NULL DEFAULT false,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_selected_at" TIMESTAMP(3),
    "query_impressions" INTEGER NOT NULL DEFAULT 0,
    "query_clicks" INTEGER NOT NULL DEFAULT 0,
    "last_query_at" TIMESTAMP(3),
    CONSTRAINT "entity_priority_metrics_pkey" PRIMARY KEY ("entity_id"),
    CONSTRAINT "entity_priority_metrics_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_entity_priority_metrics_type" ON "entity_priority_metrics"("entity_type");
CREATE INDEX "idx_entity_priority_metrics_calculated" ON "entity_priority_metrics"("last_calculated_at" DESC);
