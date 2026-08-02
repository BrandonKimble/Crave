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
  -- CONTENT, not user data (verified 2026-08-02): `curated_lists` is
  -- EDITORIAL home-surface content — 672 rows locally, all scope='global'
  -- with a NULL owner_user_id. Its `owner_user_id` column matched the
  -- person-column pattern, so the scrub was TRUNCATE-ing the entire home
  -- surface out of staging. Personal (weekly-tasting) curated lists ARE
  -- user-owned and are deleted below; global ones are kept. This is the
  -- structural cost of classifying by column NAME — see the data-class
  -- declaration proposal in the red-team notes.
  keep_content text[] := ARRAY['polls', 'poll_topics', 'curated_lists'];
  -- Tables whose contact-shaped columns are PUBLIC BUSINESS data, not a
  -- person's. Explicit and reviewable ON PURPOSE: anything contact-shaped that
  -- is NOT on this list fails the verifier, so a new table holding real
  -- addresses/emails/phones stops the refresh until a human classifies it.
  -- (A restaurant's phone_number is the business's, not a user's.)
  business_contact_tables text[] := ARRAY[
    'core_restaurant_locations', 'core_entities', 'collection_source_documents'
  ];
  -- Hard-contact PII columns (non-user_id). Every ownership column
  -- (user_id, blocker_user_id, owner_user_id, sender_user_id, …) is caught
  -- by the `LIKE '%user_id'` pattern instead.
  pii_exact text[] := ARRAY['expo_push_token', 'device_key', 'pair_key', 'residue_text'];
BEGIN
  -- 0. CURATED LISTS: delete the PERSONAL ones (user-owned), keep global
  --    editorial content and sever any owner linkage on what remains.
  IF to_regclass('public.curated_lists') IS NOT NULL THEN
    DELETE FROM public.curated_lists WHERE scope = 'personal';
    UPDATE public.curated_lists SET owner_user_id = NULL
      WHERE owner_user_id IS NOT NULL;
  END IF;

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
      AND (c.column_name ~ '(^|_)(user|actor|owner|sender|reporter|follower|blocker|blocked|creator)_id$'
           OR c.column_name = ANY(pii_exact))
      AND NOT (c.table_name = ANY(keep_content))
      -- `users` matches on its OWN primary key (user_id) and would be
      -- TRUNCATE ... CASCADE'd here — which unconditionally wipes every
      -- referencing table, including editorial curated_lists. It is handled
      -- explicitly below with DELETE, which honours real FK rows.
      AND c.table_name <> 'users'
    ORDER BY c.table_name
  LOOP
    EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', r.table_name);
    RAISE NOTICE 'scrubbed %', r.table_name;
  END LOOP;

  -- 3. The users root + reserved usernames + spend history (prod truth,
  --    not staging's to meter against).
  -- DELETE, not TRUNCATE CASCADE (2026-08-02): `TRUNCATE users CASCADE`
  -- truncates every referencing table UNCONDITIONALLY, which wiped the 672
  -- global editorial `curated_lists` (their FK is ON DELETE CASCADE even
  -- though their owner_user_id is NULL). DELETE honours the actual FK rows,
  -- so rows we deliberately severed above (owner set to NULL) survive, while
  -- genuine per-user children still cascade away.
  DELETE FROM public.users;
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
  --    (a) INDEPENDENT NET (red-team P0, 2026-08-02): the verifier used to
  --    reuse the TRUNCATE's own predicate, so any column shape the truncate
  --    missed was invisible to the check too — it printed "verified" while
  --    signals.actor_id / subject_text (raw typed search text + the viewer's
  --    viewport bbox ~ location) sat untouched. A verifier that shares its
  --    subject's blind spot cannot fail on the thing that matters. This net
  --    is deliberately WIDER than the truncate: any identity-ish or
  --    contact-ish column name at all.
  FOR r IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND (
        -- Any column naming a PERSON. Broader than the truncate predicate on
        -- purpose — this is what catches a shape the truncate forgot.
        c.column_name ~ '(^|_)(user|actor|owner|sender|reporter|follower|blocker|blocked|creator)_id$'
        -- Contact/telemetry columns that are person-scoped BY NATURE. NOT
        -- generic 'email'/'phone': a restaurant's phone_number is public
        -- BUSINESS data in the corpus (core_restaurant_locations), and
        -- flagging it would make this check cry wolf on every run — an
        -- always-failing verifier gets disabled, which is how you end up
        -- with no verifier at all.
        OR c.column_name ~ '(push_token|device_key|pair_key|residue_text|subject_text|ip_hash|subnet_hash)'
        -- Generic contact shapes: flagged UNLESS the table is declared
        -- business data above. New + unclassified = refuse, never assume.
        OR (c.column_name ~ '(email|phone)'
            AND NOT (c.table_name = ANY(business_contact_tables)))
      )
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
  IF to_regclass('public.curated_lists') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.curated_lists WHERE owner_user_id IS NOT NULL' INTO n;
    IF n > 0 THEN RAISE EXCEPTION 'PII SCRUB FAILED: curated_lists retain % owner id(s)', n; END IF;
  END IF;

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
