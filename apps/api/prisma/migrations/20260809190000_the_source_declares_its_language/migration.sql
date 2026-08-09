-- THE SOURCE DECLARES ITS LANGUAGE (multilingual spine, step 4).
--
-- Collection reads words off a subreddit and banks them as surface forms. It
-- has never recorded WHICH LANGUAGE those words are in, so every form landed
-- untagged ('und') and the three extraction banking sites say so in their own
-- comments: "Untagged ('und') because the corpus is English and a fabricated
-- language tag is worse than none."
--
-- That reasoning was exactly right and it is what these two columns retire.
-- The tag stops being a fabrication the moment it comes from a FACT we
-- already hold: we choose which communities to collect from. r/austinfood is
-- English because we onboarded an English-speaking metro; a Saigon subreddit
-- would be Vietnamese for the same kind of reason. The language of a source
-- is CONFIGURATION, not an inference — which is precisely why it may carry a
-- default where `signals.detected_locale` (an OBSERVATION of a person's ask,
-- 20260809160000) deliberately may not.
--
-- WHY 'en' IS A TRUE DEFAULT HERE, NOT AN ESTIMATE. Measured on this corpus
-- before writing it down: collection_communities holds exactly two rows,
-- austinfood (Austin, TX) and foodnyc (New York, NY), and all 89,901
-- collection_source_documents come from them. Every existing row IS English.
-- The default states a fact about the corpus we have; it does not guess about
-- one we don't. When a non-English community is onboarded it sets its own
-- language at insert, and the documents it yields carry that instead.
--
-- NOT NULL: a document with no language is not a state this system can act
-- on — the banking site would have to invent one anyway, which is the thing
-- being removed.
--
-- Cheap by construction: PostgreSQL 11+ stores an ADD COLUMN ... DEFAULT as
-- catalog metadata and rewrites no heap, so neither statement touches an
-- existing row. That is why the AUTHORING.md §1 parallel-worker guard (for
-- STORED-column rewrites and event-table-wide joins) is deliberately omitted
-- rather than forgotten.

ALTER TABLE "collection_communities"
  ADD COLUMN "language" VARCHAR(35) NOT NULL DEFAULT 'en';

ALTER TABLE "collection_source_documents"
  ADD COLUMN "language" VARCHAR(35) NOT NULL DEFAULT 'en';
