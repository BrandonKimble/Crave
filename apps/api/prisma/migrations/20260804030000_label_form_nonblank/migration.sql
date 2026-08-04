-- F8 (wave-3 red team): a blank label form could out-rank a real label
-- and blank the concept. Belt (service totality) + braces (DB CHECK).
ALTER TABLE entity_labels ADD CONSTRAINT chk_entity_labels_form_nonblank
  CHECK (btrim(form) <> '');
