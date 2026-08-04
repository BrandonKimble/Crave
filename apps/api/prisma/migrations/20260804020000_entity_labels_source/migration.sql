-- WS3 proposal 3 (parent-approved): labels get provenance like aliases —
-- a seeded label and a swept label must be distinguishable forever.
ALTER TABLE entity_labels ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'seed';
ALTER TABLE entity_labels ADD CONSTRAINT chk_entity_labels_source
  CHECK (source IN ('seed','sweep','manual','synthesis'));
