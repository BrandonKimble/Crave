ALTER TABLE "core_markets"
  ADD CONSTRAINT "core_markets_active_locality_source_boundary_check"
  CHECK (
    "market_type" <> 'locality'::market_type
    OR "is_active" = false
    OR (
      "source_boundary_provider" IS NOT NULL
      AND "source_boundary_id" IS NOT NULL
      AND "source_boundary_type" IS NOT NULL
    )
  );
