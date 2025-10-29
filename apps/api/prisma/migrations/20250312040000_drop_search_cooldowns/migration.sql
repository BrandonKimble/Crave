DROP TABLE IF EXISTS "search_cooldowns";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'OnDemandStatus'
  ) THEN
    -- no action needed; on_demand uses this enum
    NULL;
  END IF;
END $$;
