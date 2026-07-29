-- Claim identity (charter §2a+§3b): the restaurant rollup asks, per mention,
-- "did this same DOCUMENT also name something more specific at this same
-- restaurant?". That correlated lookup filters on source_document_id, which
-- had no index — only connection_id existed. Cheap now (28ms over the whole
-- corpus), but the reload multiplies the mention ledger and this is the
-- access path that would degrade.
CREATE INDEX IF NOT EXISTS idx_restaurant_item_mentions_document
  ON core_restaurant_item_mentions (source_document_id, kind);
