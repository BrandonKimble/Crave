CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE "collection_subreddits"
  ALTER COLUMN "name" TYPE CITEXT USING "name"::citext,
  ALTER COLUMN "location_name" TYPE CITEXT USING "location_name"::citext;
