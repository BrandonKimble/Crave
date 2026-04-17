ALTER TABLE "markets"
ADD COLUMN IF NOT EXISTS "market_short_name" VARCHAR(255);
