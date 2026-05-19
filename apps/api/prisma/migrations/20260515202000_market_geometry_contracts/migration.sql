-- Regional rows are app-owned, but their active geometry must be TomTom-backed.
-- If this migration runs after the old regional-key migration but before seed,
-- prevent migrated Census geometry from remaining active as authoritative shape.
UPDATE core_markets
SET
  is_active = false,
  is_collectable = false,
  scheduler_enabled = false,
  geometry = NULL,
  bbox_ne_latitude = NULL,
  bbox_ne_longitude = NULL,
  bbox_sw_latitude = NULL,
  bbox_sw_longitude = NULL,
  metadata = COALESCE(metadata, '{}'::jsonb) ||
    jsonb_build_object(
      'deactivatedReason',
      'stale_regional_geometry_requires_tomtom_seed'
    ),
  updated_at = now()
WHERE market_type = 'regional'::market_type
  AND is_active = true
  AND COALESCE(metadata->>'source', '') <> 'tomtom_boundary_union';

-- Active locality rows must be backed by the runtime TomTom Municipality source
-- boundary contract, not merely any provider boundary row.
UPDATE core_markets
SET
  is_active = false,
  metadata = COALESCE(metadata, '{}'::jsonb) ||
    jsonb_build_object(
      'deactivatedReason',
      'active_locality_requires_tomtom_municipality_boundary'
    ),
  updated_at = now()
WHERE market_type = 'locality'::market_type
  AND is_active = true
  AND NOT (
    source_boundary_provider = 'tomtom'
    AND source_boundary_id IS NOT NULL
    AND source_boundary_type = 'Municipality'
  );

ALTER TABLE core_markets
  DROP CONSTRAINT IF EXISTS core_markets_active_locality_source_boundary_check;

ALTER TABLE core_markets
  ADD CONSTRAINT core_markets_active_locality_source_boundary_check
  CHECK (
    market_type <> 'locality'::market_type
    OR is_active = false
    OR (
      source_boundary_provider = 'tomtom'
      AND source_boundary_id IS NOT NULL
      AND source_boundary_type = 'Municipality'
    )
  );
