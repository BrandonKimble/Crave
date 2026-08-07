-- THE canonical user-anchor set (single source of truth — included via \ir
-- by wipe-city-derived.sql and anchor-audit.sql so the wipe's preservation
-- and the post-run audit can never drift apart).
--
-- Creates TEMP tables:
--   preserved_connections(connection_id) — connections user data points at
--   preserved_entities(entity_id)        — entities user data points at,
--     plus one redirect hop (acts recorded under a merge loser resolve to
--     its winner at read), plus every place-grounded restaurant
--     (RESTAURANT LAW, owner 2026-07-30, ~$118 lesson).

-- FK-POLICY LEGEND (why each anchor clause matters, verified against
-- schema.prisma 2026-08-06). Each source table's FK to the entity/connection
-- it references carries one of three referential actions on delete, and that
-- action decides whether enumerating the clause here is the SOLE protection or
-- merely a belt:
--   `Restrict — belt`: a missed anchor ABORTS the wipe loudly (the DB refuses
--       the delete), so user data is never destroyed even if this clause were
--       dropped. Redundant safety, but keep it so the wipe skips cleanly
--       instead of erroring.
--   `Cascade — sole`: deleting the entity SILENTLY cascades the child row away,
--       so this clause is the ONLY thing preserving that user data.
--   `no FK — sole`: the column has no foreign key at all (bare text/json id),
--       so nothing at the DB level protects it — this clause is the only guard.
CREATE TEMP TABLE preserved_connections AS
SELECT DISTINCT connection_id FROM (
  -- user_list_items.connection FK = Restrict — belt
  SELECT connection_id FROM user_list_items WHERE connection_id IS NOT NULL
  -- photos.connection FK = Restrict — belt
  UNION SELECT connection_id FROM photos WHERE connection_id IS NOT NULL
  -- curated_list_items.connection FK = Cascade — sole
  UNION SELECT connection_id FROM curated_list_items WHERE connection_id IS NOT NULL
) c;

CREATE TEMP TABLE preserved_entities AS
SELECT DISTINCT entity_id FROM (
  -- poll_topics.target* FKs = SetNull (Prisma default, optional relation): a
  -- missed anchor NULLs the poll's target pointer rather than destroying the
  -- poll row — belt-ish, the poll survives degraded. The *_entity_ids ARRAY
  -- columns below have no FK at all (no FK — sole).
  SELECT target_dish_id AS entity_id FROM poll_topics WHERE target_dish_id IS NOT NULL
  UNION SELECT target_restaurant_id FROM poll_topics WHERE target_restaurant_id IS NOT NULL
  UNION SELECT target_food_attribute_id FROM poll_topics WHERE target_food_attribute_id IS NOT NULL
  UNION SELECT target_restaurant_attribute_id FROM poll_topics WHERE target_restaurant_attribute_id IS NOT NULL
  -- category_entity_ids / seed_entity_ids: uuid[] arrays, no FK — sole
  UNION SELECT unnest(category_entity_ids) FROM poll_topics
  UNION SELECT unnest(seed_entity_ids) FROM poll_topics
  -- user_list_items.restaurant FK = Restrict — belt
  UNION SELECT restaurant_id FROM user_list_items WHERE restaurant_id IS NOT NULL
  -- photos.restaurant FK = Restrict — belt
  UNION SELECT restaurant_id FROM photos WHERE restaurant_id IS NOT NULL
  -- curated_list_items.entity / .restaurant FKs = Cascade — sole
  UNION SELECT entity_id FROM curated_list_items WHERE entity_id IS NOT NULL
  UNION SELECT restaurant_id FROM curated_list_items WHERE restaurant_id IS NOT NULL
  -- on_demand_requests.entity FK = SetNull (Prisma default, optional): request
  -- row survives with a nulled ref — belt-ish
  UNION SELECT entity_id FROM collection_on_demand_requests WHERE entity_id IS NOT NULL
  -- signal acts (searches, views, favorites, poll votes) are user data.
  -- Read from BOTH the raw ledger and the DURABLE daily aggregate.
  -- Why both (2026-08-03): this union decides which entities survive a city
  -- wipe, and it is the $118 law — wrongly dropping a grounded restaurant
  -- costs real Places re-enrichment. The raw ledger is becoming SHORT-LIVED
  -- (a retention window is the whole point of the signals redesign), so a
  -- TTL would silently SHRINK the preserved set and start deleting anchors
  -- that raw simply no longer remembers. `signal_demand_daily` is the durable
  -- record of the same fact — an entity was acted on — and outlives raw by
  -- design. Keeping raw as well costs nothing while it exists and means this
  -- query never depends on the aggregate pass having caught up to today.
  -- signals.subject_id / signal_demand_daily.subject_id: bare text ids, no FK — sole
  UNION SELECT subject_id FROM signals
    WHERE subject_type = 'entity' AND subject_id IS NOT NULL
  UNION SELECT subject_id FROM signal_demand_daily
    WHERE subject_type = 'entity' AND subject_id IS NOT NULL
  -- poll endorsements: restaurant axis is a bare uuid; dish axis is a
  -- poll-local 'restaurantId::foodId' composite — preserve both halves.
  -- poll_endorsements.subject_id is a bare text id, no FK — sole
  UNION SELECT subject_id::uuid FROM poll_endorsements
    WHERE subject_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  UNION SELECT split_part(subject_id, '::', 1)::uuid FROM poll_endorsements
    WHERE subject_id ~ '^[0-9a-f-]{36}::[0-9a-f-]{36}$'
  UNION SELECT split_part(subject_id, '::', 2)::uuid FROM poll_endorsements
    WHERE subject_id ~ '^[0-9a-f-]{36}::[0-9a-f-]{36}$'
  -- DM entity shares (F1250, 2026-08-03): a user sharing a restaurant or a
  -- dish into a conversation is a durable user link — the share card
  -- hydrates LIVE from this id, so deleting the entity renders it
  -- permanently "unavailable", which is exactly the broken link law 2
  -- forbids. The redirect hop cannot rescue it (a wipe DELETES, it does not
  -- merge, so no entity_redirects row exists). `shared_entity_id` is a bare
  -- `text` column with no FK, and only the restaurant/dish kinds hold a
  -- core_entities uuid — list/poll/comment/user_profile ids are NOT entity
  -- ids — so the kind filter is load-bearing and the uuid-shape guard (the
  -- poll_endorsements template) is the belt to its braces.
  UNION SELECT shared_entity_id::uuid FROM messages
    WHERE kind = 'entity_share'
      AND shared_entity_kind IN ('restaurant', 'dish')
      AND shared_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  -- POLL COMMENT ENTITY SPANS (F4936, 2026-08-06): the SAME shape as the
  -- messages clause above, one table over — a bare JSON id with no FK, in a
  -- table the wipe deliberately does not touch. `poll_comments.entity_spans`
  -- is derived from A USER'S OWN COMMENT TEXT, is GIN-indexed for
  -- containment (the restaurant-mentions read), and is the INPUT to
  -- refreshPollLeaderboard — nothing re-scans the comment body. So deleting
  -- a spanned entity both breaks the user's highlight (broken link law 2)
  -- and silently drops that subject's leaderboard contribution. The
  -- uuid-shape guard is the poll_endorsements template, as with messages.
  -- The CASE is not defence-in-depth, it is required: a set-returning
  -- function in FROM is evaluated BEFORE the WHERE, so a row whose
  -- entity_spans is a JSON object or scalar would ERROR the whole wipe
  -- rather than be filtered out.
  UNION SELECT (span->>'entityId')::uuid FROM poll_comments c,
    jsonb_array_elements(
      CASE WHEN jsonb_typeof(c.entity_spans) = 'array'
           THEN c.entity_spans ELSE '[]'::jsonb END
    ) span
    WHERE span->>'entityId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  -- core_restaurant_items.restaurant/food FKs = Cascade — sole (reached
  -- transitively via an already-preserved connection, not a user anchor itself)
  UNION SELECT ci.food_id FROM core_restaurant_items ci
    JOIN preserved_connections pc ON pc.connection_id = ci.connection_id
  UNION SELECT ci.restaurant_id FROM core_restaurant_items ci
    JOIN preserved_connections pc ON pc.connection_id = ci.connection_id
  -- RESTAURANT LAW. core_restaurant_locations.restaurant FK = Cascade — sole:
  -- deleting a grounded restaurant cascades its locations away and forces the
  -- ~$118 Places re-enrichment, so this clause is the only guard.
  UNION SELECT rl.restaurant_id FROM core_restaurant_locations rl
    WHERE rl.google_place_id IS NOT NULL
) e WHERE entity_id IS NOT NULL;

-- TRANSITIVE redirect closure (red team 2026-08-01 R7: merges flatten
-- chains, but a wipe must not depend on that invariant holding — walk the
-- whole chain so every hop's target survives).
INSERT INTO preserved_entities
WITH RECURSIVE hops AS (
  SELECT r.to_entity_id FROM entity_redirects r
  JOIN preserved_entities p ON p.entity_id = r.from_entity_id
  UNION
  SELECT r.to_entity_id FROM entity_redirects r
  JOIN hops h ON h.to_entity_id = r.from_entity_id
)
SELECT DISTINCT to_entity_id FROM hops
WHERE to_entity_id NOT IN (SELECT entity_id FROM preserved_entities);
-- NOTE (re-dated 2026-08-06, post the 2026-08-03 signals rebuild referenced at
-- :34): the signals.subject_type domain is still exactly {'none','entity'} —
-- the rebuild kept that domain, and the :43-46 clauses (reading subject_type =
-- 'entity' from BOTH signals and signal_demand_daily) are the live code that
-- depends on it, so the enumeration below still covers every subject-bearing
-- signal. If a new subject_type is ever introduced, add its id translation
-- here (the poll_endorsements composite handling is the template).
