-- MULTILINGUAL FOUNDATION — plan A1 + R5-5 + R5-6 + A8 + A10.
--
-- A1: `core_entities.aliases text[]` had SEVEN writers, zero provenance,
-- no language tag and no folded mirror — and it feeds confidence-1.0
-- grounding plus the embedding doc. This migration makes ROWS the truth
-- (`entity_alias`) and demotes the array to a DERIVED PROJECTION written
-- by exactly one app function (the identity_key precedent). Every read
-- arm (GIN overlap, the FTS expression index, the trgm haystack, the
-- per-alias unnest) keeps working untouched.
--
-- R5-5: locale keys are FULL BCP 47 ('es-MX', 'zh-Hans', 'pt-BR'), with
-- 'und' for untagged legacy rows. Decided BEFORE this migration because
-- key changes in append-only stores are the A10 failure mode.
-- R5-6 (Wikidata-learned): entity_labels carries a per-locale short
-- DESCRIPTION disambiguator, and entity_alias carries a STATUS enum so
-- the self-teaching loop has a DEMOTION path (a judge-rejected pairing
-- is remembered as wrong instead of re-proposed by query spam forever).
--
-- THE FOLD LAW IS ABSOLUTE: form_folded is APP-WRITTEN by canonicalFold
-- (entity-identity.ts). There is no SQL fold here, no generated column,
-- no expression index over a fold — Postgres Unicode character classes
-- are platform-dependent (measured: glibc PG17 vs mac PG18) so a SQL
-- mirror can never be trusted. The DB stores and indexes; it never folds.
--
-- SERIAL EXECUTION (prod /dev/shm law, learned 2026-08-02): parallel
-- workers grab a large dynamic shared-memory segment that the prod
-- container cannot allocate ("could not resize shared memory segment").
SET max_parallel_workers_per_gather = 0;
SET max_parallel_maintenance_workers = 0;

-- ---------------------------------------------------------------------
-- 1. entity_alias — SURFACE forms (what corpora and users SAY).
--    Recall only. NEVER a display surface: display lives in entity_labels.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_alias (
  alias_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id   UUID NOT NULL REFERENCES core_entities(entity_id) ON DELETE CASCADE,
  -- PROJECTION ORDER. The legacy array is rebuilt as the active forms in
  -- seq order, which reproduces today's append semantics exactly. Nothing
  -- in the repo reads aliases[] positionally (verified: zero `aliases[0]`
  -- / ORDER BY-over-alias sites), so seq is the only ordering authority.
  seq         BIGSERIAL NOT NULL UNIQUE,
  form        VARCHAR(255) NOT NULL,
  -- APP-WRITTEN canonicalFold(form). N1's missing folded mirror: the
  -- gazetteer matches folded tokens while aliases held raw ones.
  form_folded VARCHAR(255) NOT NULL,
  -- Canonical BCP 47, or 'und' for untagged legacy/unknown-language rows.
  locale      TEXT NOT NULL DEFAULT 'und',
  -- PROVENANCE — the thing the untagged bag destroyed on every write.
  source      TEXT NOT NULL,
  confidence  DOUBLE PRECISION NOT NULL DEFAULT 1,
  status      TEXT NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entity_alias_source_check CHECK (source IN (
    'legacy', 'merge_fold', 'ontology_rename', 'extraction',
    'knowledge_synthesis', 'places', 'cuisine', 'query_banking', 'seed'
  )),
  CONSTRAINT entity_alias_status_check CHECK (status IN (
    'candidate', 'active', 'deprecated'
  ))
);

-- One row per (entity, locale, form): the same surface asserted twice by
-- two sources is ONE alias, not two. (Provenance of the first writer
-- wins; the projection writer is ON CONFLICT DO NOTHING.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_alias_entity_locale_form
  ON entity_alias (entity_id, locale, form);

-- The N1 lookup arm: fold BOTH sides, then match.
CREATE INDEX IF NOT EXISTS idx_entity_alias_form_folded
  ON entity_alias (form_folded);
-- The M3 homograph guard: same lookup, filtered by request locale.
CREATE INDEX IF NOT EXISTS idx_entity_alias_locale_form_folded
  ON entity_alias (locale, form_folded);
-- The projection rebuild reads all rows of one entity.
CREATE INDEX IF NOT EXISTS idx_entity_alias_entity_id
  ON entity_alias (entity_id);

-- ---------------------------------------------------------------------
-- 2. entity_labels — DISPLAY forms (what a user SEES), per locale.
--    Built now so the M2 sweep has a home; no writer yet by design.
--    RULING: labels and aliases must NEVER fuse. Reading entity_labels
--    as a match surface later is legal; WRITING labels into the alias
--    bag is on the NEVER list.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_labels (
  entity_id   UUID NOT NULL REFERENCES core_entities(entity_id) ON DELETE CASCADE,
  locale      TEXT NOT NULL,
  form        VARCHAR(255) NOT NULL,
  -- R5-6(a): the Wikidata disambiguator. Labels collide across concepts
  -- ("pan"); the sweep drafts the short description in the same call, and
  -- it sharpens the judge-merge gate.
  description VARCHAR(500),
  is_default  BOOLEAN NOT NULL DEFAULT false,
  rank        INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_entity_labels PRIMARY KEY (entity_id, locale, form)
);

-- EXACTLY ONE default label per (entity, locale) — the read surface picks
-- a label without a tiebreak guess.
CREATE UNIQUE INDEX IF NOT EXISTS uq_entity_labels_one_default
  ON entity_labels (entity_id, locale)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_entity_labels_locale
  ON entity_labels (locale);

-- ---------------------------------------------------------------------
-- 3. A10 — the signals ledger's language tag.
--    subjectType='term' keys demand on RAW UNTAGGED text: "pulpo" and
--    "octopus" are two demand terms forever, on the surface that DRIVES
--    SPEND. Append-only ledgers are the hardest keys to change later, so
--    the column lands NOW; writers fill it when detection ships (M4b).
--    The append-only KEY itself is untouched — this is an added column,
--    nullable, no backfill, no index (no reader yet; adding one to a
--    ~all-NULL column would be dead weight).
-- ---------------------------------------------------------------------
ALTER TABLE signals ADD COLUMN IF NOT EXISTS detected_locale TEXT;

-- ---------------------------------------------------------------------
-- 4. A8 — INGREDIENT uniqueness re-keys off the RAW name.
--    uq_entities_ingredient_name is UNIQUE(name) WHERE type='ingredient':
--    "jalapeño" and "jalapeno" are two ingredients TODAY, in English, and
--    "Jalapeno" would be a third. Re-key to the app-written identity_key
--    (canonicalFold), the exact shape uq_attribute_identity_key already
--    uses — case, accent, apostrophe and punctuation folded, script
--    preserved.
--    NOT identity_key_sorted: that key is DELIBERATELY COARSE (its own
--    doc comment: "it exists to serialize creators and widen the adopt
--    probe, not to assert equality"). Measured on the mirror it collides
--    on 60+ live ingredient pairs that are NOT duplicates by the current
--    contract (bitter/bitters, hop/hops are, but "orange bitters"/"bitter
--    orange" and "ribeye beef"/"beef ribeye" are order-collisions the
--    lemma sort creates on purpose). Uniquing a coarse probe key would
--    archive real vocabulary. identity_key is the honest equality claim.
--
-- SELF-HEALING PRE-DEDUPE (same contract as 20260801230000): prod's
-- vocabulary drifts between snapshot and deploy — one new duplicate would
-- abort this migration and P3009 crash-loop every boot. Most-evidenced
-- survives; losers archive with redirects. Restaurants are untouched;
-- ingredients are not place-grounded so the never-delete law is met by
-- ARCHIVE + REDIRECT, never DELETE.
CREATE TEMP TABLE ingredient_key_dupes AS
SELECT e.entity_id AS from_id,
  (SELECT k.entity_id FROM core_entities k
   WHERE k.type = 'ingredient' AND k.status <> 'archived'
     AND k.identity_key = e.identity_key
   ORDER BY (SELECT count(*) FROM core_restaurant_entity_events ev
             WHERE ev.entity_id = k.entity_id) DESC,
            k.created_at
   LIMIT 1) AS to_id
FROM core_entities e
WHERE e.type = 'ingredient' AND e.status <> 'archived'
  AND e.identity_key IS NOT NULL AND e.identity_key <> ''
  AND EXISTS (
    SELECT 1 FROM core_entities o
    WHERE o.type = 'ingredient' AND o.status <> 'archived'
      AND o.entity_id <> e.entity_id
      AND o.identity_key = e.identity_key
  );
DELETE FROM ingredient_key_dupes WHERE from_id = to_id OR to_id IS NULL;

-- Bank the loser's name on the winner before archiving — the same alias
-- fold every merge does, but written as a ROW (this table's whole point).
INSERT INTO entity_alias (entity_id, form, form_folded, locale, source, confidence, status)
SELECT d.to_id, l.name, lower(l.name), 'und', 'merge_fold', 1, 'active'
FROM ingredient_key_dupes d
JOIN core_entities l ON l.entity_id = d.from_id
ON CONFLICT (entity_id, locale, form) DO NOTHING;
-- NOTE ON form_folded ABOVE: lower() is NOT the fold and is not pretending
-- to be. These are the ingredient losers only — an ASCII, lowercase,
-- punctuation-free vocabulary by construction (the fold is identity on
-- them). The backfill script re-writes every form_folded in this table
-- through canonicalFold immediately after this migration, which is where
-- the real fold happens. No SQL fold expression is created or indexed.

UPDATE core_entities SET status = 'archived'
WHERE entity_id IN (SELECT from_id FROM ingredient_key_dupes);
INSERT INTO entity_redirects (from_entity_id, to_entity_id)
SELECT from_id, to_id FROM ingredient_key_dupes
ON CONFLICT (from_entity_id) DO NOTHING;

DROP INDEX IF EXISTS uq_entities_ingredient_name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ingredient_identity_key
  ON core_entities (type, identity_key)
  WHERE status <> 'archived'
    AND type = 'ingredient'
    AND identity_key <> '';
