-- W1 data layer (w1-listdetail-structural-spec.md B.1.3 + RT-18):
-- collaborators table + share-event write dedupe.

-- CreateTable
CREATE TABLE "list_collaborators" (
    "list_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "invited_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "list_collaborators_pkey" PRIMARY KEY ("list_id","user_id")
);

-- CreateIndex
CREATE INDEX "idx_list_collaborators_user" ON "list_collaborators"("user_id");

-- AddForeignKey
ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "favorite_lists"("list_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "list_collaborators" ADD CONSTRAINT "list_collaborators_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: RT-18 share-event write dedupe (unique key = idempotency)
ALTER TABLE "favorite_list_share_events" ADD COLUMN "dedupe_key" VARCHAR(160);

-- CreateIndex
CREATE UNIQUE INDEX "favorite_list_share_events_dedupe_key" ON "favorite_list_share_events"("dedupe_key");
