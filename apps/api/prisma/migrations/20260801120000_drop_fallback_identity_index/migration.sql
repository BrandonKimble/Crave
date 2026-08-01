-- The fallback lane is deleted ("TomTom or nothing", owner ruling
-- 2026-08-01): provider='fallback' places can no longer be minted (zero
-- were ever minted on prod), so the partial identity index that made the
-- synthetic tuple idempotent has nothing left to guard.
DROP INDEX IF EXISTS uq_places_fallback_identity;
