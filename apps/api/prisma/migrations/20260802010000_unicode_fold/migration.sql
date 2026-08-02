-- FINAL RED TEAM F3: the canonical fold was Unicode-blind — `[^a-z0-9]+`
-- turned every accented char and curly apostrophe into a SPACE, so
-- "crème brûlée"/"creme brulee" and "Grizzelda's"/"Grizzelda’s" held
-- DIFFERENT identity keys: the unique index and the advisory lock were
-- both blind to the twin. This migration centralizes THE fold as one
-- immutable DB function, crave_fold(text), mirrored byte-for-byte by
-- canonicalFold() in entity-identity.ts — every SQL fold site now calls
-- the function so the two implementations cannot drift one site at a time.

-- Serial plans (learned 2026-08-02): prod /dev/shm cannot host parallel
-- workers' DSM segments for the STORED-column table rewrite.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

CREATE OR REPLACE FUNCTION crave_fold(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT AS $$
  SELECT btrim(regexp_replace(regexp_replace(
    translate(lower(t),
      'àáâãäåāăąçćčèéêëēĕėęěìíîïĩīĭįñńňòóôõöøōŏőùúûüũūŭůűųýÿžźżšśşğłđřťßæœ',
      'aaaaaaaaaccceeeeeeeeeiiiiiiiinnnooooooooouuuuuuuuuuyyzzzsssgldrtsao'),
    '[''’‘ʼ]', '', 'g'), '[^a-z0-9]+', ' ', 'g'))
$$;

-- Self-healing pre-dedupe under the NEW fold (same law as 20260801230000):
-- any (type, new-key) group with >1 active attribute row keeps the most
-- evidenced; the rest archive with redirects.
CREATE TEMP TABLE fold_dupes AS
SELECT e.entity_id AS from_id,
  (SELECT k.entity_id FROM core_entities k
   WHERE k.type = e.type AND k.status <> 'archived'
     AND crave_fold(k.name) = crave_fold(e.name)
   ORDER BY (SELECT count(*) FROM core_restaurant_entity_events ev WHERE ev.entity_id = k.entity_id) DESC,
            k.created_at
   LIMIT 1) AS to_id
FROM core_entities e
WHERE e.type IN ('food_attribute','restaurant_attribute') AND e.status <> 'archived'
  AND EXISTS (
    SELECT 1 FROM core_entities o
    WHERE o.type = e.type AND o.status <> 'archived' AND o.entity_id <> e.entity_id
      AND crave_fold(o.name) = crave_fold(e.name)
  );
DELETE FROM fold_dupes WHERE from_id = to_id;
UPDATE core_entities SET status = 'archived'
WHERE entity_id IN (SELECT from_id FROM fold_dupes);
INSERT INTO entity_redirects (from_entity_id, to_entity_id)
SELECT from_id, to_id FROM fold_dupes
ON CONFLICT (from_entity_id) DO NOTHING;

ALTER TABLE core_entities DROP COLUMN IF EXISTS identity_key;
ALTER TABLE core_entities
  ADD COLUMN identity_key TEXT
  GENERATED ALWAYS AS (crave_fold(name)) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS uq_attribute_identity_key
  ON core_entities (type, identity_key)
  WHERE status <> 'archived'
    AND type IN ('food_attribute', 'restaurant_attribute');
CREATE INDEX IF NOT EXISTS idx_entities_type_identity_key
  ON core_entities (type, identity_key);
