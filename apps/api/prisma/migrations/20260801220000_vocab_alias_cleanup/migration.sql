-- CLASS ④ (data audit 2026-08): attribute vocabulary + alias cleanup.
-- All shapes follow the class-② laws: reclassified → redirect + repoint
-- (type-shape fixed), duplicate → redirect to most-evidenced survivor,
-- rejected → sink (archive, events deleted, future mentions drop).

-- ---- 1. OCCASION food_attributes → their restaurant_attribute twins
CREATE TEMP TABLE occasion_map AS
SELECT fa.entity_id AS from_id, ra.entity_id AS to_id
FROM core_entities fa
JOIN LATERAL (
  SELECT ra.entity_id FROM core_entities ra
  WHERE ra.type = 'restaurant_attribute' AND ra.status = 'active'
    AND btrim(regexp_replace(regexp_replace(lower(ra.name), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
        IN (
          btrim(regexp_replace(regexp_replace(lower(fa.name), '[^a-z0-9 ]', '', 'g'), '\s+', ' ', 'g')),
          CASE lower(fa.name)
            WHEN 'seasonal' THEN 'seasonal menu'
            WHEN 'late-night' THEN 'late night'
            WHEN 'all you can eat' THEN 'allyoucaneat'
          END
        )
  ORDER BY (SELECT count(*) FROM core_restaurant_entity_events ev WHERE ev.entity_id = ra.entity_id) DESC
  LIMIT 1
) ra ON true
WHERE fa.type = 'food_attribute' AND fa.status = 'active'
  AND lower(fa.name) IN ('lunch','seasonal','weekend special','happy hour',
    'late-night','all you can eat','family style','street food');

UPDATE core_entities SET status = 'archived'
WHERE entity_id IN (SELECT from_id FROM occasion_map);
INSERT INTO entity_redirects (from_entity_id, to_entity_id)
SELECT from_id, to_id FROM occasion_map
ON CONFLICT (from_entity_id) DO NOTHING;

-- occasion words WITHOUT a twin are rejected outright (sink)
CREATE TEMP TABLE occasion_sinks AS
SELECT entity_id FROM core_entities
WHERE type = 'food_attribute' AND status = 'active'
  AND lower(name) IN ('drunk food','off menu','limited edition');
UPDATE core_entities SET status = 'archived'
WHERE entity_id IN (SELECT entity_id FROM occasion_sinks);
DELETE FROM core_restaurant_entity_events
WHERE entity_id IN (SELECT entity_id FROM occasion_sinks);

-- ---- 2. duplicate ACTIVE restaurant_attribute names → survivor
CREATE TEMP TABLE attr_dup_map AS
SELECT e.entity_id AS from_id,
  (SELECT k.entity_id FROM core_entities k
   WHERE k.type = e.type AND k.status = 'active' AND lower(k.name) = lower(e.name)
   ORDER BY (SELECT count(*) FROM core_restaurant_entity_events ev WHERE ev.entity_id = k.entity_id) DESC,
            k.created_at
   LIMIT 1) AS to_id
FROM core_entities e
WHERE e.type = 'restaurant_attribute' AND e.status = 'active'
  AND EXISTS (SELECT 1 FROM core_entities o
              WHERE o.type = e.type AND o.status = 'active'
                AND lower(o.name) = lower(e.name) AND o.entity_id <> e.entity_id);
DELETE FROM attr_dup_map WHERE from_id = to_id;
UPDATE core_entities SET status = 'archived'
WHERE entity_id IN (SELECT from_id FROM attr_dup_map);
INSERT INTO entity_redirects (from_entity_id, to_entity_id)
SELECT from_id, to_id FROM attr_dup_map
ON CONFLICT (from_entity_id) DO NOTHING;

-- ---- 3. redirected-attribute event drain (both maps; type-shape fix)
CREATE TEMP TABLE attr_redirects AS
SELECT from_id, to_id FROM occasion_map
UNION SELECT from_id, to_id FROM attr_dup_map;
WITH candidates AS (
  SELECT DISTINCT ON (ev.extraction_run_id, ev.source_document_id,
                      ev.restaurant_id, m.to_id)
    ev.event_id, m.to_id
  FROM core_restaurant_entity_events ev
  JOIN attr_redirects m ON m.from_id = ev.entity_id
  WHERE NOT EXISTS (
    SELECT 1 FROM core_restaurant_entity_events dup
    WHERE dup.extraction_run_id = ev.extraction_run_id
      AND dup.source_document_id = ev.source_document_id
      AND dup.restaurant_id = ev.restaurant_id
      AND dup.entity_id = m.to_id
      AND dup.evidence_type = 'restaurant_attribute'
  )
  ORDER BY ev.extraction_run_id, ev.source_document_id,
           ev.restaurant_id, m.to_id, ev.event_id
)
UPDATE core_restaurant_entity_events ev
SET entity_id = candidates.to_id,
    entity_type = 'restaurant_attribute',
    evidence_type = 'restaurant_attribute'
FROM candidates WHERE ev.event_id = candidates.event_id;
DELETE FROM core_restaurant_entity_events ev
USING attr_redirects m WHERE m.from_id = ev.entity_id;

-- ---- 4. rename hazard + size-concept merge
UPDATE core_entities SET name = 'frozen drink',
  aliases = (SELECT array_agg(DISTINCT a) FROM unnest(aliases || ARRAY['frozen']) a)
WHERE type = 'food_attribute' AND status = 'active' AND lower(name) = 'frozen';
WITH jumbo AS (
  SELECT j.entity_id AS from_id, g.entity_id AS to_id
  FROM core_entities j, core_entities g
  WHERE j.type='food_attribute' AND j.status='active' AND lower(j.name)='jumbo'
    AND g.type='food_attribute' AND g.status='active' AND lower(g.name)='generous portions'
), arch AS (
  UPDATE core_entities SET status='archived'
  WHERE entity_id IN (SELECT from_id FROM jumbo)
  RETURNING entity_id
)
INSERT INTO entity_redirects (from_entity_id, to_entity_id)
SELECT from_id, to_id FROM jumbo
ON CONFLICT (from_entity_id) DO NOTHING;

-- ---- 5. junk aliases: machine-templated + sentiment-prefixed
UPDATE core_entities e SET aliases = COALESCE((
  SELECT array_agg(a) FROM unnest(e.aliases) a
  WHERE a !~* '(cuisine|shop food|restaurant)$'
    AND a !~* '^(great|incredible|amazing|spectacular|fantastic|underrated|solid|huge|decent|awesome|perfect|excellent) '
    AND NOT (a ~* ' food$' AND a !~* '^(comfort|soul|fast|street|pub|bar|thai|junk)')
), '{}')
WHERE status = 'active' AND type IN ('food_attribute','restaurant_attribute')
  AND EXISTS (
    SELECT 1 FROM unnest(e.aliases) a
    WHERE a ~* '(cuisine|shop food|restaurant)$'
       OR a ~* '^(great|incredible|amazing|spectacular|fantastic|underrated|solid|huge|decent|awesome|perfect|excellent) '
       OR (a ~* ' food$' AND a !~* '^(comfort|soul|fast|street|pub|bar|thai|junk)')
  );

-- ---- 6. alias hygiene rules
-- (a) an alias may never equal an ACTIVE same-type entity's NAME
UPDATE core_entities e SET aliases = COALESCE((
  SELECT array_agg(a) FROM unnest(e.aliases) a
  WHERE NOT EXISTS (
    SELECT 1 FROM core_entities o
    WHERE o.type = e.type AND o.status = 'active'
      AND lower(o.name) = lower(a) AND o.entity_id <> e.entity_id
  )
), '{}')
WHERE e.status = 'active'
  AND EXISTS (
    SELECT 1 FROM unnest(e.aliases) a
    JOIN core_entities o ON o.type = e.type AND o.status = 'active'
      AND lower(o.name) = lower(a) AND o.entity_id <> e.entity_id
  );
-- (b) same alias on 2+ active same-type rows: keep on most-evidenced
CREATE TEMP TABLE alias_owners AS
SELECT lower(a) AS alias, e.type, e.entity_id,
  row_number() OVER (PARTITION BY lower(a), e.type
    ORDER BY (SELECT count(*) FROM core_restaurant_entity_events ev
              WHERE ev.entity_id = e.entity_id) DESC, e.created_at) AS rn
FROM core_entities e, unnest(e.aliases) a
WHERE e.status = 'active';
UPDATE core_entities e SET aliases = COALESCE((
  SELECT array_agg(a) FROM unnest(e.aliases) a
  WHERE NOT EXISTS (
    SELECT 1 FROM alias_owners ao
    WHERE ao.alias = lower(a) AND ao.type = e.type
      AND ao.entity_id = e.entity_id AND ao.rn > 1
  )
), '{}')
WHERE e.entity_id IN (SELECT entity_id FROM alias_owners WHERE rn > 1);

SELECT
  (SELECT count(*) FROM occasion_map) AS occasion_redirects,
  (SELECT count(*) FROM attr_dup_map) AS dup_redirects,
  (SELECT count(*) FROM core_restaurant_entity_events ev
    JOIN core_entities e ON e.entity_id=ev.entity_id WHERE e.status='archived') AS stranded_after;
