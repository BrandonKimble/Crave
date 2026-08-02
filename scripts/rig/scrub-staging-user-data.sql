-- SELF-DISCOVERING, FAIL-CLOSED user-data scrub for staging.
--
-- WHY THIS EXISTS (red-team P0, 2026-08-02): the old scrub was
-- `TRUNCATE users CASCADE`, which only reaches tables with an FK to users
-- that cascades. Real hard-contact PII lived in tables with a BARE user
-- column and NO FK, so it survived: push tokens
-- (notification_devices.expo_push_token), device fingerprints
-- (user_devices.device_key, signal_actors.device_key), and raw user search
-- text (…unsegmented_residue.residue_text) all landed in staging while the
-- verification counted only `users` and reported "0 users, safe".
--
-- THE LINE (matches the original intent, plus closes the leak):
--   * DROP every table keyed to a real person — account rows, per-user
--     activity, and the FK-less hard-PII tables the cascade missed. The
--     truncate set is DISCOVERED from the catalog (`%user_id` columns + the
--     hard-PII column names), so a new user-keyed table is scrubbed
--     automatically instead of silently surviving.
--   * KEEP content that merely REFERENCES a person softly — polls and
--     poll_topics carry a nullable `created_by_user_id` with NO FK, so the
--     original scrub already kept them (17,931 polls make staging's content
--     realistic). We keep them too, but NULL the creator id so not even the
--     linkage to a real person survives. (poll_comments / endorsements /
--     likes DO cascade from users and are correctly dropped as activity.)
--   * VERIFY FAIL-CLOSED: zero rows in `users`, zero rows bearing any
--     hard-contact-PII column, zero surviving user linkage in the kept
--     content tables. If discovery ever misses a new table, the verifier
--     RAISES and the caller aborts — staging never goes live with PII.

DO $$
DECLARE
  r record;
  n bigint;
  -- Content tables kept for realism; their soft creator ref is NULLed, never
  -- truncated. Deliberately tiny and explicit — the fragility the old scrub
  -- died of was in the TRUNCATE *completeness*, which is now catalog-driven;
  -- a 2-row keep list guarded by the verifier is safe.
  keep_content text[] := ARRAY['polls', 'poll_topics'];
  -- Hard-contact PII columns (non-user_id). Every ownership column
  -- (user_id, blocker_user_id, owner_user_id, sender_user_id, …) is caught
  -- by the `LIKE '%user_id'` pattern instead.
  pii_exact text[] := ARRAY['expo_push_token', 'device_key', 'pair_key', 'residue_text'];
BEGIN
  -- 1. KEEP-CONTENT: null the soft creator ref, do NOT truncate.
  UPDATE public.polls SET created_by_user_id = NULL WHERE created_by_user_id IS NOT NULL;
  IF to_regclass('public.poll_topics') IS NOT NULL THEN
    UPDATE public.poll_topics SET created_by_user_id = NULL WHERE created_by_user_id IS NOT NULL;
  END IF;

  -- 2. DISCOVER + TRUNCATE every OTHER user-keyed table.
  FOR r IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND (c.column_name LIKE '%user_id' OR c.column_name = ANY(pii_exact))
      AND NOT (c.table_name = ANY(keep_content))
    ORDER BY c.table_name
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.table_name);
    RAISE NOTICE 'scrubbed %', r.table_name;
  END LOOP;

  -- 3. The users root + reserved usernames + spend history (prod truth,
  --    not staging's to meter against).
  TRUNCATE TABLE public.users RESTART IDENTITY CASCADE;
  IF to_regclass('public.user_reserved_usernames') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.user_reserved_usernames';
  END IF;
  IF to_regclass('public.api_usage_ledger') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.api_usage_ledger';
  END IF;
  IF to_regclass('public.spend_campaigns') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.spend_campaigns CASCADE';
  END IF;

  -- 4. VERIFY FAIL-CLOSED.
  --    (a) hard-PII / ownership columns hold zero rows in every non-kept table
  FOR r IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND (c.column_name LIKE '%user_id' OR c.column_name = ANY(pii_exact))
      AND NOT (c.table_name = ANY(keep_content))
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', r.table_name) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION 'PII SCRUB FAILED: % still has % row(s) after scrub', r.table_name, n;
    END IF;
  END LOOP;
  --    (b) no user linkage survives in the kept content tables
  EXECUTE 'SELECT count(*) FROM public.polls WHERE created_by_user_id IS NOT NULL' INTO n;
  IF n > 0 THEN RAISE EXCEPTION 'PII SCRUB FAILED: polls retain % creator id(s)', n; END IF;

  -- STAGING SENTINEL (red-team P2, 2026-08-02): a positive marker that this
  -- database IS staging. The refresh scripts refuse `DROP SCHEMA` unless this
  -- table exists — prod will NEVER have it, so a misdirected host (a stale
  -- proxy port after a service recreate) is refused instead of wiped. It
  -- costs nothing and is the real guard the old string-compare pretended to be.
  CREATE TABLE IF NOT EXISTS public._staging_sentinel (
    note text NOT NULL,
    stamped_at timestamptz NOT NULL DEFAULT now()
  );
  INSERT INTO public._staging_sentinel (note) VALUES ('this database is STAGING');

  RAISE NOTICE 'PII scrub verified: zero user-keyed rows remain (polls/poll_topics kept, de-identified).';
END $$;
