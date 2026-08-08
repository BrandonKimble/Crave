-- EVERY FOREIGN KEY'S REFERENCING COLUMNS ARE INDEXED.
--
-- Postgres indexes the PARENT side of a foreign key for free (it must, to
-- enforce the reference) but never the CHILD side. So every DELETE or key
-- UPDATE on the parent fires an RI trigger that has no index to use and
-- SEQ-SCANS the child — once per FK, per row.
--
-- MEASURED, not assumed. poll_topics carries four FKs to core_entities and
-- had 96,025 sequential scans over 18,284 rows: 24,006 per FK, four per
-- deleted entity, remainder exactly zero. seq_tup_read passed 624 MILLION
-- tuples. user_list_items had 65,803 scans over 201 rows.
--
-- WHY IT MATTERS HERE SPECIFICALLY: entity deletion is already a known-
-- expensive operation in this codebase (the ~$118 Austin-wipe lesson in
-- CLAUDE.md). It has been silently paying a quadratic FK-trigger tax on top
-- of the Places re-enrichment cost the whole time. This is the cheapest
-- large win available: thirteen indexes, no behaviour change.
--
-- core_restaurant_entity_events.input_id is ON DELETE CASCADE over 90k rows
-- and sits directly on the re-extract path, which deletes extraction inputs.
--
-- NOT CONCURRENTLY: `prisma migrate deploy` runs a migration in one
-- transaction, and CREATE INDEX CONCURRENTLY cannot run inside one. These
-- are small tables; the brief lock is the right trade for atomicity. The
-- one large table (core_restaurant_entity_events, 90k) still builds in well
-- under a second.
--
-- The invariant this encodes — "no foreign key lacks an index on its
-- referencing columns" — is mechanically checkable and belongs in
-- `yarn invariants`, which is where the guard for it now lives.

CREATE INDEX IF NOT EXISTS "idx_on_demand_requests_entity_id" ON "collection_on_demand_requests" ("entity_id");
CREATE INDEX IF NOT EXISTS "idx_restaurant_entity_events_input_id" ON "core_restaurant_entity_events" ("input_id");
CREATE INDEX IF NOT EXISTS "idx_restaurant_events_input_id" ON "core_restaurant_events" ("input_id");
CREATE INDEX IF NOT EXISTS "idx_entity_satisfies_to_entity_id" ON "entity_satisfies" ("to_entity_id");
CREATE INDEX IF NOT EXISTS "idx_messages_sender_user_id" ON "messages" ("sender_user_id");
CREATE INDEX IF NOT EXISTS "idx_photo_reports_user_id" ON "photo_reports" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_poll_comment_reports_reporter_user_id" ON "poll_comment_reports" ("reporter_user_id");
CREATE INDEX IF NOT EXISTS "idx_poll_topics_target_dish_id" ON "poll_topics" ("target_dish_id");
CREATE INDEX IF NOT EXISTS "idx_poll_topics_target_food_attribute_id" ON "poll_topics" ("target_food_attribute_id");
CREATE INDEX IF NOT EXISTS "idx_poll_topics_target_restaurant_attribute_id" ON "poll_topics" ("target_restaurant_attribute_id");
CREATE INDEX IF NOT EXISTS "idx_poll_topics_target_restaurant_id" ON "poll_topics" ("target_restaurant_id");
CREATE INDEX IF NOT EXISTS "idx_user_list_collaborators_invited_by_user_id" ON "user_list_collaborators" ("invited_by_user_id");
CREATE INDEX IF NOT EXISTS "idx_user_list_items_location_id" ON "user_list_items" ("location_id");
