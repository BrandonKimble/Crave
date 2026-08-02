-- CLASS ④ closing move: the DB backstop for entity identity, scoped to
-- what can be enforced TODAY without lying:
--   - ATTRIBUTES get a generated stripped-key column + partial UNIQUE
--     (their vocabulary is now duplicate-free; a twin becomes impossible,
--     not just unlikely).
--   - FOODS stay lock+probe+nightly-sweep protected (their identity key
--     needs the TS lemma fold — no SQL expression can compute it).
--   - RESTAURANTS are deliberately EXCLUDED: legitimate chain branches
--     share a stripped name (Blaze Pizza x2); a unique index would forbid
--     them. Blocked on the P2.2 chain/branch model.

-- SERIAL EXECUTION (learned on prod 2026-08-02): the STORED-column table
-- rewrite + index rebuilds tried to grab a ~1GB dynamic shared memory
-- segment for parallel workers and died on the container's small /dev/shm
-- ("could not resize shared memory segment ... No space left on device").
-- Serial plans use local memory and spill to disk instead.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TABLE core_entities
  ADD COLUMN IF NOT EXISTS identity_key TEXT
  GENERATED ALWAYS AS (
    btrim(regexp_replace(regexp_replace(lower(name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
  ) STORED;

-- SELF-HEALING pre-dedupe (red team: prod's vocabulary drifts between the
-- snapshot and the deploy — one new duplicate would abort this migration
-- and crash-loop every boot). Generic: for any (type, key) group with >1
-- active attribute row, the most-evidenced survives; the rest archive
-- with redirects.
CREATE TEMP TABLE attr_key_dupes AS
SELECT e.entity_id AS from_id,
  (SELECT k.entity_id FROM core_entities k
   WHERE k.type = e.type AND k.status <> 'archived'
     AND btrim(regexp_replace(regexp_replace(lower(k.name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
       = btrim(regexp_replace(regexp_replace(lower(e.name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
   ORDER BY (SELECT count(*) FROM core_restaurant_entity_events ev WHERE ev.entity_id = k.entity_id) DESC,
            k.created_at
   LIMIT 1) AS to_id
FROM core_entities e
WHERE e.type IN ('food_attribute','restaurant_attribute') AND e.status <> 'archived'
  AND EXISTS (
    SELECT 1 FROM core_entities o
    WHERE o.type = e.type AND o.status <> 'archived' AND o.entity_id <> e.entity_id
      AND btrim(regexp_replace(regexp_replace(lower(o.name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
        = btrim(regexp_replace(regexp_replace(lower(e.name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
  );
DELETE FROM attr_key_dupes WHERE from_id = to_id;
UPDATE core_entities SET status = 'archived'
WHERE entity_id IN (SELECT from_id FROM attr_key_dupes);
INSERT INTO entity_redirects (from_entity_id, to_entity_id)
SELECT from_id, to_id FROM attr_key_dupes
ON CONFLICT (from_entity_id) DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_identity_key
  ON core_entities (type, identity_key)
  WHERE status <> 'archived'
    AND type IN ('food_attribute', 'restaurant_attribute');

-- non-unique support index for the stripped-name probes (they were seq
-- scans inside the entity-creation transaction)
CREATE INDEX IF NOT EXISTS idx_entities_type_identity_key
  ON core_entities (type, identity_key);
