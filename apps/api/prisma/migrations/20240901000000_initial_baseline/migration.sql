CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "public"."OnDemandOutcome" AS ENUM ('success', 'no_results', 'error', 'deferred', 'no_active_subreddits');

-- CreateEnum
CREATE TYPE "public"."OnDemandReason" AS ENUM ('low_result', 'unresolved');

-- CreateEnum
CREATE TYPE "public"."OnDemandStatus" AS ENUM ('pending', 'queued', 'processing', 'completed');

-- CreateEnum
CREATE TYPE "public"."activity_level" AS ENUM ('trending', 'active', 'normal');

-- CreateEnum
CREATE TYPE "public"."entity_type" AS ENUM ('restaurant', 'food', 'food_attribute', 'restaurant_attribute');

-- CreateEnum
CREATE TYPE "public"."mention_source" AS ENUM ('post', 'comment');

-- CreateEnum
CREATE TYPE "public"."subscription_status" AS ENUM ('trialing', 'active', 'cancelled', 'expired');

-- CreateTable
CREATE TABLE "public"."boosts" (
    "boost_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "food_attribute_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "mention_created_at" TIMESTAMPTZ(6) NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boosts_pkey" PRIMARY KEY ("boost_id")
);

-- CreateTable
CREATE TABLE "public"."category_aggregates" (
    "restaurant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "mentions_count" INTEGER DEFAULT 0,
    "total_upvotes" INTEGER DEFAULT 0,
    "first_mentioned_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "last_mentioned_at" TIMESTAMP(6),
    "decayed_mention_score" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "decayed_upvote_score" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "decayed_scores_updated_at" TIMESTAMPTZ(6),

    CONSTRAINT "restaurant_category_signals_pkey" PRIMARY KEY ("restaurant_id","category_id")
);

-- CreateTable
CREATE TABLE "public"."connections" (
    "connection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "food_id" UUID NOT NULL,
    "categories" UUID[] DEFAULT ARRAY[]::UUID[],
    "food_attributes" UUID[] DEFAULT ARRAY[]::UUID[],
    "mention_count" INTEGER NOT NULL DEFAULT 0,
    "total_upvotes" INTEGER NOT NULL DEFAULT 0,
    "recent_mention_count" INTEGER NOT NULL DEFAULT 0,
    "last_mentioned_at" TIMESTAMP(3),
    "activity_level" "public"."activity_level" NOT NULL DEFAULT 'normal',
    "food_quality_score" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decayed_mention_score" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "decayed_upvote_score" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "decayed_scores_updated_at" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "boost_last_applied_at" TIMESTAMPTZ(6),

    CONSTRAINT "connections_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable
CREATE TABLE "public"."entities" (
    "entity_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "type" "public"."entity_type" NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restaurant_attributes" UUID[] DEFAULT ARRAY[]::UUID[],
    "restaurant_quality_score" DECIMAL(10,4) DEFAULT 0,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "address" VARCHAR(500),
    "google_place_id" VARCHAR(255),
    "restaurant_metadata" JSONB,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "general_praise_upvotes" INTEGER DEFAULT 0,
    "city" VARCHAR(255),
    "region" VARCHAR(255),
    "country" VARCHAR(2),
    "postal_code" VARCHAR(32),
    "price_level" SMALLINT,
    "price_level_updated_at" TIMESTAMP(3),

    CONSTRAINT "entities_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "public"."entity_priority" (
    "entity_id" UUID NOT NULL,
    "entity_type" "public"."entity_type" NOT NULL,
    "priority_score" DECIMAL(9,4) DEFAULT 0,
    "data_recency_score" DECIMAL(9,4) DEFAULT 0,
    "data_quality_score" DECIMAL(9,4) DEFAULT 0,
    "user_demand_score" DECIMAL(9,4) DEFAULT 0,
    "is_new_entity" BOOLEAN NOT NULL DEFAULT false,
    "last_calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_selected_at" TIMESTAMP(3),
    "query_impressions" INTEGER NOT NULL DEFAULT 0,
    "query_clicks" INTEGER NOT NULL DEFAULT 0,
    "last_query_at" TIMESTAMP(3),

    CONSTRAINT "entity_priority_pkey" PRIMARY KEY ("entity_id")
);

-- Helper function for validating UUID array references
CREATE OR REPLACE FUNCTION validate_entity_references(entity_ids UUID[])
RETURNS BOOLEAN AS $$
BEGIN
  IF array_length(entity_ids, 1) IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN (
    SELECT COUNT(*)
    FROM unnest(entity_ids) AS id
    WHERE id NOT IN (SELECT entity_id FROM "public"."entities")
  ) = 0;
END;
$$ LANGUAGE plpgsql;

-- CreateTable
CREATE TABLE "public"."on_demand" (
    "request_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "term" VARCHAR(255) NOT NULL,
    "entity_type" "public"."entity_type" NOT NULL,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "public"."OnDemandStatus" NOT NULL DEFAULT 'pending',
    "entity_id" UUID,
    "last_enqueued_at" TIMESTAMPTZ(6),
    "reason" "public"."OnDemandReason" NOT NULL DEFAULT 'unresolved',
    "result_restaurant_count" INTEGER NOT NULL DEFAULT 0,
    "result_food_count" INTEGER NOT NULL DEFAULT 0,
    "attempted_subreddits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deferred_attempts" INTEGER NOT NULL DEFAULT 0,
    "last_outcome" "public"."OnDemandOutcome",
    "last_attempt_at" TIMESTAMPTZ(6),
    "last_completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "search_interests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "public"."source" (
    "pipeline" VARCHAR(32) NOT NULL,
    "source_id" VARCHAR(64) NOT NULL,
    "subreddit" VARCHAR(100),
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_pkey" PRIMARY KEY ("pipeline","source_id")
);

-- CreateTable
CREATE TABLE "public"."subreddits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "avg_posts_per_day" DOUBLE PRECISION NOT NULL,
    "last_calculated" TIMESTAMPTZ(6) NOT NULL,
    "last_processed" TIMESTAMPTZ(6),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "safe_interval_days" DOUBLE PRECISION NOT NULL,
    "center_latitude" DECIMAL(10,8),
    "center_longitude" DECIMAL(11,8),

    CONSTRAINT "subreddits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subscriptions" (
    "subscription_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "stripe_subscription_id" VARCHAR(255),
    "status" "public"."subscription_status" NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "public"."user_events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "event_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateTable
CREATE TABLE "public"."users" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "subscription_status" "public"."subscription_status" NOT NULL DEFAULT 'trialing',
    "stripe_customer_id" VARCHAR(255),
    "referral_code" VARCHAR(50),
    "referred_by" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE INDEX "idx_boosts_category" ON "public"."boosts"("category_id" ASC);

-- CreateIndex
CREATE INDEX "idx_boosts_food_attributes" ON "public"."boosts" USING GIN ("food_attribute_ids");

-- CreateIndex
CREATE INDEX "idx_boosts_restaurant" ON "public"."boosts"("restaurant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_boosts_restaurant_category_time" ON "public"."boosts"("restaurant_id" ASC, "category_id" ASC, "mention_created_at" ASC);

-- CreateIndex
CREATE INDEX "idx_category_aggregate_category" ON "public"."category_aggregates"("category_id" ASC);

-- CreateIndex
CREATE INDEX "idx_category_aggregate_restaurant" ON "public"."category_aggregates"("restaurant_id" ASC, "total_upvotes" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "connections_restaurant_id_food_id_food_attribut_key" ON "public"."connections"("restaurant_id" ASC, "food_id" ASC, "food_attributes" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "connections_restaurant_id_food_id_key" ON "public"."connections"("restaurant_id" ASC, "food_id" ASC);

-- CreateIndex
CREATE INDEX "idx_connections_activity" ON "public"."connections"("activity_level" ASC);

-- CreateIndex
CREATE INDEX "idx_connections_attributes_gin" ON "public"."connections" USING GIN ("food_attributes");

-- CreateIndex
CREATE INDEX "idx_connections_categories_gin" ON "public"."connections" USING GIN ("categories");

-- CreateIndex
CREATE INDEX "idx_connections_created_at" ON "public"."connections"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_food" ON "public"."connections"("food_id" ASC);

-- CreateIndex
CREATE INDEX "idx_connections_food_mentions" ON "public"."connections"("food_id" ASC, "mention_count" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_food_quality" ON "public"."connections"("food_id" ASC, "food_quality_score" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_last_mentioned" ON "public"."connections"("last_mentioned_at" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_last_updated" ON "public"."connections"("last_updated" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_mention_count" ON "public"."connections"("mention_count" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_quality_score" ON "public"."connections"("food_quality_score" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_recent_mentions" ON "public"."connections"("recent_mention_count" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_restaurant" ON "public"."connections"("restaurant_id" ASC);

-- CreateIndex
CREATE INDEX "idx_connections_restaurant_mentions" ON "public"."connections"("restaurant_id" ASC, "mention_count" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_restaurant_quality" ON "public"."connections"("restaurant_id" ASC, "food_quality_score" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_total_upvotes" ON "public"."connections"("total_upvotes" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "entities_google_place_id_key" ON "public"."entities"("google_place_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "entities_name_type_key" ON "public"."entities"("name" ASC, "type" ASC);

-- CreateIndex
CREATE INDEX "idx_entities_address" ON "public"."entities" USING gin ("address" gin_trgm_ops) WHERE "type" = 'restaurant';

-- CreateIndex
CREATE INDEX "idx_entities_aliases" ON "public"."entities" USING gin ("aliases");

-- CreateIndex
CREATE INDEX "idx_entities_city" ON "public"."entities"("city" ASC);

-- CreateIndex
CREATE INDEX "idx_entities_country" ON "public"."entities"("country" ASC);

-- CreateIndex
CREATE INDEX "idx_entities_created_at" ON "public"."entities"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_entities_google_place_id" ON "public"."entities"("google_place_id" ASC);

-- CreateIndex
CREATE INDEX "idx_entities_last_updated" ON "public"."entities"("last_updated" DESC);

-- CreateIndex
CREATE INDEX "idx_entities_location" ON "public"."entities"("longitude" ASC, "latitude" ASC);

-- CreateIndex
CREATE INDEX "idx_entities_name" ON "public"."entities" USING gin ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_entities_price_level" ON "public"."entities"("price_level" ASC);

-- CreateIndex
CREATE INDEX "idx_entities_region" ON "public"."entities"("region" ASC);

-- CreateIndex
CREATE INDEX "idx_entities_restaurant_attributes" ON "public"."entities" USING gin ("restaurant_attributes") WHERE "type" = 'restaurant';

-- CreateIndex
CREATE INDEX "idx_entities_type" ON "public"."entities"("type" ASC);

-- CreateIndex
CREATE INDEX "idx_entities_type_score" ON "public"."entities"("type" ASC, "restaurant_quality_score" DESC);

-- CreateIndex
CREATE INDEX "idx_entity_priority_calculated" ON "public"."entity_priority"("last_calculated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_entity_priority_type" ON "public"."entity_priority"("entity_type" ASC);

-- CreateIndex
CREATE INDEX "idx_on_demand_entity" ON "public"."on_demand"("entity_id" ASC);

-- CreateIndex
CREATE INDEX "idx_on_demand_reason" ON "public"."on_demand"("reason" ASC);

-- CreateIndex
CREATE INDEX "idx_on_demand_status" ON "public"."on_demand"("status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "on_demand_term_entity_type_reason_key" ON "public"."on_demand"("term" ASC, "entity_type" ASC, "reason" ASC);

-- CreateIndex
CREATE INDEX "idx_source_pipeline" ON "public"."source"("pipeline" ASC);

-- CreateIndex
CREATE INDEX "idx_source_processed_at" ON "public"."source"("processed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_source_subreddit" ON "public"."source"("subreddit" ASC);

-- CreateIndex
CREATE INDEX "subreddits_is_active_idx" ON "public"."subreddits"("is_active" ASC);

-- CreateIndex
CREATE INDEX "subreddits_last_processed_idx" ON "public"."subreddits"("last_processed" ASC);

-- CreateIndex
CREATE INDEX "subreddits_name_idx" ON "public"."subreddits"("name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "subreddits_name_key" ON "public"."subreddits"("name" ASC);

-- CreateIndex
CREATE INDEX "subreddits_safe_interval_days_idx" ON "public"."subreddits"("safe_interval_days" ASC);

-- CreateIndex
CREATE INDEX "idx_subscriptions_created_at" ON "public"."subscriptions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_subscriptions_period_end" ON "public"."subscriptions"("current_period_end" ASC);

-- CreateIndex
CREATE INDEX "idx_subscriptions_status" ON "public"."subscriptions"("status" ASC);

-- CreateIndex
CREATE INDEX "idx_subscriptions_stripe_id" ON "public"."subscriptions"("stripe_subscription_id" ASC);

-- CreateIndex
CREATE INDEX "idx_subscriptions_user_id" ON "public"."subscriptions"("user_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "public"."subscriptions"("stripe_subscription_id" ASC);

-- CreateIndex
CREATE INDEX "idx_user_events_created_at" ON "public"."user_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_events_event_type" ON "public"."user_events"("event_type" ASC);

-- CreateIndex
CREATE INDEX "idx_user_events_user_created" ON "public"."user_events"("user_id" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_events_user_id" ON "public"."user_events"("user_id" ASC);

-- CreateIndex
CREATE INDEX "idx_user_events_user_type" ON "public"."user_events"("user_id" ASC, "event_type" ASC);

-- CreateIndex
CREATE INDEX "idx_users_created_at" ON "public"."users"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_users_email" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE INDEX "idx_users_referral_code" ON "public"."users"("referral_code" ASC);

-- CreateIndex
CREATE INDEX "idx_users_referred_by" ON "public"."users"("referred_by" ASC);

-- CreateIndex
CREATE INDEX "idx_users_subscription_status" ON "public"."users"("subscription_status" ASC);

-- CreateIndex
CREATE INDEX "idx_users_trial_ends_at" ON "public"."users"("trial_ends_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "public"."users"("referral_code" ASC);

-- AddForeignKey
ALTER TABLE "public"."category_aggregates" ADD CONSTRAINT "restaurant_category_signals_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."category_aggregates" ADD CONSTRAINT "restaurant_category_signals_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."connections" ADD CONSTRAINT "connections_food_id_fkey" FOREIGN KEY ("food_id") REFERENCES "public"."entities"("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."connections" ADD CONSTRAINT "connections_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "public"."entities"("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entity_priority" ADD CONSTRAINT "entity_priority_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."on_demand" ADD CONSTRAINT "search_interests_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_events" ADD CONSTRAINT "user_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "public"."users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Advanced data integrity constraints preserved from legacy migrations
ALTER TABLE "public"."entities" ADD CONSTRAINT "check_restaurant_quality_score_range"
CHECK (restaurant_quality_score IS NULL OR (restaurant_quality_score >= 0 AND restaurant_quality_score <= 100));

ALTER TABLE "public"."entities" ADD CONSTRAINT "check_location_consistency"
CHECK (
  (latitude IS NULL AND longitude IS NULL)
  OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

ALTER TABLE "public"."entities" ADD CONSTRAINT "check_restaurant_specific_fields"
CHECK (
  (type = 'restaurant')
  OR (type <> 'restaurant' AND latitude IS NULL AND longitude IS NULL AND address IS NULL AND google_place_id IS NULL)
);

ALTER TABLE "public"."entities" ADD CONSTRAINT "check_restaurant_attributes_exist"
CHECK (validate_entity_references(restaurant_attributes));

ALTER TABLE "public"."connections" ADD CONSTRAINT "check_mention_count_positive"
CHECK (mention_count >= 0);

ALTER TABLE "public"."connections" ADD CONSTRAINT "check_total_upvotes_positive"
CHECK (total_upvotes >= 0);

ALTER TABLE "public"."connections" ADD CONSTRAINT "check_recent_mention_count_positive"
CHECK (recent_mention_count >= 0);

ALTER TABLE "public"."connections" ADD CONSTRAINT "check_food_quality_score_range"
CHECK (food_quality_score >= 0 AND food_quality_score <= 100);

ALTER TABLE "public"."connections" ADD CONSTRAINT "check_categories_exist"
CHECK (validate_entity_references(categories));

ALTER TABLE "public"."connections" ADD CONSTRAINT "check_food_attributes_exist"
CHECK (validate_entity_references(food_attributes));

ALTER TABLE "public"."users" ADD CONSTRAINT "check_trial_dates_consistency"
CHECK (
  (trial_started_at IS NULL AND trial_ends_at IS NULL)
  OR (trial_started_at IS NOT NULL AND trial_ends_at IS NOT NULL AND trial_started_at <= trial_ends_at)
);

ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "check_subscription_period_consistency"
CHECK (
  (current_period_start IS NULL AND current_period_end IS NULL)
  OR (current_period_start IS NOT NULL AND current_period_end IS NOT NULL AND current_period_start <= current_period_end)
);

ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "check_cancelled_at_consistency"
CHECK (
  cancelled_at IS NULL
  OR (cancelled_at IS NOT NULL AND status IN ('cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_entities_type_validation
ON "public"."entities"("type") WHERE "type" = 'restaurant';

CREATE INDEX IF NOT EXISTS idx_entities_restaurant_attributes_validation
ON "public"."entities" USING gin ("restaurant_attributes") WHERE "type" = 'restaurant';

COMMENT ON CONSTRAINT check_restaurant_quality_score_range ON "public"."entities" IS 'Ensures restaurant quality scores stay within 0-100.';
COMMENT ON CONSTRAINT check_location_consistency ON "public"."entities" IS 'Latitude/longitude must both be null or both valid coordinates.';
COMMENT ON CONSTRAINT check_restaurant_specific_fields ON "public"."entities" IS 'Non-restaurant entities cannot carry restaurant-only fields.';
COMMENT ON CONSTRAINT check_restaurant_attributes_exist ON "public"."entities" IS 'Restaurant attribute UUIDs must reference existing entities.';
COMMENT ON CONSTRAINT check_mention_count_positive ON "public"."connections" IS 'Mention counts must be non-negative.';
COMMENT ON CONSTRAINT check_food_quality_score_range ON "public"."connections" IS 'Food quality scores must remain within 0-100.';
COMMENT ON CONSTRAINT check_categories_exist ON "public"."connections" IS 'Category UUID arrays must reference valid entities.';
COMMENT ON CONSTRAINT check_food_attributes_exist ON "public"."connections" IS 'Food attribute UUID arrays must reference valid entities.';
COMMENT ON FUNCTION validate_entity_references(UUID[]) IS 'Validates that every UUID in the supplied array exists in entities.';
