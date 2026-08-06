-- THE VOCABULARY PASS GETS ITS OWN PROVENANCE.
--
-- It had been borrowing `knowledge_synthesis`, the dish-knowledge pass's
-- source, purely to fall under the inferred-alias collision guard. That made a
-- bad alias untraceable to the pass that wrote it and impossible to roll back
-- independently — two producers, one provenance value.
--
-- The TypeScript union and this CHECK are TWO HALVES OF ONE FACT: adding the
-- value in code alone would have failed every insert at runtime with a
-- constraint violation. (Found by checking the constraint rather than trusting
-- the union.)
--
-- Not a heavy migration: a CHECK swap on a 21k-row table rewrites nothing that
-- AUTHORING.md §1's parallel-worker guard is for. Own timestamp per §4.
ALTER TABLE "entity_alias" DROP CONSTRAINT IF EXISTS "entity_alias_source_check";
ALTER TABLE "entity_alias" ADD CONSTRAINT "entity_alias_source_check"
  CHECK (source = ANY (ARRAY[
    'legacy', 'merge_fold', 'ontology_rename', 'extraction',
    'knowledge_synthesis', 'places', 'cuisine', 'query_banking',
    'vocabulary', 'seed'
  ]::text[]));
