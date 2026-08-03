-- RESTORE THE WEB CHECKOUT ATTEMPT LOG (owner ruling 2026-08-03).
--
-- 20260709040000_delete_redundant_truth dropped "billing_checkout_sessions"
-- under the then-true rationale "models a rail that doesn't exist". The rail
-- now exists (business/business-model.md, "Margin lever"): Stripe Checkout is
-- the primary paywall button. The table comes back for exactly one job — the
-- ATTEMPT log joining a Stripe session id to our user. Entitlements are NOT
-- here; the access-grant ledger remains the one truth.
--
-- The enum type was never dropped with the table (the drop was DROP TABLE
-- only), so it survives orphaned on every database that ran the 2025-03
-- baseline — but NOT on one created after. DROP-then-CREATE makes the outcome
-- identical either way; nothing references it at this point in history.
DROP TYPE IF EXISTS "checkout_session_status";
CREATE TYPE "checkout_session_status" AS ENUM ('pending', 'open', 'completed', 'expired', 'cancelled');

CREATE TABLE "billing_checkout_sessions" (
    "checkout_session_id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "provider" "subscription_provider" NOT NULL,
    "external_session_id" VARCHAR(255),
    -- timestamptz throughout: see 20260802060000_timestamptz_everywhere. A
    -- recreated table must not reintroduce the naive-column class.
    "status" "checkout_session_status" NOT NULL DEFAULT 'pending',
    "url" VARCHAR(2048),
    "cancel_url" VARCHAR(2048),
    "success_url" VARCHAR(2048),
    "expires_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "billing_checkout_sessions_pkey" PRIMARY KEY ("checkout_session_id")
);

CREATE INDEX "idx_checkout_sessions_user_id" ON "billing_checkout_sessions"("user_id");
CREATE INDEX "idx_checkout_sessions_provider" ON "billing_checkout_sessions"("provider");
CREATE INDEX "idx_checkout_sessions_status" ON "billing_checkout_sessions"("status");
CREATE INDEX "idx_checkout_sessions_external_id" ON "billing_checkout_sessions"("external_session_id");

-- RESTRICT, matching the user-layer FK law: a checkout attempt is billing
-- evidence, so a user row cannot vanish out from under it silently.
ALTER TABLE "billing_checkout_sessions"
  ADD CONSTRAINT "billing_checkout_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
