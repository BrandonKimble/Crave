-- Consolidate back to a single schema ("public") and use table-name prefixes for domain grouping.
-- This migration is data-preserving (schema moves + renames only).

-- Core domain.
ALTER TABLE "core"."entities" SET SCHEMA "public";
ALTER TABLE "public"."entities" RENAME TO "core_entities";

ALTER TABLE "core"."connections" SET SCHEMA "public";
ALTER TABLE "public"."connections" RENAME TO "core_connections";

ALTER TABLE "core"."restaurant_locations" SET SCHEMA "public";
ALTER TABLE "public"."restaurant_locations" RENAME TO "core_restaurant_locations";

ALTER TABLE "core"."boosts" SET SCHEMA "public";
ALTER TABLE "public"."boosts" RENAME TO "core_boosts";

-- Rename immediately to avoid collision with polls.category_aggregates.
ALTER TABLE "core"."category_aggregates" SET SCHEMA "public";
ALTER TABLE "public"."category_aggregates" RENAME TO "core_category_aggregates";

-- Polls domain.
ALTER TABLE "polls"."topics" SET SCHEMA "public";
ALTER TABLE "public"."topics" RENAME TO "poll_topics";

ALTER TABLE "polls"."polls" SET SCHEMA "public";

ALTER TABLE "polls"."options" SET SCHEMA "public";
ALTER TABLE "public"."options" RENAME TO "poll_options";

ALTER TABLE "polls"."votes" SET SCHEMA "public";
ALTER TABLE "public"."votes" RENAME TO "poll_votes";

ALTER TABLE "polls"."metrics" SET SCHEMA "public";
ALTER TABLE "public"."metrics" RENAME TO "poll_metrics";

ALTER TABLE "polls"."category_aggregates" SET SCHEMA "public";
ALTER TABLE "public"."category_aggregates" RENAME TO "poll_category_aggregates";

-- Users domain (includes search logs).
ALTER TABLE "users"."users" SET SCHEMA "public";

ALTER TABLE "users"."favorites" SET SCHEMA "public";
ALTER TABLE "public"."favorites" RENAME TO "user_favorites";

ALTER TABLE "users"."events" SET SCHEMA "public";
ALTER TABLE "public"."events" RENAME TO "user_events";

ALTER TABLE "users"."restaurant_views" SET SCHEMA "public";
ALTER TABLE "public"."restaurant_views" RENAME TO "user_restaurant_views";

ALTER TABLE "users"."search_logs" SET SCHEMA "public";
ALTER TABLE "public"."search_logs" RENAME TO "user_search_logs";

-- Collection domain.
ALTER TABLE "collection"."subreddits" SET SCHEMA "public";
ALTER TABLE "public"."subreddits" RENAME TO "collection_subreddits";

ALTER TABLE "collection"."sources" SET SCHEMA "public";
ALTER TABLE "public"."sources" RENAME TO "collection_sources";

ALTER TABLE "collection"."entity_priority_metrics" SET SCHEMA "public";
ALTER TABLE "public"."entity_priority_metrics" RENAME TO "collection_entity_priority_metrics";

ALTER TABLE "collection"."on_demand_requests" SET SCHEMA "public";
ALTER TABLE "public"."on_demand_requests" RENAME TO "collection_on_demand_requests";

-- Billing domain.
ALTER TABLE "billing"."subscriptions" SET SCHEMA "public";
ALTER TABLE "public"."subscriptions" RENAME TO "billing_subscriptions";

ALTER TABLE "billing"."entitlements" SET SCHEMA "public";
ALTER TABLE "public"."entitlements" RENAME TO "billing_entitlements";

ALTER TABLE "billing"."event_logs" SET SCHEMA "public";
ALTER TABLE "public"."event_logs" RENAME TO "billing_event_logs";

ALTER TABLE "billing"."checkout_sessions" SET SCHEMA "public";
ALTER TABLE "public"."checkout_sessions" RENAME TO "billing_checkout_sessions";

-- Notifications domain.
ALTER TABLE "notifications"."devices" SET SCHEMA "public";
ALTER TABLE "public"."devices" RENAME TO "notification_devices";

ALTER TABLE "notifications"."notifications" SET SCHEMA "public";

-- Drop now-empty schemas (keep "public").
DROP SCHEMA IF EXISTS "core";
DROP SCHEMA IF EXISTS "polls";
DROP SCHEMA IF EXISTS "users";
DROP SCHEMA IF EXISTS "collection";
DROP SCHEMA IF EXISTS "billing";
DROP SCHEMA IF EXISTS "notifications";
