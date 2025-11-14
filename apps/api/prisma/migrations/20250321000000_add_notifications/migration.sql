-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('pending', 'scheduled', 'sending', 'sent', 'failed');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('poll_release');

-- CreateEnum
CREATE TYPE "notification_provider" AS ENUM ('expo');

-- CreateTable
CREATE TABLE "notification_devices" (
    "device_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "expo_push_token" VARCHAR(255) NOT NULL,
    "provider" "notification_provider" NOT NULL DEFAULT 'expo',
    "platform" VARCHAR(50),
    "app_version" VARCHAR(32),
    "locale" VARCHAR(16),
    "city" VARCHAR(255),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_devices_pkey" PRIMARY KEY ("device_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_type" "notification_type" NOT NULL,
    "status" "notification_status" NOT NULL DEFAULT 'pending',
    "payload" JSONB DEFAULT '{}',
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "device_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_devices_expo_push_token_key" ON "notification_devices"("expo_push_token");

-- CreateIndex
CREATE INDEX "idx_notification_devices_user_id" ON "notification_devices"("user_id");

-- CreateIndex
CREATE INDEX "idx_notification_devices_city" ON "notification_devices"("city");

-- CreateIndex
CREATE INDEX "idx_notifications_status" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "idx_notifications_scheduled_for" ON "notifications"("scheduled_for");

-- CreateIndex
CREATE INDEX "idx_notifications_device_id" ON "notifications"("device_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "notification_devices"("device_id") ON DELETE SET NULL ON UPDATE CASCADE;

