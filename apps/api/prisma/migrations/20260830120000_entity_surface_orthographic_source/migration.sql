-- 'orthographic' joins the source vocabulary: a CODE-SYNTHESIZED retyping of
-- a banked name (the closed ampersand<->"and" class, orthographic-variants.ts,
-- 2026-08-30). Its own value, never flattened into 'vocabulary': provenance
-- decides collision-guard policing AND makes a bad variant traceable to the
-- mechanical census that wrote it rather than to the LLM sweep.
-- CHECK swap only — no table rewrite, no parallel-worker guard needed
-- (AUTHORING.md section 1: validation is a scan, not a rewrite; entity_surface
-- is ~60k rows).
ALTER TABLE entity_surface DROP CONSTRAINT entity_surface_source_check;
ALTER TABLE entity_surface ADD CONSTRAINT entity_surface_source_check
  CHECK (source = ANY (ARRAY[
    'legacy', 'merge_fold', 'ontology_rename', 'extraction',
    'knowledge_synthesis', 'places', 'cuisine', 'query_banking',
    'vocabulary', 'orthographic', 'seed', 'sweep', 'manual', 'synthesis'
  ]));
