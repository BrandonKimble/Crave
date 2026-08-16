-- REHEARSAL GENERATION (plans/shadow-sandbox.md, P6).
-- A shadow replay's mints must be invisible to every live reader until the
-- one atomic activation flip. Mechanism: entities/surfaces born under a
-- rehearsal run carry status='rehearsal' + born_extraction_run_id; every
-- live reader already filters status='active', so visibility needs zero
-- reader changes. NULL born_extraction_run_id = born live (all history).
-- Light migration: ADD VALUE + nullable ADD COLUMN (no rewrite, PG>=11) +
-- partial indexes over columns that are all-NULL at creation (instant).

ALTER TYPE entity_status ADD VALUE IF NOT EXISTS 'rehearsal';

ALTER TABLE core_entities
  ADD COLUMN IF NOT EXISTS born_extraction_run_id uuid;
ALTER TABLE entity_surface
  ADD COLUMN IF NOT EXISTS born_extraction_run_id uuid;

-- The activation/rejection flip and the retro sweep key on the run id.
CREATE INDEX IF NOT EXISTS idx_core_entities_born_run
  ON core_entities (born_extraction_run_id)
  WHERE born_extraction_run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_surface_born_run
  ON entity_surface (born_extraction_run_id)
  WHERE born_extraction_run_id IS NOT NULL;

-- entity_surface.status is text policed by a CHECK — extend it with the
-- rehearsal value (constraint recreate is metadata-only at this size guard:
-- NOT VALID + VALIDATE avoids a full-table scan lock).
ALTER TABLE entity_surface DROP CONSTRAINT IF EXISTS entity_surface_status_check;
ALTER TABLE entity_surface ADD CONSTRAINT entity_surface_status_check
  CHECK (status = ANY (ARRAY['candidate'::text, 'active'::text,
                             'deprecated'::text, 'rehearsal'::text]))
  NOT VALID;
ALTER TABLE entity_surface VALIDATE CONSTRAINT entity_surface_status_check;

-- claim_verdicts.source gains 'rehearsal:<uuid>' (46 chars) — widen.
-- varchar widening is metadata-only in PG (no rewrite).
ALTER TABLE claim_verdicts ALTER COLUMN source TYPE varchar(64);
