-- COUNT ATTEMPTS, NOT SUCCESSES (2026-08-01). The weekly cap runs before the
-- spend, which is right, but it counted polls a user SUCCESSFULLY created.
-- A name that fails vendor verification throws AFTER the paid lookups and
-- writes no poll row — so the counter never moved and the same user could
-- retry forever, paying us out one lookup at a time. A turnstile that only
-- counts the people who got through, while charging everyone who tries.
CREATE TABLE IF NOT EXISTS poll_creation_attempts (
  attempt_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT        NOT NULL,
  place_id    UUID        NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The cap's read: attempts by this user, in this place, in the window.
CREATE INDEX IF NOT EXISTS idx_poll_creation_attempts_user_place_time
  ON poll_creation_attempts (user_id, place_id, attempted_at DESC);
