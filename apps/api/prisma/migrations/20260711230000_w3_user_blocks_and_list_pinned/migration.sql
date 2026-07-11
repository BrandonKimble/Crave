-- W3 (page-registry §8.6 blocking + §8.12/§8.14 profile list pins)

ALTER TABLE "favorite_lists" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "user_blocks" (
    "blocker_user_id" UUID NOT NULL,
    "blocked_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_user_id","blocked_user_id")
);

CREATE INDEX "idx_user_blocks_blocked" ON "user_blocks"("blocked_user_id");

ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_user_id_fkey" FOREIGN KEY ("blocker_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_user_id_fkey" FOREIGN KEY ("blocked_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
