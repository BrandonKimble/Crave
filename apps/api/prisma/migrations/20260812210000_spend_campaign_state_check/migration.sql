-- Campaign lifecycle hardening (2026-08-12): the state column is free text
-- with the legal vocabulary living only in code (CAMPAIGN_STATE_TRANSITIONS,
-- spend-campaign.service.ts). This CHECK makes an out-of-vocabulary state
-- unrepresentable at the storage layer — a typo'd hand-fix or a drifted
-- writer fails loudly instead of minting a state no reader knows.
--
-- AUTHORED create-only and left UNAPPLIED on purpose (iteration phase, no
-- prod): apply via `prisma migrate deploy` with the rest of the queue.
-- NOT VALID + VALIDATE keeps the ACCESS EXCLUSIVE lock instantaneous;
-- VALIDATE takes only SHARE UPDATE EXCLUSIVE while scanning existing rows.
ALTER TABLE "spend_campaigns"
  ADD CONSTRAINT "spend_campaigns_state_check"
  CHECK (state IN (
    'draft', 'awaiting_approval', 'approved', 'running',
    'completed', 'breached', 'superseded', 're_awaiting'
  )) NOT VALID;

ALTER TABLE "spend_campaigns" VALIDATE CONSTRAINT "spend_campaigns_state_check";
