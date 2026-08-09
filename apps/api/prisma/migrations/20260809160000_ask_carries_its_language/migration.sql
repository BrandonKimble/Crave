-- THE ASK CARRIES ITS LANGUAGE (multilingual spine, step 2).
--
-- `signals.detected_locale` has existed since the M4b groundwork and no
-- writer has ever set it (zero 'locale' occurrences in signals.service.ts).
-- The two collection-side ask tables had no such column at all, so a
-- Vietnamese ask and an English ask arrived at collection indistinguishable
-- — which is why the keyword lane spends its budget searching English words
-- for foreign-language demand.
--
-- Both columns are NULLABLE with NO DEFAULT: an undetectable language is
-- genuinely unknown, and 'en' would be a fabricated fact on a row that will
-- later be read as evidence (the no-fake-estimates law). Existing rows stay
-- NULL and self-heal as new asks arrive.
--
-- Cheap by construction: a nullable ADD COLUMN with no default touches no
-- existing row (AUTHORING.md §1), so the parallel-worker guard is not
-- required here and is deliberately omitted.

ALTER TABLE "collection_on_demand_requests"
  ADD COLUMN "detected_locale" VARCHAR(35);

ALTER TABLE "collection_on_demand_unsegmented_residue"
  ADD COLUMN "detected_locale" VARCHAR(35);
