-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('restaurant', 'dish_or_category', 'dish_attribute', 'restaurant_attribute');

-- CreateEnum
CREATE TYPE "activity_level" AS ENUM ('trending', 'active', 'normal');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('trialing', 'active', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "mention_source" AS ENUM ('post', 'comment');

-- CreateTable
CREATE TABLE "entities" (
    "entity_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "type" "entity_type" NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restaurant_attributes" UUID[] DEFAULT ARRAY[]::UUID[],
    "restaurant_quality_score" DECIMAL(10,4) DEFAULT 0,
    "latitude" DECIMAL(10,8),
    "longitude" DECIMAL(11,8),
    "address" VARCHAR(500),
    "google_place_id" VARCHAR(255),
    "restaurant_metadata" JSONB NOT NULL DEFAULT '{}',
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("entity_id")
);

-- CreateTable
CREATE TABLE "connections" (
    "connection_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "restaurant_id" UUID NOT NULL,
    "dish_or_category_id" UUID NOT NULL,
    "categories" UUID[] DEFAULT ARRAY[]::UUID[],
    "dish_attributes" UUID[] DEFAULT ARRAY[]::UUID[],
    "is_menu_item" BOOLEAN NOT NULL DEFAULT true,
    "mention_count" INTEGER NOT NULL DEFAULT 0,
    "total_upvotes" INTEGER NOT NULL DEFAULT 0,
    "source_diversity" INTEGER NOT NULL DEFAULT 0,
    "recent_mention_count" INTEGER NOT NULL DEFAULT 0,
    "last_mentioned_at" TIMESTAMP(3),
    "activity_level" "activity_level" NOT NULL DEFAULT 'normal',
    "top_mentions" JSONB NOT NULL DEFAULT '[]',
    "dish_quality_score" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("connection_id")
);

-- CreateTable
CREATE TABLE "mentions" (
    "mention_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "connection_id" UUID NOT NULL,
    "source_type" "mention_source" NOT NULL,
    "source_id" VARCHAR(255) NOT NULL,
    "source_url" VARCHAR(500) NOT NULL,
    "subreddit" VARCHAR(100) NOT NULL,
    "content_excerpt" TEXT NOT NULL,
    "author" VARCHAR(255),
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("mention_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trial_started_at" TIMESTAMP(3),
    "trial_ends_at" TIMESTAMP(3),
    "subscription_status" "subscription_status" NOT NULL DEFAULT 'trialing',
    "stripe_customer_id" VARCHAR(255),
    "referral_code" VARCHAR(50),
    "referred_by" UUID,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "subscription_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "stripe_subscription_id" VARCHAR(255),
    "status" "subscription_status" NOT NULL,
    "current_period_start" TIMESTAMP(3),
    "current_period_end" TIMESTAMP(3),
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("subscription_id")
);

-- CreateTable
CREATE TABLE "user_events" (
    "event_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "event_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_events_pkey" PRIMARY KEY ("event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entities_google_place_id_key" ON "entities"("google_place_id");

-- CreateIndex
CREATE INDEX "idx_entities_type" ON "entities"("type");

-- CreateIndex
CREATE INDEX "idx_entities_type_score" ON "entities"("type", "restaurant_quality_score" DESC);

-- CreateIndex
CREATE INDEX "idx_entities_name" ON "entities"("name");

-- CreateIndex
CREATE INDEX "idx_entities_aliases" ON "entities"("aliases");

-- CreateIndex
CREATE INDEX "idx_entities_restaurant_attributes" ON "entities"("restaurant_attributes");

-- CreateIndex
CREATE INDEX "idx_entities_location" ON "entities"("longitude", "latitude");

-- CreateIndex
CREATE INDEX "idx_entities_address" ON "entities"("address");

-- CreateIndex
CREATE INDEX "idx_entities_google_place_id" ON "entities"("google_place_id");

-- CreateIndex
CREATE INDEX "idx_entities_last_updated" ON "entities"("last_updated" DESC);

-- CreateIndex
CREATE INDEX "idx_entities_created_at" ON "entities"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "entities_name_type_key" ON "entities"("name", "type");

-- CreateIndex
CREATE INDEX "idx_connections_restaurant" ON "connections"("restaurant_id");

-- CreateIndex
CREATE INDEX "idx_connections_dish" ON "connections"("dish_or_category_id");

-- CreateIndex
CREATE INDEX "idx_connections_categories_gin" ON "connections" USING GIN ("categories");

-- CreateIndex
CREATE INDEX "idx_connections_attributes_gin" ON "connections" USING GIN ("dish_attributes");

-- CreateIndex
CREATE INDEX "idx_connections_menu_item" ON "connections"("is_menu_item");

-- CreateIndex
CREATE INDEX "idx_connections_mention_count" ON "connections"("mention_count" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_total_upvotes" ON "connections"("total_upvotes" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_quality_score" ON "connections"("dish_quality_score" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_last_mentioned" ON "connections"("last_mentioned_at" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_activity" ON "connections"("activity_level");

-- CreateIndex
CREATE INDEX "idx_connections_restaurant_quality" ON "connections"("restaurant_id", "dish_quality_score" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_dish_quality" ON "connections"("dish_or_category_id", "dish_quality_score" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_restaurant_mentions" ON "connections"("restaurant_id", "mention_count" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_dish_mentions" ON "connections"("dish_or_category_id", "mention_count" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_last_updated" ON "connections"("last_updated" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_created_at" ON "connections"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_source_diversity" ON "connections"("source_diversity" DESC);

-- CreateIndex
CREATE INDEX "idx_connections_recent_mentions" ON "connections"("recent_mention_count" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "connections_restaurant_id_dish_or_category_id_dish_attribut_key" ON "connections"("restaurant_id", "dish_or_category_id", "dish_attributes");

-- CreateIndex
CREATE INDEX "idx_mentions_connection" ON "mentions"("connection_id");

-- CreateIndex
CREATE INDEX "idx_mentions_upvotes" ON "mentions"("upvotes" DESC);

-- CreateIndex
CREATE INDEX "idx_mentions_source" ON "mentions"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "idx_mentions_subreddit" ON "mentions"("subreddit");

-- CreateIndex
CREATE INDEX "idx_mentions_created" ON "mentions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_mentions_processed" ON "mentions"("processed_at" DESC);

-- CreateIndex
CREATE INDEX "idx_mentions_author" ON "mentions"("author");

-- CreateIndex
CREATE INDEX "idx_mentions_subreddit_upvotes" ON "mentions"("subreddit", "upvotes" DESC);

-- CreateIndex
CREATE INDEX "idx_mentions_source_type_created" ON "mentions"("source_type", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "idx_users_email" ON "users"("email");

-- CreateIndex
CREATE INDEX "idx_users_subscription_status" ON "users"("subscription_status");

-- CreateIndex
CREATE INDEX "idx_users_created_at" ON "users"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_users_trial_ends_at" ON "users"("trial_ends_at");

-- CreateIndex
CREATE INDEX "idx_users_referral_code" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "idx_users_referred_by" ON "users"("referred_by");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_user_id" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_status" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "idx_subscriptions_period_end" ON "subscriptions"("current_period_end");

-- CreateIndex
CREATE INDEX "idx_subscriptions_stripe_id" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_created_at" ON "subscriptions"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_events_user_id" ON "user_events"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_events_event_type" ON "user_events"("event_type");

-- CreateIndex
CREATE INDEX "idx_user_events_created_at" ON "user_events"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_events_user_type" ON "user_events"("user_id", "event_type");

-- CreateIndex
CREATE INDEX "idx_user_events_user_created" ON "user_events"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "entities"("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_dish_or_category_id_fkey" FOREIGN KEY ("dish_or_category_id") REFERENCES "entities"("entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("connection_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_events" ADD CONSTRAINT "user_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
