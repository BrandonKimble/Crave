-- AN INSTANT IS AN INSTANT: every timestamp column becomes timestamptz.
--
-- THE CLASS THIS DELETES. 162 columns were `timestamp WITHOUT time zone`
-- holding UTC wall-clock, while Prisma binds a JS Date as `timestamptz`.
-- Comparing the two made Postgres coerce the naive column through the
-- SESSION's TimeZone, so hand-written SQL meant something different depending
-- on where the server thought it was. That cost us: the polls feed could not
-- load a second page on a non-UTC host (a real cursor matched 3,175 rows where
-- the correct comparison matched 16,528), and an archive UPDATE's scope moved
-- with the timezone.
--
-- Every mitigation we built for it — the `utcInstant` helper, the source
-- scanner that policed raw SQL, the connection-level session pin — existed
-- only because the column type was lying about what it stored. Fixing the type
-- deletes the mitigations, not just the bugs.
--
-- The conversion is `AT TIME ZONE 'UTC'` because the stored wall-clock IS UTC;
-- verified before and after on real rows, byte-identical instants.
--
-- ONE EXCEPTION, STRUCTURAL: `signals.occurred_at` stays naive. It is the
-- RANGE partition key, and Postgres refuses to alter a partition key's type
-- ("cannot alter column ... because it is part of the partition key"). Its
-- comparisons go through the signals module's own `utcInstantSql`, which is
-- why that helper stays where it started instead of being deleted with the
-- rest.
ALTER TABLE "access_grants" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "access_grants" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE "access_grants" ALTER COLUMN "revoked_at" TYPE timestamptz(3) USING "revoked_at" AT TIME ZONE 'UTC';
ALTER TABLE "access_grants" ALTER COLUMN "starts_at" TYPE timestamptz(3) USING "starts_at" AT TIME ZONE 'UTC';
ALTER TABLE "api_usage_ledger" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_event_logs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_event_logs" ALTER COLUMN "processed_at" TYPE timestamptz(3) USING "processed_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_event_logs" ALTER COLUMN "received_at" TYPE timestamptz(3) USING "received_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_event_logs" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_subscriptions" ALTER COLUMN "cancelled_at" TYPE timestamptz(3) USING "cancelled_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_subscriptions" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_subscriptions" ALTER COLUMN "current_period_end" TYPE timestamptz(3) USING "current_period_end" AT TIME ZONE 'UTC';
ALTER TABLE "billing_subscriptions" ALTER COLUMN "current_period_start" TYPE timestamptz(3) USING "current_period_start" AT TIME ZONE 'UTC';
ALTER TABLE "billing_subscriptions" ALTER COLUMN "last_event_received_at" TYPE timestamptz(3) USING "last_event_received_at" AT TIME ZONE 'UTC';
ALTER TABLE "billing_subscriptions" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_extraction_coverage_claims" ALTER COLUMN "claimed_at" TYPE timestamptz(3) USING "claimed_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_extraction_inputs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_extraction_runs" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_extraction_runs" ALTER COLUMN "started_at" TYPE timestamptz(3) USING "started_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_keyword_attempt_history" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_keyword_attempt_history" ALTER COLUMN "last_attempt_at" TYPE timestamptz(3) USING "last_attempt_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_keyword_attempt_history" ALTER COLUMN "last_success_at" TYPE timestamptz(3) USING "last_success_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_keyword_attempt_history" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_on_demand_request_users" ALTER COLUMN "first_seen_at" TYPE timestamptz(3) USING "first_seen_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_on_demand_request_users" ALTER COLUMN "last_seen_at" TYPE timestamptz(3) USING "last_seen_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_on_demand_requests" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_on_demand_requests" ALTER COLUMN "last_queued_at" TYPE timestamptz(3) USING "last_queued_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_on_demand_requests" ALTER COLUMN "last_seen_at" TYPE timestamptz(3) USING "last_seen_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_on_demand_requests" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_on_demand_unsegmented_residue" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_on_demand_unsegmented_residue" ALTER COLUMN "processed_at" TYPE timestamptz(3) USING "processed_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_processed_sources" ALTER COLUMN "processed_at" TYPE timestamptz(3) USING "processed_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_relevance_verdicts" ALTER COLUMN "judged_at" TYPE timestamptz(3) USING "judged_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_runs" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_runs" ALTER COLUMN "started_at" TYPE timestamptz(3) USING "started_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_source_documents" ALTER COLUMN "collected_at" TYPE timestamptz(3) USING "collected_at" AT TIME ZONE 'UTC';
ALTER TABLE "collection_source_documents" ALTER COLUMN "source_created_at" TYPE timestamptz(3) USING "source_created_at" AT TIME ZONE 'UTC';
ALTER TABLE "conversation_participants" ALTER COLUMN "accepted_at" TYPE timestamptz(3) USING "accepted_at" AT TIME ZONE 'UTC';
ALTER TABLE "conversation_participants" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "conversation_participants" ALTER COLUMN "last_read_message_at" TYPE timestamptz(3) USING "last_read_message_at" AT TIME ZONE 'UTC';
ALTER TABLE "conversations" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "conversations" ALTER COLUMN "last_message_at" TYPE timestamptz(3) USING "last_message_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_entities" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_entities" ALTER COLUMN "knowledge_synthesized_at" TYPE timestamptz(3) USING "knowledge_synthesized_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_entities" ALTER COLUMN "last_polled_at" TYPE timestamptz(3) USING "last_polled_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_entities" ALTER COLUMN "last_updated" TYPE timestamptz(3) USING "last_updated" AT TIME ZONE 'UTC';
ALTER TABLE "core_entities" ALTER COLUMN "price_level_updated_at" TYPE timestamptz(3) USING "price_level_updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_entity_events" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_entity_events" ALTER COLUMN "mentioned_at" TYPE timestamptz(3) USING "mentioned_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_entity_signals" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_entity_signals" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_events" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_events" ALTER COLUMN "mentioned_at" TYPE timestamptz(3) USING "mentioned_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_item_mentions" ALTER COLUMN "mentioned_at" TYPE timestamptz(3) USING "mentioned_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_items" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_items" ALTER COLUMN "last_mentioned_at" TYPE timestamptz(3) USING "last_mentioned_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_items" ALTER COLUMN "last_updated" TYPE timestamptz(3) USING "last_updated" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_locations" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_locations" ALTER COLUMN "last_polled_at" TYPE timestamptz(3) USING "last_polled_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_locations" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "curated_lists" ALTER COLUMN "built_at" TYPE timestamptz(3) USING "built_at" AT TIME ZONE 'UTC';
ALTER TABLE "demand_scoring_candidates" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "demand_scoring_runs" ALTER COLUMN "cycle_end_at" TYPE timestamptz(3) USING "cycle_end_at" AT TIME ZONE 'UTC';
ALTER TABLE "demand_scoring_runs" ALTER COLUMN "cycle_start_at" TYPE timestamptz(3) USING "cycle_start_at" AT TIME ZONE 'UTC';
ALTER TABLE "demand_scoring_runs" ALTER COLUMN "finished_at" TYPE timestamptz(3) USING "finished_at" AT TIME ZONE 'UTC';
ALTER TABLE "demand_scoring_runs" ALTER COLUMN "started_at" TYPE timestamptz(3) USING "started_at" AT TIME ZONE 'UTC';
ALTER TABLE "derived_entity_sibling_edges" ALTER COLUMN "built_at" TYPE timestamptz(3) USING "built_at" AT TIME ZONE 'UTC';
ALTER TABLE "derived_food_category_edges" ALTER COLUMN "built_at" TYPE timestamptz(3) USING "built_at" AT TIME ZONE 'UTC';
ALTER TABLE "engines" ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "entity_redirects" ALTER COLUMN "redirected_at" TYPE timestamptz(3) USING "redirected_at" AT TIME ZONE 'UTC';
ALTER TABLE "gemini_context_caches" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "gemini_context_caches" ALTER COLUMN "expires_at" TYPE timestamptz(3) USING "expires_at" AT TIME ZONE 'UTC';
ALTER TABLE "gemini_context_caches" ALTER COLUMN "retired_at" TYPE timestamptz(3) USING "retired_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_batch_jobs" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_batch_jobs" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_batch_jobs" ALTER COLUMN "ingested_at" TYPE timestamptz(3) USING "ingested_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_batch_jobs" ALTER COLUMN "lease_expires_at" TYPE timestamptz(3) USING "lease_expires_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_batch_jobs" ALTER COLUMN "submitted_at" TYPE timestamptz(3) USING "submitted_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_batch_jobs" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_decision_records" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_prompts" ALTER COLUMN "activated_at" TYPE timestamptz(3) USING "activated_at" AT TIME ZONE 'UTC';
ALTER TABLE "llm_prompts" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "messages" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "notification_devices" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "notification_devices" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "notifications" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "notifications" ALTER COLUMN "scheduled_for" TYPE timestamptz(3) USING "scheduled_for" AT TIME ZONE 'UTC';
ALTER TABLE "notifications" ALTER COLUMN "sent_at" TYPE timestamptz(3) USING "sent_at" AT TIME ZONE 'UTC';
ALTER TABLE "notifications" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "photo_events" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "photo_reports" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "photos" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "photos" ALTER COLUMN "moderated_at" TYPE timestamptz(3) USING "moderated_at" AT TIME ZONE 'UTC';
ALTER TABLE "photos" ALTER COLUMN "taken_at" TYPE timestamptz(3) USING "taken_at" AT TIME ZONE 'UTC';
ALTER TABLE "photos" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "photos" ALTER COLUMN "uploaded_at" TYPE timestamptz(3) USING "uploaded_at" AT TIME ZONE 'UTC';
ALTER TABLE "place_geometries" ALTER COLUMN "fetched_at" TYPE timestamptz(3) USING "fetched_at" AT TIME ZONE 'UTC';
ALTER TABLE "place_geometry_promotions" ALTER COLUMN "enqueued_at" TYPE timestamptz(3) USING "enqueued_at" AT TIME ZONE 'UTC';
ALTER TABLE "place_geometry_promotions" ALTER COLUMN "last_attempt_at" TYPE timestamptz(3) USING "last_attempt_at" AT TIME ZONE 'UTC';
ALTER TABLE "place_geometry_promotions" ALTER COLUMN "promoted_at" TYPE timestamptz(3) USING "promoted_at" AT TIME ZONE 'UTC';
ALTER TABLE "place_geometry_promotions" ALTER COLUMN "refused_at" TYPE timestamptz(3) USING "refused_at" AT TIME ZONE 'UTC';
ALTER TABLE "places" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_comment_likes" ALTER COLUMN "logged_at" TYPE timestamptz(3) USING "logged_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_comment_reports" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_comments" ALTER COLUMN "deleted_at" TYPE timestamptz(3) USING "deleted_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_comments" ALTER COLUMN "edited_at" TYPE timestamptz(3) USING "edited_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_comments" ALTER COLUMN "logged_at" TYPE timestamptz(3) USING "logged_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_endorsements" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_leaderboard_entries" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_place_supply" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_place_supply" ALTER COLUMN "credit_updated_at" TYPE timestamptz(3) USING "credit_updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_place_supply" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_topics" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_topics" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "poll_weekly_ticks" ALTER COLUMN "published_at" TYPE timestamptz(3) USING "published_at" AT TIME ZONE 'UTC';
ALTER TABLE "polls" ALTER COLUMN "closed_at" TYPE timestamptz(3) USING "closed_at" AT TIME ZONE 'UTC';
ALTER TABLE "polls" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "polls" ALTER COLUMN "graduated_at" TYPE timestamptz(3) USING "graduated_at" AT TIME ZONE 'UTC';
ALTER TABLE "polls" ALTER COLUMN "launched_at" TYPE timestamptz(3) USING "launched_at" AT TIME ZONE 'UTC';
ALTER TABLE "polls" ALTER COLUMN "scheduled_for" TYPE timestamptz(3) USING "scheduled_for" AT TIME ZONE 'UTC';
ALTER TABLE "polls" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "rescore_state" ALTER COLUMN "dirty_since" TYPE timestamptz(3) USING "dirty_since" AT TIME ZONE 'UTC';
ALTER TABLE "rescore_state" ALTER COLUMN "last_rescore_at" TYPE timestamptz(3) USING "last_rescore_at" AT TIME ZONE 'UTC';
ALTER TABLE "signal_actors" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "source_collection_lanes" ALTER COLUMN "created_at" TYPE timestamptz(6) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "source_collection_lanes" ALTER COLUMN "due_at" TYPE timestamptz(6) USING "due_at" AT TIME ZONE 'UTC';
ALTER TABLE "source_collection_lanes" ALTER COLUMN "last_ran_at" TYPE timestamptz(6) USING "last_ran_at" AT TIME ZONE 'UTC';
ALTER TABLE "source_collection_lanes" ALTER COLUMN "updated_at" TYPE timestamptz(6) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "sources" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "spend_campaigns" ALTER COLUMN "approved_at" TYPE timestamptz(3) USING "approved_at" AT TIME ZONE 'UTC';
ALTER TABLE "spend_campaigns" ALTER COLUMN "completed_at" TYPE timestamptz(3) USING "completed_at" AT TIME ZONE 'UTC';
ALTER TABLE "spend_campaigns" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "spend_unit_costs" ALTER COLUMN "refreshed_at" TYPE timestamptz(3) USING "refreshed_at" AT TIME ZONE 'UTC';
ALTER TABLE "spend_unit_costs" ALTER COLUMN "window_end" TYPE timestamptz(3) USING "window_end" AT TIME ZONE 'UTC';
ALTER TABLE "spend_unit_costs" ALTER COLUMN "window_start" TYPE timestamptz(3) USING "window_start" AT TIME ZONE 'UTC';
ALTER TABLE "user_blocks" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_follows" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_list_collaborators" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_list_items" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_list_items" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_list_share_events" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_lists" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_lists" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_notifications" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_notifications" ALTER COLUMN "read_at" TYPE timestamptz(3) USING "read_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_reports" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_reserved_usernames" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "user_stats" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "username_history" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "users" ALTER COLUMN "created_at" TYPE timestamptz(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "users" ALTER COLUMN "deleted_at" TYPE timestamptz(3) USING "deleted_at" AT TIME ZONE 'UTC';
ALTER TABLE "users" ALTER COLUMN "last_sign_in_at" TYPE timestamptz(3) USING "last_sign_in_at" AT TIME ZONE 'UTC';
ALTER TABLE "users" ALTER COLUMN "onboarding_completed_at" TYPE timestamptz(3) USING "onboarding_completed_at" AT TIME ZONE 'UTC';
ALTER TABLE "users" ALTER COLUMN "updated_at" TYPE timestamptz(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "users" ALTER COLUMN "username_updated_at" TYPE timestamptz(3) USING "username_updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "core_restaurant_attribute_evidence" ALTER COLUMN "computed_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "engines" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "ops_alerts" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "acknowledged_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "signal_demand_daily" ALTER COLUMN "last_occurred_at" SET DATA TYPE TIMESTAMPTZ(3);
ALTER TABLE "source_collection_lanes" ALTER COLUMN "due_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "last_ran_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMPTZ(3),
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMPTZ(3);
