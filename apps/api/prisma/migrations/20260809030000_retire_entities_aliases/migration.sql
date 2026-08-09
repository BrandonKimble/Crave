-- RETIRE core_entities.aliases[] (plans/concept-graph.md §11 item 4 / I-2).
--
-- The column was a DERIVED PROJECTION of entity_surface: `projectAliases`
-- rebuilt it from the und/active rows on every surface write. A derived copy
-- of a table, in a column, is a shadow that can only ever agree with its
-- source by the grace of a writer no reader can see — and this one also
-- LOST information on the way across (no locale, no role, no provenance,
-- no folded mirror), which is why the resolver's surface tier matched
-- byte-exactly and missed "santo taco" against the banked "Santo Taco".
--
-- Every reader now queries entity_surface directly (und + active +
-- role<>'display' for the recall arms; und+en, any role, for the dense
-- embedding doc). Verified in the same commit by
-- scripts/search-harness/entity-resolution-gate.ts.
--
-- WHY NO PARALLEL-WORKER GUARD (AUTHORING.md §1): every statement here is a
-- catalogue-only DROP. Dropping a column is a metadata update, not a table
-- rewrite, and dropping an index frees pages without reading them — none of
-- this allocates the shared memory that the small prod /dev/shm cannot give.
-- The guard is for ALTER COLUMN ... TYPE and unbounded UPDATEs; adding it
-- here would be cargo, not safety.

-- The four indexes over the column, and the two expression functions that
-- exist ONLY to feed them. All four were already unreferenced by any query:
-- the trigram haystack and the lower-array GIN were the legacy recall arms
-- the gazetteer replaced with entity_surface, the tsv index backed a
-- full-text arm that no longer runs, and the plain btree over a text[] was
-- never a usable access path for any predicate the code issued.
DROP INDEX IF EXISTS idx_core_entities_aliases_haystack_lower_trgm;
DROP INDEX IF EXISTS idx_core_entities_aliases_lower_gin;
DROP INDEX IF EXISTS idx_core_entities_entity_search_tsv_gin;
DROP INDEX IF EXISTS idx_entities_aliases;

ALTER TABLE core_entities DROP COLUMN IF EXISTS aliases;

-- Dropped AFTER the indexes that depend on them. crave_text_array_lower is
-- generic by signature but had exactly one caller (the dropped GIN index);
-- leaving an unreferenced IMMUTABLE helper behind would be the same kind of
-- residue this migration exists to remove.
DROP FUNCTION IF EXISTS crave_aliases_haystack_lower(text[]);
DROP FUNCTION IF EXISTS crave_entity_search_tsv(text, text[]);
DROP FUNCTION IF EXISTS crave_text_array_lower(text[]);
