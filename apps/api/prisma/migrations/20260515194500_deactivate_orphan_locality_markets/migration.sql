-- Locality markets must be backed by a provider-neutral boundary identity.
-- Legacy local_fallback rows were converted to locality before TomTom source
-- boundary identity existed. Keep the historical rows for references, but make
-- them non-runtime so active search/poll flows can recreate locality markets
-- from real geo_boundary_features rows.

UPDATE "core_markets"
SET
  "is_active" = false,
  "is_collectable" = false,
  "scheduler_enabled" = false,
  "metadata" = COALESCE("metadata", '{}'::jsonb) || jsonb_build_object(
    'deactivatedReason',
    'missing_source_boundary_identity',
    'deactivatedByMigration',
    '20260515194500_deactivate_orphan_locality_markets'
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "market_type" = 'locality'::market_type
  AND (
    "source_boundary_provider" IS NULL
    OR "source_boundary_id" IS NULL
    OR "source_boundary_type" IS NULL
  );
