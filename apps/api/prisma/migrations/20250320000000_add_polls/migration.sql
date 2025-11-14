-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "poll_topic_status" AS ENUM ('draft', 'ready', 'archived');

-- CreateEnum
CREATE TYPE "poll_state" AS ENUM ('draft', 'scheduled', 'active', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "poll_option_source" AS ENUM ('user', 'seed', 'curator');

-- CreateEnum
CREATE TYPE "poll_option_resolution_status" AS ENUM ('pending', 'matched', 'rejected');

-- CreateEnum
CREATE TYPE "subscription_provider" AS ENUM ('stripe', 'revenuecat', 'manual');

-- CreateEnum
CREATE TYPE "subscription_platform" AS ENUM ('web', 'ios', 'android');

-- CreateEnum
CREATE TYPE "entitlement_status" AS ENUM ('active', 'inactive', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "billing_event_status" AS ENUM ('received', 'processing', 'processed', 'failed');

-- CreateEnum
CREATE TYPE "checkout_session_status" AS ENUM ('pending', 'open', 'completed', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "auth_provider" AS ENUM ('clerk', 'supabase', 'magic_link');

-- DropForeignKey
ALTER TABLE "public"."category_aggregates" DROP CONSTRAINT "restaurant_category_signals_category_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."category_aggregates" DROP CONSTRAINT "restaurant_category_signals_restaurant_id_fkey";

-- DropIndex
DROP INDEX "public"."connections_restaurant_id_food_id_food_attribut_key";

-- DropIndex
DROP INDEX "public"."idx_on_demand_entity";

-- DropIndex
DROP INDEX "public"."idx_on_demand_reason";

-- DropIndex
DROP INDEX "public"."idx_on_demand_status";

-- DropIndex
DROP INDEX "public"."idx_subscriptions_stripe_id";

-- DropIndex
DROP INDEX "public"."subscriptions_stripe_subscription_id_key";

-- AlterTable
ALTER TABLE "boosts" ALTER COLUMN "mention_created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "category_aggregates" RENAME CONSTRAINT "restaurant_category_signals_pkey" TO "category_aggregates_pkey";
ALTER TABLE "category_aggregates" ALTER COLUMN "mentions_count" SET NOT NULL;
ALTER TABLE "category_aggregates" ALTER COLUMN "total_upvotes" SET NOT NULL;
ALTER TABLE "category_aggregates" ALTER COLUMN "first_mentioned_at" SET NOT NULL;
ALTER TABLE "category_aggregates" ALTER COLUMN "first_mentioned_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "category_aggregates" ALTER COLUMN "last_mentioned_at" SET NOT NULL;
ALTER TABLE "category_aggregates" ALTER COLUMN "last_mentioned_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "category_aggregates" ALTER COLUMN "decayed_scores_updated_at" SET DATA TYPE TIMESTAMP(3);

-- Restore referential integrity after column alterations
ALTER TABLE "category_aggregates" ADD CONSTRAINT "category_aggregates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "category_aggregates" ADD CONSTRAINT "category_aggregates_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "connections" ALTER COLUMN "decayed_scores_updated_at" DROP DEFAULT,
ALTER COLUMN "decayed_scores_updated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "boost_last_applied_at" SET DATA TYPE TIMESTAMP(3);

-- Recreate the composite uniqueness guard dropped earlier
CREATE UNIQUE INDEX "connections_restaurant_id_food_id_food_attribut_key" ON "connections"("restaurant_id", "food_id", "food_attributes");

-- AlterTable
ALTER TABLE "entities" ADD COLUMN     "last_polled_at" TIMESTAMP(3),
ALTER COLUMN "price_level" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "on_demand" RENAME CONSTRAINT "search_interests_pkey" TO "on_demand_pkey";
ALTER TABLE "on_demand" ALTER COLUMN "last_seen_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "on_demand" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "on_demand" ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "on_demand" ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "on_demand" ALTER COLUMN "last_enqueued_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "on_demand" ALTER COLUMN "reason" DROP DEFAULT;
ALTER TABLE "on_demand" ALTER COLUMN "last_attempt_at" SET DATA TYPE TIMESTAMP(3);
ALTER TABLE "on_demand" ALTER COLUMN "last_completed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "source" ALTER COLUMN "processed_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "stripe_subscription_id",
ADD COLUMN     "entitlement_code" VARCHAR(255),
ADD COLUMN     "external_customer_id" VARCHAR(255),
ADD COLUMN     "external_subscription_id" VARCHAR(255),
ADD COLUMN     "last_event_id" VARCHAR(255),
ADD COLUMN     "last_event_received_at" TIMESTAMP(3),
ADD COLUMN     "metadata" JSONB DEFAULT '{}',
ADD COLUMN     "plan_name" VARCHAR(255),
ADD COLUMN     "platform" "subscription_platform",
ADD COLUMN     "price_id" VARCHAR(255),
ADD COLUMN     "product_id" VARCHAR(255),
ADD COLUMN     "provider" "subscription_provider" NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auth_provider" "auth_provider" NOT NULL DEFAULT 'clerk',
ADD COLUMN     "auth_provider_user_id" VARCHAR(255),
ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "last_sign_in_at" TIMESTAMP(3),
ADD COLUMN     "revenuecat_app_user_id" VARCHAR(255),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
-- CreateTable
CREATE TABLE "poll_topics" (
    "topic_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" VARCHAR(255) NOT NULL,
    "description" VARCHAR(500),
    "city" VARCHAR(255),
    "region" VARCHAR(255),
    "country" VARCHAR(2),
    "category_entity_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "seed_entity_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "status" "poll_topic_status" NOT NULL DEFAULT 'draft',
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_topics_pkey" PRIMARY KEY ("topic_id")
);

-- CreateTable
CREATE TABLE "polls" (
    "poll_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic_id" UUID NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "state" "poll_state" NOT NULL DEFAULT 'draft',
    "city" VARCHAR(255),
    "region" VARCHAR(255),
    "scheduled_for" TIMESTAMP(3),
    "launched_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "allow_user_additions" BOOLEAN NOT NULL DEFAULT true,
    "audience_filters" JSONB,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("poll_id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "option_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "poll_id" UUID NOT NULL,
    "entity_id" UUID,
    "label" VARCHAR(255) NOT NULL,
    "source" "poll_option_source" NOT NULL DEFAULT 'user',
    "resolution_status" "poll_option_resolution_status" NOT NULL DEFAULT 'pending',
    "added_by_user_id" UUID,
    "vote_count" INTEGER NOT NULL DEFAULT 0,
    "consensus" DECIMAL(7,4) DEFAULT 0,
    "last_vote_at" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("option_id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "poll_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("poll_id","user_id")
);

-- CreateTable
CREATE TABLE "poll_metrics" (
    "poll_id" UUID NOT NULL,
    "total_votes" INTEGER NOT NULL DEFAULT 0,
    "total_participants" INTEGER NOT NULL DEFAULT 0,
    "last_aggregated_at" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',

    CONSTRAINT "poll_metrics_pkey" PRIMARY KEY ("poll_id")
);

-- CreateTable
CREATE TABLE "user_entitlements" (
    "entitlement_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "entitlement_code" VARCHAR(255) NOT NULL,
    "source" "subscription_provider" NOT NULL,
    "platform" "subscription_platform",
    "status" "entitlement_status" NOT NULL DEFAULT 'active',
    "is_grace_period" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "grace_period_ends_at" TIMESTAMP(3),
    "last_event_id" VARCHAR(255),
    "last_synced_at" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_entitlements_pkey" PRIMARY KEY ("entitlement_id")
);

-- CreateTable
CREATE TABLE "billing_event_logs" (
    "event_log_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source" "subscription_provider" NOT NULL,
    "platform" "subscription_platform",
    "external_event_id" VARCHAR(255) NOT NULL,
    "event_type" VARCHAR(255) NOT NULL,
    "status" "billing_event_status" NOT NULL DEFAULT 'received',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "correlation_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_event_logs_pkey" PRIMARY KEY ("event_log_id")
);

-- CreateTable
CREATE TABLE "checkout_sessions" (
    "checkout_session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "subscription_provider" NOT NULL,
    "external_session_id" VARCHAR(255),
    "status" "checkout_session_status" NOT NULL DEFAULT 'pending',
    "url" VARCHAR(2048),
    "cancel_url" VARCHAR(2048),
    "success_url" VARCHAR(2048),
    "expires_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_sessions_pkey" PRIMARY KEY ("checkout_session_id")
);

-- CreateIndex
CREATE INDEX "idx_poll_topics_city" ON "poll_topics"("city");

-- CreateIndex
CREATE INDEX "idx_poll_topics_status" ON "poll_topics"("status");

-- Restore dropped on_demand indexes for scheduler lookups
CREATE INDEX "idx_on_demand_entity" ON "on_demand"("entity_id");
CREATE INDEX "idx_on_demand_reason" ON "on_demand"("reason");
CREATE INDEX "idx_on_demand_status" ON "on_demand"("status");

-- CreateIndex
CREATE INDEX "idx_polls_topic_id" ON "polls"("topic_id");

-- CreateIndex
CREATE INDEX "idx_polls_state" ON "polls"("state");

-- CreateIndex
CREATE INDEX "idx_polls_city" ON "polls"("city");

-- CreateIndex
CREATE INDEX "idx_polls_scheduled_for" ON "polls"("scheduled_for");

-- CreateIndex
CREATE INDEX "idx_poll_options_poll_id" ON "poll_options"("poll_id");

-- CreateIndex
CREATE INDEX "idx_poll_options_entity_id" ON "poll_options"("entity_id");

-- CreateIndex
CREATE INDEX "idx_poll_votes_option_id" ON "poll_votes"("option_id");

-- CreateIndex
CREATE INDEX "idx_user_entitlements_user_id" ON "user_entitlements"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_entitlements_code" ON "user_entitlements"("entitlement_code");

-- CreateIndex
CREATE INDEX "idx_user_entitlements_status" ON "user_entitlements"("status");

-- CreateIndex
CREATE UNIQUE INDEX "user_entitlements_user_code_key" ON "user_entitlements"("user_id", "entitlement_code");

-- CreateIndex
CREATE INDEX "idx_billing_event_status" ON "billing_event_logs"("status");

-- CreateIndex
CREATE INDEX "idx_billing_event_received_at" ON "billing_event_logs"("received_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "billing_event_unique_external" ON "billing_event_logs"("source", "external_event_id");

-- CreateIndex
CREATE INDEX "idx_checkout_sessions_user_id" ON "checkout_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_checkout_sessions_provider" ON "checkout_sessions"("provider");

-- CreateIndex
CREATE INDEX "idx_checkout_sessions_status" ON "checkout_sessions"("status");

-- CreateIndex
CREATE INDEX "idx_checkout_sessions_external_id" ON "checkout_sessions"("external_session_id");

-- CreateIndex
CREATE INDEX "idx_entities_last_polled_at" ON "entities"("last_polled_at");

-- CreateIndex
CREATE INDEX "idx_subscriptions_provider" ON "subscriptions"("provider");

-- CreateIndex
CREATE INDEX "idx_subscriptions_provider_external_id" ON "subscriptions"("provider", "external_subscription_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_provider_customer_id" ON "subscriptions"("provider", "external_customer_id");

-- CreateIndex
CREATE INDEX "idx_subscriptions_entitlement_code" ON "subscriptions"("entitlement_code");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_external_unique" ON "subscriptions"("provider", "external_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_auth_provider_user_id_key" ON "users"("auth_provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_revenuecat_app_user_id_key" ON "users"("revenuecat_app_user_id");

-- CreateIndex
CREATE INDEX "idx_users_auth_provider" ON "users"("auth_provider");

-- CreateIndex
CREATE INDEX "idx_users_auth_provider_user_id" ON "users"("auth_provider_user_id");

-- CreateIndex
CREATE INDEX "idx_users_revenuecat_app_user_id" ON "users"("revenuecat_app_user_id");

-- RenameForeignKey
ALTER TABLE "on_demand" RENAME CONSTRAINT "search_interests_entity_id_fkey" TO "on_demand_entity_id_fkey";

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "poll_topics"("topic_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("poll_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("entity_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("poll_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "poll_options"("option_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_metrics" ADD CONSTRAINT "poll_metrics_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("poll_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_sessions" ADD CONSTRAINT "checkout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
