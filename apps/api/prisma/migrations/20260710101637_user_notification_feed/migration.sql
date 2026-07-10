-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'follower_added';

-- DropForeignKey
ALTER TABLE "public"."photos" DROP CONSTRAINT "photos_connection_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."photos" DROP CONSTRAINT "photos_restaurant_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."photos" DROP CONSTRAINT "photos_user_id_fkey";

-- DropIndex
-- (removed) Prisma drift-diff tried to DROP idx_entities_name_embedding_hnsw —
-- an index it cannot model; see migration 20260705003434 + the tripwire spec.

-- DropEnum
DROP TYPE "public"."checkout_session_status";

-- CreateTable
CREATE TABLE "user_notifications" (
    "user_notification_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "notification_type" "notification_type" NOT NULL,
    "payload" JSONB DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("user_notification_id")
);

-- CreateIndex
CREATE INDEX "idx_user_notifications_user_created" ON "user_notifications"("user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "core_restaurant_items"("connection_id") ON DELETE SET NULL ON UPDATE CASCADE;
