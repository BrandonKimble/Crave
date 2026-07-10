-- Ideal-shape review 2026-07-09: one truth (access_grants), one cache
-- (Redis), one mirror (billing_subscriptions). Everything below was a
-- redundant copy of access/subscription state (or modeled the not-yet-built
-- web checkout rail) with no load-bearing readers.
DROP TABLE IF EXISTS "billing_entitlements";
DROP TABLE IF EXISTS "billing_checkout_sessions";
ALTER TABLE "users"
  DROP COLUMN IF EXISTS "subscription_status",
  DROP COLUMN IF EXISTS "trial_started_at",
  DROP COLUMN IF EXISTS "trial_ends_at",
  DROP COLUMN IF EXISTS "referral_code",
  DROP COLUMN IF EXISTS "referred_by";
DROP TYPE IF EXISTS "CheckoutSessionStatus";
