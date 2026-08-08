-- RUNG 2 MATERIALIZED (audit KL-D / §11 structural #3). Head-final name
-- containment existed TWICE with different fold semantics: the satisfies
-- judge excluded on identity_key (canonicalFold) while query-time admission
-- matched on lower(name) — for any pair that folds-equal but lowers-unequal
-- (NFD spellings, ß/æ, apostrophes) the judge said "grammar decided it" and
-- the query never admitted it: a silent hole, the 13.3%-divergence class.
-- One nightly-derived table on the FOLDED key is the one definition both
-- consumers read; it also deletes the un-indexable word-boundary LIKE from
-- the hot path (O(foods x anchors) per search, maxAnchors cap).
-- Light append table + full-replace rebuild: no rewrite hazard.
CREATE TABLE derived_name_containment_edges (
  base_id    uuid    NOT NULL,
  variant_id uuid    NOT NULL,
  head_final boolean NOT NULL,
  CONSTRAINT derived_name_containment_edges_pkey PRIMARY KEY (base_id, variant_id)
);
CREATE INDEX idx_name_containment_variant ON derived_name_containment_edges (variant_id);
