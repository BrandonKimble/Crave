-- Drop legacy scalar scoring columns now replaced by slice selection + attempt history.
ALTER TABLE "collection_entity_priority_metrics"
  DROP COLUMN "priority_score",
  DROP COLUMN "data_recency_score",
  DROP COLUMN "data_quality_score",
  DROP COLUMN "user_demand_score",
  DROP COLUMN "is_new_entity",
  DROP COLUMN "last_selected_at";
