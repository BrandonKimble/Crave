DROP INDEX IF EXISTS "uq_search_demand_daily_scope";

CREATE UNIQUE INDEX "uq_search_demand_daily_scope"
  ON "user_search_demand_daily" (
    "demand_date",
    "user_id",
    "market_key",
    "collectable_market_key",
    "subject_kind",
    "subject_key",
    "entity_id",
    "entity_type",
    "source_kind",
    "signal_kind",
    "reason"
  ) NULLS NOT DISTINCT;
