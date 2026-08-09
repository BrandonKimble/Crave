-- AC-P2c (autocomplete i18n): typo tolerance was an English-only privilege —
-- the localized surface lane matched exact+prefix only, so 'camarnes' found
-- nothing while 'vgean' reached vegan through the delete-dictionary lane.
-- The lane gains a trigram arm over the locale-chained registry; this GIN
-- index is what makes it a probe instead of a scan. Small table (~45k rows),
-- no rewrite; plain CREATE INDEX (not CONCURRENTLY) is fine at this size and
-- keeps the migration transactional.
CREATE INDEX idx_entity_alias_form_folded_trgm
  ON entity_alias USING gin (form_folded gin_trgm_ops);
