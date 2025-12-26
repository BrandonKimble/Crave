-- User profile, username system, favorites lists, and follow stats.
CREATE TYPE "favorite_list_type" AS ENUM ('restaurant', 'dish');
CREATE TYPE "favorite_list_visibility" AS ENUM ('public', 'private');
CREATE TYPE "favorite_list_share_event_type" AS ENUM ('created', 'opened', 'copied', 'revoked');
CREATE TYPE "username_status" AS ENUM ('unset', 'pending', 'active');

ALTER TABLE "users"
  ADD COLUMN "username" citext,
  ADD COLUMN "display_name" varchar(255),
  ADD COLUMN "avatar_url" varchar(2048),
  ADD COLUMN "username_status" "username_status" NOT NULL DEFAULT 'unset',
  ADD COLUMN "username_updated_at" timestamp(3);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "idx_users_username" ON "users"("username");

CREATE TABLE "user_stats" (
  "user_id" uuid NOT NULL,
  "polls_created_count" integer NOT NULL DEFAULT 0,
  "polls_contributed_count" integer NOT NULL DEFAULT 0,
  "followers_count" integer NOT NULL DEFAULT 0,
  "following_count" integer NOT NULL DEFAULT 0,
  "favorite_lists_count" integer NOT NULL DEFAULT 0,
  "favorites_total_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp(3) NOT NULL,

  CONSTRAINT "user_stats_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "user_follows" (
  "follower_user_id" uuid NOT NULL,
  "following_user_id" uuid NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_follows_pkey" PRIMARY KEY ("follower_user_id", "following_user_id"),
  CONSTRAINT "user_follows_not_self" CHECK ("follower_user_id" <> "following_user_id")
);

CREATE INDEX "idx_user_follows_follower" ON "user_follows"("follower_user_id");
CREATE INDEX "idx_user_follows_following" ON "user_follows"("following_user_id");

CREATE TABLE "reserved_usernames" (
  "username" citext NOT NULL,
  "reason" varchar(255),
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "reserved_usernames_pkey" PRIMARY KEY ("username")
);

CREATE TABLE "username_history" (
  "user_id" uuid NOT NULL,
  "username" citext NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "username_history_pkey" PRIMARY KEY ("user_id", "username")
);

CREATE INDEX "idx_username_history_username" ON "username_history"("username");

CREATE TABLE "favorite_lists" (
  "list_id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "name" varchar(120) NOT NULL,
  "description" varchar(500),
  "list_type" "favorite_list_type" NOT NULL,
  "visibility" "favorite_list_visibility" NOT NULL DEFAULT 'private',
  "item_count" integer NOT NULL DEFAULT 0,
  "position" integer NOT NULL DEFAULT 0,
  "share_slug" varchar(64),
  "share_enabled" boolean NOT NULL DEFAULT false,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(3) NOT NULL,

  CONSTRAINT "favorite_lists_pkey" PRIMARY KEY ("list_id")
);

CREATE UNIQUE INDEX "favorite_lists_owner_type_name" ON "favorite_lists"("owner_user_id", "list_type", "name");
CREATE UNIQUE INDEX "favorite_lists_share_slug_key" ON "favorite_lists"("share_slug");
CREATE INDEX "idx_favorite_lists_owner" ON "favorite_lists"("owner_user_id");
CREATE INDEX "idx_favorite_lists_visibility" ON "favorite_lists"("visibility");
CREATE INDEX "idx_favorite_lists_type" ON "favorite_lists"("list_type");
CREATE INDEX "idx_favorite_lists_updated_at" ON "favorite_lists"("updated_at");

CREATE TABLE "favorite_list_items" (
  "item_id" uuid NOT NULL,
  "list_id" uuid NOT NULL,
  "added_by_user_id" uuid,
  "restaurant_id" uuid,
  "connection_id" uuid,
  "position" integer NOT NULL DEFAULT 0,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp(3) NOT NULL,

  CONSTRAINT "favorite_list_items_pkey" PRIMARY KEY ("item_id"),
  CONSTRAINT "favorite_list_items_one_target" CHECK (
    (CASE WHEN "restaurant_id" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "connection_id" IS NULL THEN 0 ELSE 1 END) = 1
  )
);

CREATE UNIQUE INDEX "favorite_list_items_list_restaurant" ON "favorite_list_items"("list_id", "restaurant_id");
CREATE UNIQUE INDEX "favorite_list_items_list_connection" ON "favorite_list_items"("list_id", "connection_id");
CREATE INDEX "idx_favorite_list_items_list" ON "favorite_list_items"("list_id");
CREATE INDEX "idx_favorite_list_items_restaurant" ON "favorite_list_items"("restaurant_id");
CREATE INDEX "idx_favorite_list_items_connection" ON "favorite_list_items"("connection_id");
CREATE INDEX "idx_favorite_list_items_added_by" ON "favorite_list_items"("added_by_user_id");

CREATE TABLE "favorite_list_share_events" (
  "event_id" uuid NOT NULL,
  "list_id" uuid NOT NULL,
  "share_slug" varchar(64),
  "event_type" "favorite_list_share_event_type" NOT NULL,
  "created_at" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "favorite_list_share_events_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "idx_favorite_list_share_events_list" ON "favorite_list_share_events"("list_id");
CREATE INDEX "idx_favorite_list_share_events_type" ON "favorite_list_share_events"("event_type");

ALTER TABLE "user_stats"
  ADD CONSTRAINT "user_stats_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_follows"
  ADD CONSTRAINT "user_follows_follower_user_id_fkey"
  FOREIGN KEY ("follower_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_follows"
  ADD CONSTRAINT "user_follows_following_user_id_fkey"
  FOREIGN KEY ("following_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "username_history"
  ADD CONSTRAINT "username_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_lists"
  ADD CONSTRAINT "favorite_lists_owner_user_id_fkey"
  FOREIGN KEY ("owner_user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_list_items"
  ADD CONSTRAINT "favorite_list_items_list_id_fkey"
  FOREIGN KEY ("list_id") REFERENCES "favorite_lists"("list_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_list_items"
  ADD CONSTRAINT "favorite_list_items_added_by_user_id_fkey"
  FOREIGN KEY ("added_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "favorite_list_items"
  ADD CONSTRAINT "favorite_list_items_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_list_items"
  ADD CONSTRAINT "favorite_list_items_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "core_connections"("connection_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "favorite_list_share_events"
  ADD CONSTRAINT "favorite_list_share_events_list_id_fkey"
  FOREIGN KEY ("list_id") REFERENCES "favorite_lists"("list_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill default lists from legacy user_favorites.
INSERT INTO "favorite_lists" (
  "list_id",
  "owner_user_id",
  "name",
  "list_type",
  "visibility",
  "item_count",
  "position",
  "share_enabled",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  uf."user_id",
  'My Restaurants',
  'restaurant',
  'private',
  0,
  0,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "user_id"
  FROM "user_favorites"
  WHERE "entity_type" = 'restaurant'
) uf
ON CONFLICT ("owner_user_id", "list_type", "name") DO NOTHING;

INSERT INTO "favorite_lists" (
  "list_id",
  "owner_user_id",
  "name",
  "list_type",
  "visibility",
  "item_count",
  "position",
  "share_enabled",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  uf."user_id",
  'My Dishes',
  'dish',
  'private',
  0,
  1,
  false,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "user_id"
  FROM "user_favorites"
  WHERE "entity_type" = 'food'
) uf
ON CONFLICT ("owner_user_id", "list_type", "name") DO NOTHING;

INSERT INTO "favorite_list_items" (
  "item_id",
  "list_id",
  "added_by_user_id",
  "restaurant_id",
  "position",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  fl."list_id",
  uf."user_id",
  uf."entity_id",
  ROW_NUMBER() OVER (PARTITION BY uf."user_id" ORDER BY uf."created_at" DESC),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user_favorites" uf
JOIN "favorite_lists" fl
  ON fl."owner_user_id" = uf."user_id"
  AND fl."list_type" = 'restaurant'
  AND fl."name" = 'My Restaurants'
WHERE uf."entity_type" = 'restaurant';

INSERT INTO "favorite_list_items" (
  "item_id",
  "list_id",
  "added_by_user_id",
  "connection_id",
  "position",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  fl."list_id",
  uf."user_id",
  conn."connection_id",
  ROW_NUMBER() OVER (PARTITION BY uf."user_id" ORDER BY uf."created_at" DESC),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "user_favorites" uf
JOIN "favorite_lists" fl
  ON fl."owner_user_id" = uf."user_id"
  AND fl."list_type" = 'dish'
  AND fl."name" = 'My Dishes'
JOIN LATERAL (
  SELECT "connection_id"
  FROM "core_connections"
  WHERE "food_id" = uf."entity_id"
  ORDER BY "food_quality_score" DESC, "mention_count" DESC
  LIMIT 1
) conn ON true
WHERE uf."entity_type" = 'food';

UPDATE "favorite_lists" fl
SET "item_count" = counts."item_count"
FROM (
  SELECT "list_id", COUNT(*)::int AS "item_count"
  FROM "favorite_list_items"
  GROUP BY "list_id"
) counts
WHERE fl."list_id" = counts."list_id";

INSERT INTO "user_stats" (
  "user_id",
  "polls_created_count",
  "polls_contributed_count",
  "followers_count",
  "following_count",
  "favorite_lists_count",
  "favorites_total_count",
  "updated_at"
)
SELECT
  u."user_id",
  0,
  0,
  0,
  0,
  COALESCE(lists."count", 0),
  COALESCE(items."count", 0),
  CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN (
  SELECT "owner_user_id", COUNT(*)::int AS "count"
  FROM "favorite_lists"
  GROUP BY "owner_user_id"
) lists ON lists."owner_user_id" = u."user_id"
LEFT JOIN (
  SELECT fl."owner_user_id", COUNT(*)::int AS "count"
  FROM "favorite_list_items" fli
  JOIN "favorite_lists" fl ON fl."list_id" = fli."list_id"
  GROUP BY fl."owner_user_id"
) items ON items."owner_user_id" = u."user_id";
