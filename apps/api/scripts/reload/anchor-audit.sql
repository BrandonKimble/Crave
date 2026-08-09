-- POST-RUN ANCHOR AUDIT (the re-extract pattern's mandatory closing step;
-- read-only). After a re-extract's batch queue drains, this answers the
-- two questions that make the pattern launch-safe:
--
--   1. TWINS — did the run mint a NEW entity whose name is the same as a
--      user-anchored entity's name/alias up to singular/plural? Each is a
--      rename that dodged the resolver's exact/alias/variant tiers; merge
--      it INTO the anchor (anchor id wins, user links stay put) with the
--      food-dedupe / restaurant merge services.
--   2. STARVED ANCHORS — which user-anchored entities gained ZERO new
--      evidence? Pre-launch these are disposable; post-launch they are
--      PERMANENT (user-anchor law) — each is either a twin you just
--      merged, a genuinely-quiet subject (fine; it ranks like what it
--      is), or a concept the new prompt stopped extracting (a product
--      decision to make consciously, never silently).
--
-- Usage:
--   psql "$DB" -v since='2026-07-30 20:00' -f anchor-audit.sql
-- where :since is the re-extract start time.

\set ON_ERROR_STOP on
BEGIN;

\ir preserved-anchors.sql

-- ------------------------------------------------------------- 1. twins
-- New entities (created after :since) colliding with an anchor of the
-- same type on lower(name), alias, or the head-word plural variants the
-- resolver probes (mirrors food-lemma.ts's common cases; the resolver
-- should have caught these — every row here is a defect to merge).
SELECT 'TWIN' AS finding,
       a.entity_id  AS anchor_id,   a.name AS anchor_name,
       n.entity_id  AS twin_id,     n.name AS twin_name,
       a.type
FROM core_entities a
JOIN preserved_entities p ON p.entity_id = a.entity_id
JOIN core_entities n
  ON n.type = a.type
 AND n.entity_id <> a.entity_id
 AND n.created_at > :'since'::timestamptz
 AND n.status = 'active'
 AND (
       lower(n.name) = lower(a.name)
    OR EXISTS (SELECT 1 FROM entity_surface sa
                WHERE sa.entity_id = a.entity_id
                  AND sa.status = 'active' AND sa.locale = 'und'
                  AND sa.role <> 'display'
                  AND lower(sa.form) = lower(n.name))
    OR EXISTS (SELECT 1 FROM entity_surface sn
                WHERE sn.entity_id = n.entity_id
                  AND sn.status = 'active' AND sn.locale = 'und'
                  AND sn.role <> 'display'
                  AND lower(sn.form) = lower(a.name))
    OR lower(n.name) = lower(a.name) || 's'
    OR lower(n.name) || 's' = lower(a.name)
    OR lower(n.name) = lower(a.name) || 'es'
    OR lower(n.name) || 'es' = lower(a.name)
    OR (lower(a.name) ~ 'y$' AND lower(n.name) = regexp_replace(lower(a.name), 'y$', 'ies'))
    OR (lower(n.name) ~ 'y$' AND lower(a.name) = regexp_replace(lower(n.name), 'y$', 'ies'))
 )
WHERE a.status = 'active'
ORDER BY a.type, a.name;

-- --------------------------------------------------- 2. starved anchors
-- Anchored entities with no evidence rows created since :since. Includes
-- what evidence they have LEFT so the disposition is obvious at a glance.
SELECT 'STARVED' AS finding, e.type, e.entity_id, e.name,
       (SELECT count(*) FROM core_restaurant_entity_events ev
         WHERE ev.entity_id = e.entity_id) AS remaining_events,
       e.created_at::date AS entity_created
FROM core_entities e
JOIN preserved_entities p ON p.entity_id = e.entity_id
WHERE e.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM core_restaurant_entity_events ev
    WHERE (ev.entity_id = e.entity_id OR ev.restaurant_id = e.entity_id)
      AND ev.created_at > :'since'::timestamptz)
  AND NOT EXISTS (
    SELECT 1 FROM core_restaurant_events rv
    WHERE rv.restaurant_id = e.entity_id
      AND rv.created_at > :'since'::timestamptz)
ORDER BY e.type, e.name;

-- ------------------------------------------------- anchored-connections
-- User-anchored connections that gained no new mentions (same reading:
-- twin-merge fodder or genuinely quiet — never deletable post-launch).
SELECT 'STARVED_CONNECTION' AS finding,
       c.connection_id, r.name AS restaurant, f.name AS dish,
       c.mention_count
FROM core_restaurant_items c
JOIN preserved_connections pc ON pc.connection_id = c.connection_id
JOIN core_entities r ON r.entity_id = c.restaurant_id
JOIN core_entities f ON f.entity_id = c.food_id
-- mentions carry source-time only, so "new evidence" is read from the
-- ingest-stamped event ledger for the connection's (restaurant, food) pair
WHERE NOT EXISTS (
  SELECT 1 FROM core_restaurant_entity_events ev
  WHERE ev.restaurant_id = c.restaurant_id
    AND ev.entity_id = c.food_id
    AND ev.created_at > :'since'::timestamptz)
ORDER BY r.name, f.name;

-- ── SEMANTIC TWINS (red team 2026-08-01 R4) ────────────────────────────────
-- The lexical TWIN check above misses renames: "birria tacos" → "quesabirria"
-- mints a live new entity while the user's anchored one starves, invisibly.
-- Candidate pairs by embedding distance: a NEW same-type entity within
-- cosine distance 0.25 of an ANCHORED entity is a rename suspect. Output is
-- a REVIEW QUEUE, not an auto-merge list — the agent triages (obvious
-- rename → merge into the anchor via the dedupe services so rehome runs;
-- genuinely distinct concept → leave, the anchor is simply quiet now).
\echo ''
\echo '=== SEMANTIC TWIN CANDIDATES (agent review; distance < 0.25) ==='
SELECT
  a.entity_id   AS anchored_id,
  a.name        AS anchored_name,
  n.entity_id   AS new_id,
  n.name        AS new_name,
  a.type,
  round((a.name_embedding <=> n.name_embedding)::numeric, 4) AS cos_distance
FROM core_entities a
JOIN preserved_entities p ON p.entity_id = a.entity_id
JOIN core_entities n
  ON n.type = a.type
 AND n.status = 'active'
 AND n.created_at > :'since'::timestamptz
 AND n.entity_id <> a.entity_id
WHERE a.status = 'active'
  AND a.name_embedding IS NOT NULL
  AND n.name_embedding IS NOT NULL
  AND lower(a.name) <> lower(n.name)
  AND (a.name_embedding <=> n.name_embedding) < 0.25
ORDER BY cos_distance ASC
LIMIT 200;

ROLLBACK;
