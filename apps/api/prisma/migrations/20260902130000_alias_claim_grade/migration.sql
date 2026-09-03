-- ALIAS CLAIM GRADE (plans/alias-clean-slate.md item 1, 2026-09-02).
--
-- An alias is an identity claim and must meet the same bar as a merge. Every
-- surface row now states the GRADE of claim it makes:
--   observed — a person wrote this string about this entity (verbatim
--              extraction text, Google's display name). Identity by
--              construction: may route mentions, may decide sameness.
--   judged   — a court ruled this string names this entity. Carries its
--              origin verdict coordinates and is authoritative ONLY while
--              that verdict's rule version is the lane's rule in force.
--   recall   — a model's guess at how people type it (vocabulary, knowledge
--              synthesis, cuisine templates, orthographic variants, query
--              banking). Serves search recall ONLY; never routes a mention,
--              never decides sameness.
--
-- The corpus-wide backfill joins entity_surface to core_entities, so the
-- parallel-worker guard applies (AUTHORING.md §1).
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

ALTER TABLE entity_surface
  ADD COLUMN claim_grade varchar(16) NOT NULL DEFAULT 'recall',
  ADD COLUMN origin_lane varchar(64),
  ADD COLUMN origin_claim_key text,
  ADD COLUMN origin_rule_version integer,
  ADD COLUMN origin_fold_version integer;

ALTER TABLE entity_surface
  ADD CONSTRAINT entity_surface_claim_grade_check
  CHECK (claim_grade = ANY (ARRAY['observed', 'judged', 'recall']));

-- A judged claim with no origin verdict is unauditable — exactly the alias
-- ratchet this migration exists to end.
ALTER TABLE entity_surface
  ADD CONSTRAINT entity_surface_judged_has_origin_check
  CHECK (
    claim_grade <> 'judged'
    OR (origin_lane IS NOT NULL
        AND origin_claim_key IS NOT NULL
        AND origin_rule_version IS NOT NULL
        AND origin_fold_version IS NOT NULL)
  );

-- CONSERVATIVE interim backfill (the clean-slate wipe replaces this stock;
-- until then nothing un-earned may route a mention once the graded reader
-- lands): a row is 'observed' only when its folded form equals its own
-- entity's identity_key — the entity's own name spelled back at it, which
-- every tier already matches at grade-1 authority. Everything else —
-- legacy, judge-born, merge folds, vocabulary, templates — stays 'recall'
-- (the column default): still searchable, no longer identity.
UPDATE entity_surface s
   SET claim_grade = 'observed'
  FROM core_entities e
 WHERE e.entity_id = s.entity_id
   AND e.identity_key IS NOT NULL
   AND s.form_folded = e.identity_key;

-- The resolution read's slice: active identity-grade forms by fold.
CREATE INDEX idx_entity_surface_identity_grade
  ON entity_surface (form_folded)
  WHERE status = 'active' AND claim_grade <> 'recall';
