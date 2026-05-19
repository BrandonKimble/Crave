ALTER TABLE "core_markets"
  ADD CONSTRAINT "core_markets_source_boundary_fkey"
  FOREIGN KEY (
    "source_boundary_provider",
    "source_boundary_id",
    "source_boundary_type"
  )
  REFERENCES "geo_boundary_features"(
    "source_provider",
    "source_boundary_id",
    "source_boundary_type"
  )
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
