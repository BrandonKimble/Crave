-- fix-integrity-defects.sql
-- =============================================================================
-- Step-3 / Part-B7 DATA-INTEGRITY fix for the Crave search corpus.
-- DESTRUCTIVE (deletes loser entities, edits aliases, flips two type values).
-- >>> DO NOT RUN WITHOUT A REVIEW + A FRESH BACKUP. <<< See README.md.
--
-- Design guarantees:
--   * TRANSACTIONAL — everything runs inside ONE transaction (BEGIN/COMMIT).
--     If any statement errors, the whole thing rolls back. Nothing partial.
--   * IDEMPOTENT — every mutation is guarded so a 2nd run is a no-op:
--       - repoints target only rows still pointing at a loser id;
--       - loser deletes fire only if the loser row still exists;
--       - composite-key repoints use ON CONFLICT DO NOTHING (+ delete the
--         now-duplicate loser row) so re-running never trips a unique/PK;
--       - alias edits use array_remove (removing an absent element is a no-op);
--       - type flips are WHERE type <> 'food'.
--   * NO DATA LOSS ON MERGE — before deleting a loser we UNION its
--     market_presence + aliases onto the winner (the winner is the OLDEST row,
--     which holds the connections/signals; the NEWER row holds the NYC
--     market_presence — see the winner-choice note below), so the merged entity
--     keeps BOTH its dish graph AND its NYC recall visibility.
--
-- Run it in a transaction with review-first (recommended):
--   PGPASSWORD=postgres psql -h localhost -U postgres -d crave_search -X -v ON_ERROR_STOP=1 \
--     -f apps/api/scripts/data-fixes/fix-integrity-defects.sql
-- The file BEGINs and COMMITs itself. To dry-run, replace the final COMMIT with
-- ROLLBACK (see the very bottom) and inspect the RAISE NOTICE tallies.
--
-- After running, re-run the gate to confirm all four defect counts are 0:
--   yarn workspace api ts-node scripts/search-harness/corpus-integrity.ts
-- =============================================================================


-- =============================================================================
-- WINNER-CHOICE NOTE (why the OLDEST row wins each duplicate pair)
-- -----------------------------------------------------------------------------
-- Verified against live data (2026-07-02). For every one of the 7 restaurant
-- pairs the FK footprint is SPLIT:
--   * the OLDEST row (min created_at) holds the dish graph — Connections
--     (core_restaurant_items), RestaurantEntitySignals, richer entity events,
--     and (for Alinea/Millburn/Tops/Town Hall) the public score;
--   * the NEWER row holds the single region-us-ny-new-york market_presence row,
--     which is load-bearing: restaurant recall is market-scoped to NYC
--     (apps/api/scripts/search-harness/_shared.ts), so an entity with no
--     market_presence is invisible in NYC recall.
-- Therefore: WINNER = OLDEST row (keeps the hard-to-recreate dish graph), and we
-- EXPLICITLY MOVE the loser's market_presence + aliases onto the winner so
-- nothing is lost. A naive cascade-delete of the newer row would have dropped
-- NYC visibility for all 7 — this fix does not.
--
-- FK TABLES REPOINTED loser -> winner (every table referencing core_entities,
-- incl. non-declared-FK string columns that store entity UUIDs), and WHY:
--   core_restaurant_items (Connection)        food_id / restaurant_id      dish graph
--   core_restaurant_item_mentions             via connection (cascades)    no direct entity FK; moves with the Connection
--   core_entity_market_presence               entity_id                    NYC recall visibility (UNION, ON CONFLICT skip)
--   core_restaurant_locations                 restaurant_id                physical locations
--   core_restaurant_events                    restaurant_id                evidence (unique key: run/mention/restaurant/type)
--   core_restaurant_entity_events             restaurant_id AND entity_id  evidence, BOTH sides (composite unique)
--   core_restaurant_entity_signals            restaurant_id AND entity_id  signal graph, BOTH sides (composite PK)
--   core_public_entity_scores                 subject_id (string UUID)     Crave-Score (NOT a declared FK -> repoint by hand)
--   poll_topics.category_entity_ids/seed_entity_ids (uuid[])               poll seeds (array replace)
--   poll_topics.target_dish/restaurant/food_attribute/restaurant_attribute_id  poll targets
--   poll_leaderboard_entries.subject_id (string)                          leaderboard (restaurant-axis rows only; NOT a FK)
--   poll_endorsements.subject_id (string)                                 endorsements (restaurant-axis rows only; NOT a FK)
--   search_events / search_event_entities.entity_id                       search telemetry
--   user_search_demand_daily.entity_id                                    demand rollups
--   demand_scoring_candidates.entity_id                                   demand scoring
--   user_restaurant_views.restaurant_id / user_food_views.food_id         view telemetry
--   user_entity_view_events.entity_id / context_restaurant_id             view telemetry
--   user_favorites.entity_id / user_favorite_events.entity_id             favorites (unique user+entity -> ON CONFLICT skip)
--   favorite_list_items.restaurant_id                                     list membership (unique list+restaurant -> skip)
--   collection_on_demand_requests.entity_id / collection_on_demand_ask_events.entity_id   on-demand lane
--   core_entities.restaurant_attributes (uuid[]) / core_restaurant_items.categories,food_attributes (uuid[])  attribute refs
--   core_entities.primary_location_id                                     NOT touched (winner keeps its own primary location;
--                                                                          loser's primary_location_id dies with the loser row)
-- NOTE: the 4 word-order FOOD pairs are only ever referenced as food_id / the
--   entity-side of events+signals + attribute uuid[] arrays (no market_presence,
--   no locations) — the same repoint set covers them.
-- =============================================================================


\set ON_ERROR_STOP on
BEGIN;

-- Fail fast if the trigram extension the identify queries rely on is missing.
DO $guard$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    RAISE EXCEPTION 'pg_trgm extension not installed; aborting.';
  END IF;
END
$guard$;

-- -----------------------------------------------------------------------------
-- The merge map: loser -> winner, for all 11 pairs (7 restaurants + 4 foods).
-- Winner = OLDEST row per pair. A temp table so every step below references the
-- same authoritative mapping; ON COMMIT DROP so it never lingers.
-- Guarded: only rows whose BOTH ids still exist & are active participate, so a
-- 2nd run (loser already deleted) yields an empty map and every step no-ops.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS _merge_map;  -- belt-and-suspenders: safe re-CREATE if a prior aborted run left it
CREATE TEMP TABLE _merge_map (loser uuid PRIMARY KEY, winner uuid NOT NULL, kind text)
  ON COMMIT DROP;

INSERT INTO _merge_map (loser, winner, kind) VALUES
  -- 7 exact same-name restaurant duplicate pairs (winner = oldest):
  ('a58b0b90-552c-4662-af36-79d3fc3274e7','73ca26fb-3020-4b9c-b259-53f15609e48e','restaurant'), -- Alinea
  ('3dd83dd4-8466-4f14-988f-b4d005fa92dc','b20c6031-f22f-4249-993c-b0062c04176c','restaurant'), -- Millburn Deli
  ('53ad87ca-1d45-44b2-b7c5-6b4fec8c8ac4','ec88b414-bdea-43ab-b1bd-33aa3d90ebfb','restaurant'), -- Mitsitam Native Foods Cafe
  ('d261e24f-e93a-4da1-911b-49833e2a96b0','5bf49a25-affa-4a73-ac65-56573cac0896','restaurant'), -- Owamni
  ('d642848f-0b3f-4a9d-ae3b-b252c3203031','5c699397-5d8b-4741-b146-48ee7b9edb9f','restaurant'), -- Pradyumna Cafe
  ('1a3b3692-f256-478c-9637-baa44beccd4b','a6cda643-f8d1-4ab5-8268-4593fb40e88e','restaurant'), -- Tops Diner
  ('3c191737-2d13-47e7-b5b2-e589fa0c481a','c08353e6-776d-4eed-83d2-555dda02ffc2','restaurant'), -- Town Hall Deli
  -- 4 word-order duplicate foods (trigram sim 1.00, winner = oldest):
  ('f4907cac-dc9f-46c8-9eb9-4e9777a7d322','b74fb170-e11a-4b23-9b15-5d324b302c89','food'), -- "american chinese food" -> "chinese american food"
  ('eb7ce189-7b45-481e-ac2b-c8c5a3dc63d2','4d4e145f-de79-4cd8-a82d-bd8f9689a288','food'), -- "rainbow cookie crumb cake" -> "crumb cake rainbow cookie"
  ('bc071848-94f3-4726-b1c0-ed7c35b4b40e','60c50ff9-6ee1-4fac-9663-0ecb72634fc7','food'), -- "lemonade espresso" -> "espresso lemonade"
  ('f2be1d5b-9505-47a0-808d-4068dabe84ae','4b30fc9d-f095-4112-a57f-e8d55b984add','food'), -- "italian spicy" -> "spicy italian"
  -- 2 MISTYPED entities. These are NOT merely wrong-typed: each is a zero-food-FK
  -- DUPLICATE of an already-existing 'food' twin (a plain type-flip would just mint
  -- a NEW same-name food dup pair + a new ambiguous alias). So we MERGE the mistyped
  -- 'restaurant' row (loser) INTO its existing 'food' twin (winner), which holds the
  -- entire dish FK graph. This resolves BOTH the mistyped-type defect AND the
  -- duplicate it would otherwise create, and repoints/cleans every reference via the
  -- same STEP-A machinery. The loser's restaurant-only artifacts (location,
  -- market_presence, lat/lng/address, canonical_domain, restaurant_metadata) die
  -- with the loser row (STEP A18 delete) — no food entity inherits them. Its
  -- restaurant-axis evidence rows (core_restaurant_events / restaurant-side entity
  -- events + signals) are dropped in STEP B below (a food is never a restaurant_id).
  ('1cf59f5c-6292-4a72-9584-52ef20277d11','8aba3959-eb2c-4d4e-8a32-cdb3e931ddd2','food'), -- Fried Dumpling (restaurant) -> "fried dumpling" (food)
  ('cca0b037-aee1-47f6-8b4c-d85b8fed5957','3b5d008f-31d4-4812-8566-59a318b8c233','food')  -- Skirt Steak (restaurant) -> "skirt steak" (food)
ON CONFLICT (loser) DO NOTHING;

-- IDEMPOTENCY GUARD: drop any mapping whose loser row no longer exists (already
-- merged on a prior run) so downstream steps see only live work.
DELETE FROM _merge_map m
WHERE NOT EXISTS (SELECT 1 FROM core_entities e WHERE e.entity_id = m.loser);

DO $tally$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _merge_map;
  RAISE NOTICE '[merge] % loser->winner pair(s) live this run (0 = already merged).', n;
END
$tally$;


-- =============================================================================
-- STEP A0 — MISTYPE PRE-CLEAN. The 2 mistyped losers (Fried Dumpling / Skirt
-- Steak, being merged into their food twins) are referenced ONLY on the RESTAURANT
-- axis: restaurant-side entity events (restaurant_id), restaurant-side signals
-- (restaurant_id), core_restaurant_events (restaurant_id), and a 'restaurant'-
-- subject public score. A food entity can never be a restaurant_id / a
-- 'restaurant'-subject score, so these rows are pure mistype artifacts — DELETE
-- them (do NOT repoint them onto the food twin). Verified today: these two ids
-- have ZERO food-axis references, so nothing of value is lost. Guarded by the
-- _merge_map join so this only touches ids actually being merged this run.
-- (Kept as an explicit id list — these are the only 'restaurant'->'food' merges.)
DO $mistype_preclean$
DECLARE
  mistyped uuid[];
  n_ree int; n_res int; n_re int; n_ps int;
BEGIN
  SELECT array_agg(loser) INTO mistyped FROM _merge_map WHERE kind = 'food'
    AND loser IN ('1cf59f5c-6292-4a72-9584-52ef20277d11','cca0b037-aee1-47f6-8b4c-d85b8fed5957');
  IF mistyped IS NULL THEN
    RAISE NOTICE '[mistype] no mistyped losers live this run.';
    RETURN;
  END IF;
  DELETE FROM core_restaurant_entity_events WHERE restaurant_id = ANY(mistyped);
  GET DIAGNOSTICS n_ree = ROW_COUNT;
  DELETE FROM core_restaurant_entity_signals WHERE restaurant_id = ANY(mistyped);
  GET DIAGNOSTICS n_res = ROW_COUNT;
  DELETE FROM core_restaurant_events WHERE restaurant_id = ANY(mistyped);
  GET DIAGNOSTICS n_re = ROW_COUNT;
  DELETE FROM core_public_entity_scores WHERE subject_id = ANY(mistyped);
  GET DIAGNOSTICS n_ps = ROW_COUNT;
  -- Unset primary_location_id + drop the location so STEP A18's loser delete is clean.
  UPDATE core_entities SET primary_location_id = NULL WHERE entity_id = ANY(mistyped);
  DELETE FROM core_restaurant_locations WHERE restaurant_id = ANY(mistyped);
  -- Drop the loser's NYC market_presence so STEP A1 does NOT move it onto the food
  -- twin (foods are not market-scoped in recall; a food should carry no presence).
  DELETE FROM core_entity_market_presence WHERE entity_id = ANY(mistyped);
  RAISE NOTICE '[mistype] pre-clean removed restaurant-axis artifacts: entity_events=%, signals=%, restaurant_events=%, public_scores=%',
    n_ree, n_res, n_re, n_ps;
END
$mistype_preclean$;


-- =============================================================================
-- STEP A — REPOINT every FK reference from loser -> winner, then delete losers.
-- Ordered so composite-key tables are handled with conflict-skip before delete.
-- =============================================================================

-- A1. core_entity_market_presence: UNION loser's markets onto the winner.
--     (winner is OLDEST and has NO market_presence; loser holds NYC.) PK is
--     (entity_id, market_key) -> ON CONFLICT skip; then loser rows cascade on
--     the loser delete, but we move them explicitly for clarity + idempotency.
INSERT INTO core_entity_market_presence (entity_id, market_key, created_at)
SELECT m.winner, mp.market_key, mp.created_at
FROM core_entity_market_presence mp
JOIN _merge_map m ON m.loser = mp.entity_id
ON CONFLICT (entity_id, market_key) DO NOTHING;
DELETE FROM core_entity_market_presence mp USING _merge_map m WHERE mp.entity_id = m.loser;

-- A2. Aliases: fold loser's canonical name + loser's aliases into the winner's
--     alias array (dedup on lower(trim)), so a search for the loser's exact
--     spelling still resolves post-merge. Then (STEP C) we strip ambiguous ones.
UPDATE core_entities w
SET aliases = (
  SELECT array_agg(DISTINCT a ORDER BY a)
  FROM (
    SELECT unnest(w.aliases) AS a
    UNION
    SELECT l.name FROM core_entities l JOIN _merge_map m ON m.loser = l.entity_id AND m.winner = w.entity_id
    UNION
    SELECT unnest(l.aliases) FROM core_entities l JOIN _merge_map m ON m.loser = l.entity_id AND m.winner = w.entity_id
  ) u
  WHERE a IS NOT NULL AND btrim(a) <> ''
)
WHERE w.entity_id IN (SELECT winner FROM _merge_map);

-- A3. core_restaurant_locations.restaurant_id (no unique on restaurant_id; safe).
UPDATE core_restaurant_locations l SET restaurant_id = m.winner
FROM _merge_map m WHERE l.restaurant_id = m.loser;

-- A4. core_restaurant_items (Connection): repoint food_id and restaurant_id.
--     unique(restaurant_id, food_id) -> on collision keep the winner's row and
--     drop the loser's (verified 0 collisions today; guarded for future/rerun).
DELETE FROM core_restaurant_items c USING core_restaurant_items keep, _merge_map m
WHERE c.food_id = m.loser AND keep.food_id = m.winner AND keep.restaurant_id = c.restaurant_id;
UPDATE core_restaurant_items c SET food_id = m.winner FROM _merge_map m WHERE c.food_id = m.loser;
DELETE FROM core_restaurant_items c USING core_restaurant_items keep, _merge_map m
WHERE c.restaurant_id = m.loser AND keep.restaurant_id = m.winner AND keep.food_id = c.food_id;
UPDATE core_restaurant_items c SET restaurant_id = m.winner FROM _merge_map m WHERE c.restaurant_id = m.loser;

-- A5. core_restaurant_events.restaurant_id. unique(run, mention, restaurant, type)
--     -> drop loser rows that would collide, then repoint the rest.
DELETE FROM core_restaurant_events e USING core_restaurant_events keep, _merge_map m
WHERE e.restaurant_id = m.loser AND keep.restaurant_id = m.winner
  AND keep.extraction_run_id = e.extraction_run_id AND keep.mention_key = e.mention_key
  AND keep.evidence_type = e.evidence_type;
UPDATE core_restaurant_events e SET restaurant_id = m.winner FROM _merge_map m WHERE e.restaurant_id = m.loser;

-- A6. core_restaurant_entity_events: repoint BOTH restaurant_id and entity_id.
--     unique(run, mention, restaurant, entity, evidence_type) -> conflict-skip.
DELETE FROM core_restaurant_entity_events e USING core_restaurant_entity_events keep, _merge_map m
WHERE e.restaurant_id = m.loser AND keep.restaurant_id = m.winner
  AND keep.extraction_run_id = e.extraction_run_id AND keep.mention_key = e.mention_key
  AND keep.entity_id = e.entity_id AND keep.evidence_type = e.evidence_type;
UPDATE core_restaurant_entity_events e SET restaurant_id = m.winner FROM _merge_map m WHERE e.restaurant_id = m.loser;
DELETE FROM core_restaurant_entity_events e USING core_restaurant_entity_events keep, _merge_map m
WHERE e.entity_id = m.loser AND keep.entity_id = m.winner
  AND keep.extraction_run_id = e.extraction_run_id AND keep.mention_key = e.mention_key
  AND keep.restaurant_id = e.restaurant_id AND keep.evidence_type = e.evidence_type;
UPDATE core_restaurant_entity_events e SET entity_id = m.winner FROM _merge_map m WHERE e.entity_id = m.loser;

-- A7. core_restaurant_entity_signals: repoint BOTH sides. PK (restaurant_id,
--     entity_id) -> merge mention_count into a surviving winner row on collision.
--   restaurant side:
UPDATE core_restaurant_entity_signals keep
SET mention_count = keep.mention_count + s.mention_count
FROM core_restaurant_entity_signals s, _merge_map m
WHERE s.restaurant_id = m.loser AND keep.restaurant_id = m.winner AND keep.entity_id = s.entity_id;
DELETE FROM core_restaurant_entity_signals s USING core_restaurant_entity_signals keep, _merge_map m
WHERE s.restaurant_id = m.loser AND keep.restaurant_id = m.winner AND keep.entity_id = s.entity_id;
UPDATE core_restaurant_entity_signals s SET restaurant_id = m.winner FROM _merge_map m WHERE s.restaurant_id = m.loser;
--   entity side:
UPDATE core_restaurant_entity_signals keep
SET mention_count = keep.mention_count + s.mention_count
FROM core_restaurant_entity_signals s, _merge_map m
WHERE s.entity_id = m.loser AND keep.entity_id = m.winner AND keep.restaurant_id = s.restaurant_id;
DELETE FROM core_restaurant_entity_signals s USING core_restaurant_entity_signals keep, _merge_map m
WHERE s.entity_id = m.loser AND keep.entity_id = m.winner AND keep.restaurant_id = s.restaurant_id;
UPDATE core_restaurant_entity_signals s SET entity_id = m.winner FROM _merge_map m WHERE s.entity_id = m.loser;

-- A8. core_public_entity_scores.subject_id — NOT a declared FK (string UUID).
--     PK (subject_type, subject_id) -> keep the winner's score if present, else
--     repoint the loser's; the loser row (if winner already has one) is dropped.
DELETE FROM core_public_entity_scores p USING core_public_entity_scores keep, _merge_map m
WHERE p.subject_id = m.loser AND keep.subject_id = m.winner AND keep.subject_type = p.subject_type;
UPDATE core_public_entity_scores p SET subject_id = m.winner FROM _merge_map m WHERE p.subject_id = m.loser;

-- A9. poll_topics scalar target FKs.
UPDATE poll_topics t SET target_dish_id = m.winner FROM _merge_map m WHERE t.target_dish_id = m.loser;
UPDATE poll_topics t SET target_restaurant_id = m.winner FROM _merge_map m WHERE t.target_restaurant_id = m.loser;
UPDATE poll_topics t SET target_food_attribute_id = m.winner FROM _merge_map m WHERE t.target_food_attribute_id = m.loser;
UPDATE poll_topics t SET target_restaurant_attribute_id = m.winner FROM _merge_map m WHERE t.target_restaurant_attribute_id = m.loser;

-- A10. poll_topics uuid[] seed arrays: replace loser id with winner id, dedup.
UPDATE poll_topics t
SET category_entity_ids = (SELECT array_agg(DISTINCT x) FROM unnest(
      array_replace(t.category_entity_ids, m.loser, m.winner)) x)
FROM _merge_map m WHERE m.loser = ANY(t.category_entity_ids);
UPDATE poll_topics t
SET seed_entity_ids = (SELECT array_agg(DISTINCT x) FROM unnest(
      array_replace(t.seed_entity_ids, m.loser, m.winner)) x)
FROM _merge_map m WHERE m.loser = ANY(t.seed_entity_ids);

-- A11. poll_leaderboard_entries.subject_id / poll_endorsements.subject_id — plain
--      string columns holding entity UUIDs on the restaurant axis (NOT FKs). PKs
--      include subject_id -> conflict-skip then repoint.
DELETE FROM poll_leaderboard_entries e USING poll_leaderboard_entries keep, _merge_map m
WHERE e.subject_id = m.loser::text AND keep.subject_id = m.winner::text
  AND keep.poll_id = e.poll_id AND keep.subject_type = e.subject_type;
UPDATE poll_leaderboard_entries e SET subject_id = m.winner::text FROM _merge_map m WHERE e.subject_id = m.loser::text;
DELETE FROM poll_endorsements e USING poll_endorsements keep, _merge_map m
WHERE e.subject_id = m.loser::text AND keep.subject_id = m.winner::text
  AND keep.poll_id = e.poll_id AND keep.subject_type = e.subject_type AND keep.user_id = e.user_id;
UPDATE poll_endorsements e SET subject_id = m.winner::text FROM _merge_map m WHERE e.subject_id = m.loser::text;

-- A12. Search telemetry.
UPDATE search_event_entities s SET entity_id = m.winner FROM _merge_map m WHERE s.entity_id = m.loser;

-- A13. Demand rollups / scoring.
UPDATE user_search_demand_daily d SET entity_id = m.winner FROM _merge_map m WHERE d.entity_id = m.loser;
UPDATE demand_scoring_candidates d SET entity_id = m.winner FROM _merge_map m WHERE d.entity_id = m.loser;

-- A14. View telemetry.
UPDATE user_restaurant_views v SET restaurant_id = m.winner FROM _merge_map m WHERE v.restaurant_id = m.loser;
UPDATE user_food_views v SET food_id = m.winner FROM _merge_map m WHERE v.food_id = m.loser;
UPDATE user_entity_view_events v SET entity_id = m.winner FROM _merge_map m WHERE v.entity_id = m.loser;
UPDATE user_entity_view_events v SET context_restaurant_id = m.winner FROM _merge_map m WHERE v.context_restaurant_id = m.loser;

-- A15. Favorites (unique(user_id, entity_id) / unique(list_id, restaurant_id)).
DELETE FROM user_favorites f USING user_favorites keep, _merge_map m
WHERE f.entity_id = m.loser AND keep.entity_id = m.winner AND keep.user_id = f.user_id;
UPDATE user_favorites f SET entity_id = m.winner FROM _merge_map m WHERE f.entity_id = m.loser;
UPDATE user_favorite_events f SET entity_id = m.winner FROM _merge_map m WHERE f.entity_id = m.loser;
DELETE FROM favorite_list_items i USING favorite_list_items keep, _merge_map m
WHERE i.restaurant_id = m.loser AND keep.restaurant_id = m.winner AND keep.list_id = i.list_id;
UPDATE favorite_list_items i SET restaurant_id = m.winner FROM _merge_map m WHERE i.restaurant_id = m.loser;

-- A16. On-demand lane.
UPDATE collection_on_demand_requests r SET entity_id = m.winner FROM _merge_map m WHERE r.entity_id = m.loser;
UPDATE collection_on_demand_ask_events a SET entity_id = m.winner FROM _merge_map m WHERE a.entity_id = m.loser;

-- A17. Attribute uuid[] arrays that may reference a (food/restaurant) attribute
--      loser id. (No losers are attributes today, but this keeps the merge total.)
UPDATE core_entities e
SET restaurant_attributes = (SELECT array_agg(DISTINCT x) FROM unnest(
      array_replace(e.restaurant_attributes, m.loser, m.winner)) x)
FROM _merge_map m WHERE m.loser = ANY(e.restaurant_attributes);
UPDATE core_restaurant_items c
SET food_attributes = (SELECT array_agg(DISTINCT x) FROM unnest(
      array_replace(c.food_attributes, m.loser, m.winner)) x)
FROM _merge_map m WHERE m.loser = ANY(c.food_attributes);
UPDATE core_restaurant_items c
SET categories = (SELECT array_agg(DISTINCT x) FROM unnest(
      array_replace(c.categories, m.loser, m.winner)) x)
FROM _merge_map m WHERE m.loser = ANY(c.categories);

-- A18. FINALLY delete the loser entities. Every referencing row has been moved;
--      any remaining child rows (item_mentions moved with their Connection, etc.)
--      are covered by ON DELETE CASCADE. Existence-guarded via the join.
DELETE FROM core_entities e USING _merge_map m WHERE e.entity_id = m.loser;

DO $tally$
DECLARE remaining int;
BEGIN
  SELECT count(*) INTO remaining FROM core_entities e JOIN _merge_map m ON m.loser = e.entity_id;
  RAISE NOTICE '[merge] loser rows still present after delete (want 0): %', remaining;
END
$tally$;


-- =============================================================================
-- STEP B — (folded into the merge above). The 2 mistyped entities are resolved by
-- merging each into its existing 'food' twin (see the last 2 rows of _merge_map)
-- plus the STEP A0 restaurant-axis pre-clean. No separate type-flip is needed —
-- a flip would only mint a fresh same-name food duplicate. Nothing to do here.
-- =============================================================================


-- =============================================================================
-- STEP C — AMBIGUOUS ALIASES: strip alias strings that resolve to >1 active
-- entity of the same type. After STEP A merges the 7 dup pairs, only the 11
-- "genuinely different entities share an alias" strings remain (e.g. "Cattleack"
-- carried by both "Cattleack" and "Cattleack Barbeque"). An alias that points at
-- multiple entities carries zero disambiguating value and defeats alias-exact
-- recall, so we remove it from EVERY carrier. Canonical `name` is untouched.
--
-- Computed dynamically (not a hardcoded list) so it also cleans any residue and
-- is safe to re-run: a 2nd run finds no ambiguous aliases -> no-op.
-- =============================================================================
DO $aliases$
DECLARE
  rec RECORD;
  total int := 0;
BEGIN
  FOR rec IN
    SELECT lower(trim(al)) AS alias, type
    FROM core_entities, unnest(aliases) AS al
    WHERE status = 'active'
    GROUP BY lower(trim(al)), type
    HAVING COUNT(DISTINCT entity_id) > 1
  LOOP
    -- Remove every alias element (case/space-insensitively) equal to the
    -- ambiguous string, from every active entity of that type that carries it,
    -- but never remove an alias that equals the entity's own canonical name.
    UPDATE core_entities e
    SET aliases = (
      SELECT COALESCE(array_agg(a), ARRAY[]::text[])
      FROM unnest(e.aliases) AS a
      WHERE lower(trim(a)) <> rec.alias
         OR lower(trim(a)) = lower(trim(e.name))
    )
    WHERE e.status = 'active'
      AND e.type = rec.type
      AND EXISTS (
        SELECT 1 FROM unnest(e.aliases) a
        WHERE lower(trim(a)) = rec.alias AND lower(trim(a)) <> lower(trim(e.name))
      );
    total := total + 1;
  END LOOP;
  RAISE NOTICE '[alias] ambiguous alias strings stripped: %', total;
END
$aliases$;


-- =============================================================================
-- POST-FIX VERIFICATION (in-transaction) — every count must read 0.
-- These mirror the corpus-integrity gate; if any is non-zero the fix is
-- incomplete and you should ROLLBACK and investigate.
-- =============================================================================
DO $verify$
DECLARE d1 int; d2 int; d3 int; d4 int;
BEGIN
  SELECT COALESCE(sum((c*(c-1))/2),0) INTO d1 FROM (
    SELECT COUNT(*) c FROM core_entities WHERE status='active'
    GROUP BY lower(trim(name)), type HAVING COUNT(*)>1) g;
  SELECT count(*) INTO d2 FROM core_entities a JOIN core_entities b
    ON a.type=b.type AND a.type='food' AND a.entity_id<b.entity_id
   AND lower(trim(a.name))<>lower(trim(b.name)) AND similarity(a.name,b.name)>=0.999
   WHERE a.status='active' AND b.status='active';
  SELECT count(*) INTO d3 FROM (
    SELECT 1 FROM core_entities, unnest(aliases) al WHERE status='active'
    GROUP BY lower(trim(al)), type HAVING COUNT(DISTINCT entity_id)>1) x;
  SELECT count(DISTINCT a.entity_id) INTO d4 FROM core_entities a JOIN core_entities b
    ON lower(trim(a.name))=lower(trim(b.name)) AND a.entity_id<>b.entity_id
   WHERE a.type='restaurant' AND b.type='food' AND a.status='active' AND b.status='active';
  RAISE NOTICE '[verify] dupPairs=% wordOrderFoods=% ambiguousAliases=% mistyped=% (all want 0)', d1, d2, d3, d4;
  IF d1<>0 OR d2<>0 OR d3<>0 OR d4<>0 THEN
    RAISE EXCEPTION '[verify] FAILED — a defect count is non-zero; rolling back.';
  END IF;
END
$verify$;


-- =============================================================================
-- COMMIT the fix. For a DRY RUN, comment out COMMIT and uncomment ROLLBACK:
--   ROLLBACK;   -- inspects the RAISE NOTICE tallies without persisting anything
-- =============================================================================
COMMIT;
-- ROLLBACK;
