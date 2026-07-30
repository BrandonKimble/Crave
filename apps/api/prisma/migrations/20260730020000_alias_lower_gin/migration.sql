-- Gazetteer alias arm, indexed (search rebuild phase 1, slice 1).
-- The scan's old shape — lower(name) = ANY(...) OR EXISTS(unnest(aliases))
-- — forced a full seq scan: the OR defeats the name btree and per-row
-- unnest cannot use any index (measured: 18.8k rows filtered per scan,
-- 3.8s on a 5k-token adversarial query). Fix is a UNION of two indexed
-- arms; this migration supplies the alias arm's index: an IMMUTABLE
-- element-wise lowercase of the alias array, GIN-indexed with array ops,
-- so `crave_text_array_lower(aliases) && ARRAY[...]` is an index probe.
CREATE OR REPLACE FUNCTION crave_text_array_lower(arr text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT array_agg(lower(x)) FROM unnest(arr) AS x $$;

CREATE INDEX IF NOT EXISTS idx_core_entities_aliases_lower_gin
  ON core_entities USING gin (crave_text_array_lower(aliases));
