-- The dense recall lane embeds core_entities.name_embedding from the entity doc
-- (name + aliases). New entities are born with a NULL embedding and swept by the
-- reconciler on "name_embedding IS NULL". But a RENAME or alias change leaves a
-- NON-null vector that now reflects the OLD doc — invisible to the NULL sweep and
-- silently stale. This flag marks those rows so the reconciler re-embeds them.
ALTER TABLE "core_entities"
  ADD COLUMN "name_embedding_stale" boolean NOT NULL DEFAULT false;

-- Partial index covering the reconciler's sweep predicate: normally a tiny working
-- set (a handful of just-created/renamed rows) against the full corpus.
CREATE INDEX "idx_entities_embedding_pending"
  ON "core_entities" (entity_id)
  WHERE ("name_embedding" IS NULL OR "name_embedding_stale" = true);
