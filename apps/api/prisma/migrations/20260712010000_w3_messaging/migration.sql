-- W3 messaging (plans/w3-messaging-design.md §2): 1:1 conversations,
-- participant rows (read cursor + request acceptance), messages with a
-- LOUD kind-shape CHECK.

CREATE TYPE "message_kind" AS ENUM ('text', 'entity_share');
CREATE TYPE "shared_entity_kind" AS ENUM ('list', 'restaurant', 'dish', 'poll', 'comment', 'user_profile');

CREATE TABLE "conversations" (
    "conversation_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pair_key" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3) NOT NULL,
    "last_message_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversation_id")
);

CREATE UNIQUE INDEX "uq_conversations_pair_key" ON "conversations"("pair_key");
CREATE INDEX "idx_conversations_last_message_at" ON "conversations"("last_message_at" DESC);

CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_message_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id","user_id")
);

CREATE INDEX "idx_conversation_participants_user" ON "conversation_participants"("user_id", "conversation_id");

CREATE TABLE "messages" (
    "message_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "kind" "message_kind" NOT NULL,
    "body" VARCHAR(2000),
    "shared_entity_kind" "shared_entity_kind",
    "shared_entity_id" TEXT,
    "client_dedupe_id" VARCHAR(64),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id")
);

CREATE UNIQUE INDEX "uq_messages_client_dedupe" ON "messages"("conversation_id", "sender_user_id", "client_dedupe_id");
CREATE INDEX "idx_messages_conversation_cursor" ON "messages"("conversation_id", "created_at" DESC, "message_id" DESC);

-- LOUD kind-shape contract (design §2.2): entity_share carries BOTH ref
-- columns, text carries NEITHER. DB-level so no app path can drift.
ALTER TABLE "messages" ADD CONSTRAINT "ck_messages_kind_shape" CHECK (
    ("kind" = 'entity_share' AND "shared_entity_kind" IS NOT NULL AND "shared_entity_id" IS NOT NULL)
    OR
    ("kind" = 'text' AND "shared_entity_kind" IS NULL AND "shared_entity_id" IS NULL)
);

ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("conversation_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
