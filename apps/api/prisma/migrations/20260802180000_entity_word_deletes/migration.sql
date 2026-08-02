-- IDEAL-ABSTRACTION round 5, phase 2: SymSpell-style delete dictionary over
-- the entity vocabulary. Replaces the per-row levenshtein() seq-scan edit
-- arm with one btree probe (constant in corpus size) + Damerau-Levenshtein
-- verification in JS on the shortlist — transpositions ('vgean'→'vegan')
-- become reachable, and the edit lane stops scaling with the catalogue.
-- DERIVED table: rebuilt nightly from active entity names/aliases.
CREATE TABLE "derived_entity_word_deletes" (
    "delete_key" VARCHAR(64) NOT NULL,
    "word" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_type" "entity_type" NOT NULL,
    "is_alias" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "derived_entity_word_deletes_pkey" PRIMARY KEY ("delete_key", "word", "entity_id")
);

CREATE INDEX "idx_entity_word_deletes_key" ON "derived_entity_word_deletes"("delete_key");
