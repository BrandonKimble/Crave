-- identify-integrity-defects.sql
-- =============================================================================
-- READ-ONLY. Lists the exact defect rows (with entity_ids + names) that the
-- Step-3 / Part-B7 data-integrity fix (fix-integrity-defects.sql) must resolve.
-- Nothing here mutates data. These queries mirror the audit's own queries in
-- apps/api/scripts/search-harness/corpus-integrity.ts so the fix is reviewable
-- against the same rows the gate counts.
--
-- RUN (read-only; safe to run anytime):
--   PGPASSWORD=postgres psql -h localhost -U postgres -d crave_search \
--     -X -P pager=off -f apps/api/scripts/data-fixes/identify-integrity-defects.sql
--
-- Requires the pg_trgm extension (already installed per schema.prisma).
-- =============================================================================

\echo '===== DEFECT 1: exact same-name duplicate pairs within a type (audit 7 -> 0) ====='
-- Each group of N same-(lower(name), type) active rows contributes N*(N-1)/2 pairs.
-- Winner selection rule used by the fix: the OLDEST row (min created_at) is the
-- winner (most FK references / oldest lineage); ties broken by min(entity_id).
SELECT lower(trim(name))                                       AS norm_name,
       type::text                                              AS type,
       COUNT(*)::int                                           AS n_rows,
       (COUNT(*) * (COUNT(*) - 1) / 2)::int                    AS n_pairs,
       string_agg(entity_id::text, ', ' ORDER BY created_at, entity_id) AS entity_ids_oldest_first,
       string_agg(name || ' <' || entity_id::text || '>', ' | ' ORDER BY created_at, entity_id) AS detail
FROM core_entities
WHERE status = 'active'
GROUP BY lower(trim(name)), type
HAVING COUNT(*) > 1
ORDER BY n_rows DESC, norm_name;

\echo ''
\echo '===== DEFECT 2: word-order / near-identical duplicate FOODS, trigram sim >= 0.999 (audit 4 -> 0) ====='
-- Distinct name strings that are near-identical (word-order variants like
-- "chicken tikka masala" vs "tikka masala chicken"). a.entity_id < b.entity_id
-- keeps one row per unordered pair. Winner = OLDEST (min created_at).
SELECT a.entity_id::text                                       AS a_id,
       a.name                                                  AS a_name,
       a.created_at                                            AS a_created,
       b.entity_id::text                                       AS b_id,
       b.name                                                  AS b_name,
       b.created_at                                            AS b_created,
       round(similarity(a.name, b.name)::numeric, 4)           AS sim
FROM core_entities a
JOIN core_entities b
  ON a.type = b.type
 AND a.type = 'food'
 AND a.entity_id < b.entity_id
 AND lower(trim(a.name)) <> lower(trim(b.name))
 AND similarity(a.name, b.name) >= 0.999
WHERE a.status = 'active' AND b.status = 'active'
ORDER BY sim DESC, a.name;

\echo ''
\echo '===== DEFECT 3: ambiguous aliases -- one alias -> multiple entities of same type (audit 18 -> 0) ====='
-- Each alias string that resolves to >1 active entity of the same type. The fix
-- REMOVES the ambiguous alias from every entity that carries it (an alias that
-- points at multiple entities carries no disambiguating value and defeats
-- alias-exact recall); canonical names are untouched.
SELECT lower(trim(al))                                         AS alias,
       type::text                                              AS type,
       COUNT(DISTINCT entity_id)::int                          AS n_entities,
       string_agg(DISTINCT name, ' | ' ORDER BY name)         AS entity_names,
       string_agg(DISTINCT entity_id::text, ', ')             AS entity_ids
FROM core_entities, unnest(aliases) AS al
WHERE status = 'active'
GROUP BY lower(trim(al)), type
HAVING COUNT(DISTINCT entity_id) > 1
ORDER BY n_entities DESC, alias;

\echo ''
\echo '===== DEFECT 4: mistyped entities -- Fried Dumpling / Skirt Steak typed non-food (audit 2 -> 0) ====='
-- The audit query flags a 'restaurant'-typed row whose name also exists as a
-- 'food'. Show BOTH the audit-style detection and the two named rows directly so
-- we can see their current type and confirm the correction target ('food').
\echo '-- 4a. audit-style detection (restaurant row whose name also exists as a food):'
SELECT DISTINCT a.entity_id::text AS entity_id, a.name, a.type::text AS current_type
FROM core_entities a
JOIN core_entities b
  ON lower(trim(a.name)) = lower(trim(b.name))
 AND a.entity_id <> b.entity_id
WHERE a.type = 'restaurant' AND b.type = 'food'
  AND a.status = 'active' AND b.status = 'active'
ORDER BY a.name;

\echo '-- 4b. the two named rows directly (any type), to confirm what needs correcting:'
SELECT entity_id::text AS entity_id, name, type::text AS current_type, status::text AS status, created_at
FROM core_entities
WHERE lower(trim(name)) IN ('fried dumpling', 'skirt steak')
ORDER BY name, type;

\echo ''
\echo '===== CONTEXT: cross-type name collisions overall (not a defect, informational) ====='
SELECT COUNT(*)::int AS cross_type_collisions
FROM core_entities a
JOIN core_entities b
  ON lower(trim(a.name)) = lower(trim(b.name))
 AND a.type < b.type AND a.entity_id <> b.entity_id
WHERE a.status = 'active' AND b.status = 'active';
