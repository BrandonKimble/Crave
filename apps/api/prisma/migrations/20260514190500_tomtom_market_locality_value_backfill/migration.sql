-- Use the locality enum value only after the enum-add migration has committed.

UPDATE "core_markets"
SET "market_type" = 'locality'
WHERE "market_type" = 'local_fallback';
