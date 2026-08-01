-- "How many dollars did we pay for output we threw away?" was unanswerable:
-- a MAX_TOKENS truncation (whole response discarded by the parser) ledgered
-- identically to a good call, and a timeout-aborted attempt (vendor may have
-- billed generation we never received) ledgered as nothing at all. One
-- column, one meaning: how the paid call ENDED.
--   ok | truncated | aborted | failed   (NULL = non-generation rows)
ALTER TABLE api_usage_ledger ADD COLUMN IF NOT EXISTS outcome VARCHAR(16);
