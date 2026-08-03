-- The share slug is the capability; a DM share carries it like any other link.
ALTER TABLE "messages" ADD COLUMN "shared_entity_slug" VARCHAR(64);
