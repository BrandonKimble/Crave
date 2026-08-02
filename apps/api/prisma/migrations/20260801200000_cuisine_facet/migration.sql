-- CLASS ② (data audit 2026-08): cuisine becomes its own FACET.
-- 57% of restaurant-attribute evidence mass is cuisine — a category
-- dimension mislabeled as a venue property, and the largest share of the
-- stranded tombstone backlog (archived cuisine attributes with no
-- forwarding). This migration:
--   1. adds the facet column;
--   2. builds the canonical cuisine vocabulary (one ACTIVE
--      restaurant_attribute row per cuisine, facet='cuisine' — reusing
--      the existing active row where one exists, minting where the whole
--      cuisine was archived e.g. cajun/hawaiian/filipino/tex-mex);
--   3. writes entity_redirects from EVERY archived cuisine row (both
--      attribute types, punctuation variants folded) to its canonical;
--   4. drains the backlog: repoints archived-cuisine events to the
--      canonical (fixing entity_type/evidence_type to the
--      restaurant-attribute shape), deletes content-unique collisions;
--   5. deletes the JUNK-SINK backlog: events on archived attributes with
--      no redirect are rejected vocabulary absorbed invisibly by design —
--      the design is now "drop at write time", so the invisible backlog
--      goes too.
-- Restaurants touched by 4/5 are rebuilt by the nightly sweep/cron
-- machinery; a follow-up rebuild is triggered in code paths already.

ALTER TABLE core_entities ADD COLUMN IF NOT EXISTS facet VARCHAR(16);

-- ---------------------------------------------------------- the lexicon
CREATE TEMP TABLE cuisine_lexicon (name TEXT PRIMARY KEY);
INSERT INTO cuisine_lexicon VALUES
('american'),('asian'),('asian fusion'),('australian'),('bbq'),('brazilian'),
('british'),('burmese'),('cajun'),('cantonese'),('caribbean'),('chinese'),
('creole'),('cuban'),('dim sum'),('egyptian'),('ethiopian'),('filipino'),
('french'),('fusion'),('georgian'),('german'),('greek'),('hawaiian'),
('indian'),('indonesian'),('iranian'),('isan'),('italian'),('izakaya'),
('jamaican'),('japanese'),('jewish'),('korean'),('korean bbq'),('lebanese'),
('louisiana'),('malaysian'),('mediterranean'),('mexican'),('middle eastern'),
('neapolitan'),('nepalese'),('nepali'),('pakistani'),('palestinian'),
('persian'),('peruvian'),('polish'),('roman'),('russian'),('sichuan'),
('sicilian'),('soul food'),('spanish'),('szechuan'),('taiwanese'),
('tex-mex'),('tex mex'),('thai'),('turkish'),('vietnamese');

-- FOLD: apostrophes strip, other punctuation becomes a space —
-- 'tex mex' and 'tex-mex' share one canonical AND "Phil's"=='Phils'
CREATE TEMP TABLE cuisine_names AS
SELECT name,
  btrim(regexp_replace(regexp_replace(lower(name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g')) AS fold
FROM cuisine_lexicon;

-- --------------------------------------------------- canonical per fold
-- Prefer the ACTIVE restaurant_attribute row with the most evidence; else
-- mint a new active row named by the most-evidenced archived variant.
CREATE TEMP TABLE cuisine_canonicals AS
SELECT DISTINCT ON (cn.fold)
  cn.fold, e.entity_id, e.name
FROM cuisine_names cn
JOIN core_entities e
  ON btrim(regexp_replace(regexp_replace(lower(e.name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g')) = cn.fold
 AND e.type = 'restaurant_attribute' AND e.status = 'active'
ORDER BY cn.fold,
  (SELECT count(*) FROM core_restaurant_entity_events ev WHERE ev.entity_id = e.entity_id) DESC;

INSERT INTO cuisine_canonicals (fold, entity_id, name)
SELECT missing.fold, gen_random_uuid(), missing.best_name
FROM (
  SELECT DISTINCT ON (cn.fold) cn.fold, e.name AS best_name
  FROM cuisine_names cn
  JOIN core_entities e
    ON btrim(regexp_replace(regexp_replace(lower(e.name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g')) = cn.fold
   AND e.type IN ('food_attribute','restaurant_attribute')
   AND e.status = 'archived'
  WHERE cn.fold NOT IN (SELECT fold FROM cuisine_canonicals)
  ORDER BY cn.fold,
    (SELECT count(*) FROM core_restaurant_entity_events ev WHERE ev.entity_id = e.entity_id) DESC
) missing;

INSERT INTO core_entities (entity_id, name, type, status, facet)
SELECT c.entity_id, c.name, 'restaurant_attribute', 'active', 'cuisine'
FROM cuisine_canonicals c
WHERE NOT EXISTS (SELECT 1 FROM core_entities e WHERE e.entity_id = c.entity_id);

UPDATE core_entities e SET facet = 'cuisine'
FROM cuisine_canonicals c WHERE e.entity_id = c.entity_id;

-- ACTIVE food_attribute cuisines fold too (round-6 red team: 'bbq' lived
-- on as an active food_attribute with 35 events split away from the
-- canonical) — archive them into the fold before writing redirects.
UPDATE core_entities e SET status = 'archived'
FROM cuisine_names cn, cuisine_canonicals c
WHERE btrim(regexp_replace(regexp_replace(lower(e.name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g')) = cn.fold
  AND c.fold = cn.fold
  AND e.type = 'food_attribute' AND e.status = 'active'
  AND e.entity_id <> c.entity_id;

-- ------------------------------------------------------------ redirects
INSERT INTO entity_redirects (from_entity_id, to_entity_id)
SELECT e.entity_id, c.entity_id
FROM core_entities e
JOIN cuisine_names cn
  ON btrim(regexp_replace(regexp_replace(lower(e.name), '''', '', 'g'), '[^a-z0-9]+', ' ', 'g')) = cn.fold
JOIN cuisine_canonicals c ON c.fold = cn.fold
WHERE e.type IN ('food_attribute','restaurant_attribute')
  AND e.status = 'archived'
  AND e.entity_id <> c.entity_id
ON CONFLICT (from_entity_id) DO NOTHING;

-- bank archived variant names as aliases on the canonical
UPDATE core_entities canon SET aliases = (
  SELECT array_agg(DISTINCT a) FROM (
    SELECT unnest(canon.aliases) AS a
    UNION SELECT lower(e.name)
    FROM core_entities e JOIN entity_redirects r ON r.from_entity_id = e.entity_id
    WHERE r.to_entity_id = canon.entity_id AND lower(e.name) <> lower(canon.name)
  ) s
)
FROM cuisine_canonicals c WHERE canon.entity_id = c.entity_id;

-- ------------------------------------- drain: cuisine events repointed
-- (entity_type/evidence_type flip to the restaurant-attribute shape;
--  DISTINCT ON avoids intra-statement content-unique collisions)
WITH candidates AS (
  SELECT DISTINCT ON (ev.extraction_run_id, ev.source_document_id,
                      ev.restaurant_id, r.to_entity_id)
    ev.event_id, r.to_entity_id
  FROM core_restaurant_entity_events ev
  JOIN core_entities e ON e.entity_id = ev.entity_id AND e.status = 'archived'
  JOIN entity_redirects r ON r.from_entity_id = e.entity_id
  JOIN cuisine_canonicals c ON c.entity_id = r.to_entity_id
  WHERE NOT EXISTS (
    SELECT 1 FROM core_restaurant_entity_events dup
    WHERE dup.extraction_run_id = ev.extraction_run_id
      AND dup.source_document_id = ev.source_document_id
      AND dup.restaurant_id = ev.restaurant_id
      AND dup.entity_id = r.to_entity_id
      AND dup.evidence_type = 'restaurant_attribute'
  )
  ORDER BY ev.extraction_run_id, ev.source_document_id,
           ev.restaurant_id, r.to_entity_id, ev.event_id
)
UPDATE core_restaurant_entity_events ev
SET entity_id = candidates.to_entity_id,
    entity_type = 'restaurant_attribute',
    evidence_type = 'restaurant_attribute'
FROM candidates WHERE ev.event_id = candidates.event_id;

-- leftover cuisine-tombstone events are redundant copies — delete
DELETE FROM core_restaurant_entity_events ev
USING core_entities e, entity_redirects r, cuisine_canonicals c
WHERE ev.entity_id = e.entity_id AND e.status = 'archived'
  AND r.from_entity_id = e.entity_id AND c.entity_id = r.to_entity_id;

-- --------------------------- junk-sink backlog: rejected vocab, delete
-- (attributes only; merged foods/restaurants have redirects and are
--  handled by the nightly sweep)
DELETE FROM core_restaurant_entity_events ev
USING core_entities e
WHERE ev.entity_id = e.entity_id
  AND e.status = 'archived'
  AND e.type IN ('food_attribute','restaurant_attribute')
  AND NOT EXISTS (SELECT 1 FROM entity_redirects r WHERE r.from_entity_id = e.entity_id);

SELECT
  (SELECT count(*) FROM cuisine_canonicals) AS cuisines,
  (SELECT count(*) FROM core_restaurant_entity_events ev
    JOIN core_entities e ON e.entity_id = ev.entity_id
    WHERE e.status = 'archived') AS stranded_after;
