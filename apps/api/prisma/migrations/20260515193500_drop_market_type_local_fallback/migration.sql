ALTER TYPE "market_type" RENAME TO "market_type_old";

CREATE TYPE "market_type" AS ENUM ('cbsa_metro', 'cbsa_micro', 'locality', 'manual');

ALTER TABLE "core_markets"
  ALTER COLUMN "market_type" TYPE "market_type"
  USING "market_type"::text::"market_type";

DROP TYPE "market_type_old";
