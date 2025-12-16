-- Group domain tables into Postgres schemas and drop redundant table-name prefixes.
-- Note: enum types remain in "public" for now.

-- Create domain schemas.
CREATE SCHEMA IF NOT EXISTS "core";
CREATE SCHEMA IF NOT EXISTS "users";
CREATE SCHEMA IF NOT EXISTS "collection";
CREATE SCHEMA IF NOT EXISTS "polls";
CREATE SCHEMA IF NOT EXISTS "billing";
CREATE SCHEMA IF NOT EXISTS "notifications";

-- Core tables.
ALTER TABLE "public"."entities" SET SCHEMA "core";
ALTER TABLE "public"."connections" SET SCHEMA "core";
ALTER TABLE "public"."restaurant_locations" SET SCHEMA "core";
ALTER TABLE "public"."boosts" SET SCHEMA "core";
ALTER TABLE "public"."category_aggregates" SET SCHEMA "core";

-- Polls tables.
ALTER TABLE "public"."poll_topics" SET SCHEMA "polls";
ALTER TABLE "polls"."poll_topics" RENAME TO "topics";

ALTER TABLE "public"."polls" SET SCHEMA "polls";

ALTER TABLE "public"."poll_options" SET SCHEMA "polls";
ALTER TABLE "polls"."poll_options" RENAME TO "options";

ALTER TABLE "public"."poll_votes" SET SCHEMA "polls";
ALTER TABLE "polls"."poll_votes" RENAME TO "votes";

ALTER TABLE "public"."poll_metrics" SET SCHEMA "polls";
ALTER TABLE "polls"."poll_metrics" RENAME TO "metrics";

ALTER TABLE "public"."poll_category_aggregates" SET SCHEMA "polls";
ALTER TABLE "polls"."poll_category_aggregates" RENAME TO "category_aggregates";

-- Users tables (includes search logs).
ALTER TABLE "public"."users" SET SCHEMA "users";

ALTER TABLE "public"."user_favorites" SET SCHEMA "users";
ALTER TABLE "users"."user_favorites" RENAME TO "favorites";

ALTER TABLE "public"."user_events" SET SCHEMA "users";
ALTER TABLE "users"."user_events" RENAME TO "events";

ALTER TABLE "public"."restaurant_views" SET SCHEMA "users";

ALTER TABLE "public"."search_log" SET SCHEMA "users";
ALTER TABLE "users"."search_log" RENAME TO "search_logs";

-- Collection tables.
ALTER TABLE "public"."subreddits" SET SCHEMA "collection";

ALTER TABLE "public"."source" SET SCHEMA "collection";
ALTER TABLE "collection"."source" RENAME TO "sources";

ALTER TABLE "public"."entity_priority" SET SCHEMA "collection";
ALTER TABLE "collection"."entity_priority" RENAME TO "entity_priority_metrics";

ALTER TABLE "public"."on_demand" SET SCHEMA "collection";
ALTER TABLE "collection"."on_demand" RENAME TO "on_demand_requests";

-- Billing tables.
ALTER TABLE "public"."subscriptions" SET SCHEMA "billing";

ALTER TABLE "public"."user_entitlements" SET SCHEMA "billing";
ALTER TABLE "billing"."user_entitlements" RENAME TO "entitlements";

ALTER TABLE "public"."billing_event_logs" SET SCHEMA "billing";
ALTER TABLE "billing"."billing_event_logs" RENAME TO "event_logs";

ALTER TABLE "public"."checkout_sessions" SET SCHEMA "billing";

-- Notifications tables.
ALTER TABLE "public"."notification_devices" SET SCHEMA "notifications";
ALTER TABLE "notifications"."notification_devices" RENAME TO "devices";

ALTER TABLE "public"."notifications" SET SCHEMA "notifications";
