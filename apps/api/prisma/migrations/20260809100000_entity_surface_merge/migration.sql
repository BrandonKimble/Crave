-- THE SURFACE MERGE — concept-graph §11 structural item 2.
--
-- `entity_alias` (recall) and `entity_labels` (display) were ONE concept
-- wrongly split. The proof was standing in the code: WordClaimAdjudicator
-- .reconcileLabelSurfaces existed only to copy every active label form back
-- into the alias bag, forever, because a display form a real speaker reads
-- is also a word that speaker SAYS. Measured on this database at merge time:
-- 16,838 of 20,256 label rows already had a byte-identical alias twin
-- (same entity, same locale, same form) — the reconciler had duplicated 83%
-- of the display store into the recall store. A table whose contents are
-- continuously re-derived from another table is not a second table.
--
-- THE MERGED SHAPE. One row per (entity, locale, form) — the natural key
-- BOTH tables already used (entity_alias's unique index and entity_labels'
-- primary key were the same three columns, which is the split's own
-- confession) — carrying a ROLE:
--   'recall'  — grounds a query, never rendered  (a corpus surface)
--   'display' — rendered, never grounds          (a label whose recall
--                claim was refused by the collision guard, or withheld)
--   'both'    — the ordinary case for a swept label
--
-- WHY ROLE AND NOT TWO TABLES AGAIN: 'display' is now the RECORDED VERDICT
-- of the word-claim guard, not a separate kind of thing. A label form is
-- offered for recall exactly once, at write time; if the guard refuses it
-- (the form already names another concept) the row still lands so the user
-- can READ it, with role='display' — which is simultaneously the display
-- row and the memory that its recall claim lost. That is precisely why
-- reconcileLabelSurfaces is deleted in the same commit and cannot come
-- back: there is no longer a gap between the stores for it to close.
--
-- NAME. Neither 'alias' (recall-only) nor 'labels' (display-only) names the
-- merged concept — keeping either would re-encode in the table name the
-- split this migration deletes, and every future reader would go looking
-- for the other half. `entity_surface` is the word the schema comments
-- already used for both ("SURFACE forms", "the labels-as-surfaces match
-- arm"). The rename is metadata-only: no rewrite, no reindex.
--
-- STATUS vs ROLE. `status` (candidate|active|deprecated) stays the row's
-- own lifecycle. `role` is what the row is FOR. The one place they
-- interacted is asserted below rather than assumed: a deprecated recall
-- claim under an ACTIVE label becomes role='display'/status='active' (the
-- recall verdict is now carried by role, losslessly — 1,021 such rows).
-- The inverse (an active recall row under a DEPRECATED label) has no
-- lossless encoding, so it is not silently resolved: the DO block below
-- ABORTS the migration if any exists. Zero exist today.
--
-- SERIAL EXECUTION (prod /dev/shm law): the ADD COLUMN ... DEFAULT now()
-- below is a table rewrite.
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

-- ---------------------------------------------------------------------
-- 1. RENAME entity_alias -> entity_surface (metadata only).
-- ---------------------------------------------------------------------
ALTER TABLE entity_alias RENAME TO entity_surface;
ALTER TABLE entity_surface RENAME COLUMN alias_id TO surface_id;
ALTER SEQUENCE entity_alias_seq_seq RENAME TO entity_surface_seq_seq;

ALTER INDEX entity_alias_pkey RENAME TO entity_surface_pkey;
ALTER INDEX entity_alias_seq_key RENAME TO entity_surface_seq_key;
ALTER INDEX uq_entity_alias_entity_locale_form
  RENAME TO uq_entity_surface_entity_locale_form;
ALTER INDEX idx_entity_alias_entity_id RENAME TO idx_entity_surface_entity_id;
ALTER INDEX idx_entity_alias_form_folded
  RENAME TO idx_entity_surface_form_folded;
ALTER INDEX idx_entity_alias_form_folded_trgm
  RENAME TO idx_entity_surface_form_folded_trgm;
ALTER INDEX idx_entity_alias_locale_form_folded
  RENAME TO idx_entity_surface_locale_form_folded;

ALTER TABLE entity_surface
  RENAME CONSTRAINT entity_alias_entity_id_fkey TO entity_surface_entity_id_fkey;
ALTER TABLE entity_surface
  RENAME CONSTRAINT entity_alias_status_check TO entity_surface_status_check;
ALTER TABLE entity_surface
  DROP CONSTRAINT entity_alias_source_check;

-- ---------------------------------------------------------------------
-- 2. The display half's columns move onto the merged row.
-- ---------------------------------------------------------------------
ALTER TABLE entity_surface
  ADD COLUMN role           TEXT        NOT NULL DEFAULT 'recall',
  ADD COLUMN description    VARCHAR(500),
  ADD COLUMN is_default     BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN rank           INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN prompt_version INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN updated_at     TIMESTAMPTZ NOT NULL DEFAULT now();

-- ONE source vocabulary. The union of both halves' CHECKs: the alias
-- provenances plus the three the label writer used ('sweep', 'manual',
-- 'synthesis'); 'seed' was already shared. Provenance is what decides
-- whether the collision guard polices a claim, so a merged row must keep
-- the writer that actually made it — flattening label provenance into
-- 'vocabulary' would make a bad surface untraceable to its pass.
ALTER TABLE entity_surface ADD CONSTRAINT entity_surface_source_check
  CHECK (source = ANY (ARRAY[
    'legacy', 'merge_fold', 'ontology_rename', 'extraction',
    'knowledge_synthesis', 'places', 'cuisine', 'query_banking',
    'vocabulary', 'seed', 'sweep', 'manual', 'synthesis'
  ]));

ALTER TABLE entity_surface ADD CONSTRAINT entity_surface_role_check
  CHECK (role = ANY (ARRAY['display', 'recall', 'both']));

-- A recall-only row is not a label, so it can never be the default label.
ALTER TABLE entity_surface ADD CONSTRAINT entity_surface_default_is_display
  CHECK (NOT is_default OR role <> 'recall');

-- Carried from entity_labels: a blank form would render an invisible name.
-- It was only ever enforced on the display half; it is true of every
-- surface (a form with no characters is not a recall key either).
ALTER TABLE entity_surface ADD CONSTRAINT entity_surface_form_nonblank
  CHECK (btrim(form) <> '');

-- ---------------------------------------------------------------------
-- 3. THE DATA MERGE. Twinned rows first (they become one row), then the
--    label-only rows land as new display rows.
-- ---------------------------------------------------------------------

-- No lossless encoding exists for "the display verdict says deprecated but
-- the recall claim is live" — one row, one status. Refuse to guess.
DO $$
DECLARE conflicting BIGINT;
BEGIN
  SELECT count(*) INTO conflicting
    FROM entity_labels l
    JOIN entity_surface s
      ON s.entity_id = l.entity_id AND s.locale = l.locale AND s.form = l.form
   WHERE l.status <> 'active' AND s.status = 'active';
  IF conflicting > 0 THEN
    RAISE EXCEPTION
      'entity_surface merge: % row(s) have a deprecated label over an active recall claim; resolve by hand before merging',
      conflicting;
  END IF;
END $$;

UPDATE entity_surface s
   SET role = CASE WHEN s.status = 'active' THEN 'both' ELSE 'display' END,
       status = l.status,
       description = l.description,
       is_default = l.is_default,
       rank = l.rank,
       prompt_version = l.prompt_version,
       updated_at = l.updated_at
  FROM entity_labels l
 WHERE l.entity_id = s.entity_id
   AND l.locale = s.locale
   AND l.form = s.form;

INSERT INTO entity_surface
  (entity_id, form, form_folded, locale, role, source, confidence, status,
   description, is_default, rank, prompt_version, created_at, updated_at)
SELECT l.entity_id, l.form, l.form_folded, l.locale, 'display', l.source, 1,
       l.status, l.description, l.is_default, l.rank, l.prompt_version,
       l.created_at, l.updated_at
  FROM entity_labels l
 WHERE NOT EXISTS (
   SELECT 1 FROM entity_surface s
    WHERE s.entity_id = l.entity_id AND s.locale = l.locale AND s.form = l.form)
ON CONFLICT (entity_id, locale, form) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. The display half's indexes, on the merged table.
-- ---------------------------------------------------------------------
CREATE UNIQUE INDEX uq_entity_surface_one_default
  ON entity_surface (entity_id, locale) WHERE is_default;
CREATE INDEX idx_entity_surface_locale ON entity_surface (locale);
CREATE INDEX idx_entity_surface_locale_status
  ON entity_surface (locale, status);

DROP TABLE entity_labels;
