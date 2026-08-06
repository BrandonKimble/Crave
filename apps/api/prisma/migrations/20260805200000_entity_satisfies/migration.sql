-- THE SUBSTITUTABILITY EDGE (concept-graph plan, build step 4).
--
-- "If a user asked for FROM and we showed them TO, would they be satisfied?"
-- Hand-written (not `migrate dev`) per AUTHORING.md §2 — an auto-generated
-- diff would try to drop the Prisma-unmodelable indexes on core_entities.
-- Not a heavy migration: a create on an empty table rewrites nothing, so the
-- parallel-worker guard of §1 does not apply. Own timestamp per §4.
--
-- DIRECTED, deliberately. `cheese -> cheese pizza` is a fine substitution and
-- the reverse is catastrophic, and under the ranking invariant a wrong
-- eligibility claim with a high Crave Score ranks FIRST. The pair is the key
-- in ONE direction only; readers must never follow an edge backwards.
--
-- REJECTS ARE STORED. They are what make the pass idempotent: a re-run skips
-- everything already judged at the current prompt version, and a version bump
-- becomes a DIFF instead of a full re-judge.
--
-- NOT a merge. Two entities linked here remain two entities with their own
-- evidence; "these are one entity under two spellings" is the merge pipeline's
-- separate, destructive judgment.
CREATE TABLE "entity_satisfies" (
    "from_entity_id" UUID NOT NULL,
    "to_entity_id" UUID NOT NULL,
    -- 'satisfies' = the user would be happy with it (front section)
    -- 'cousin'    = a reasonable "similar" suggestion (gated ring)
    -- 'reject'    = not a substitute; stored so it is never re-judged
    "relation" VARCHAR(16) NOT NULL,
    "prompt_version" INTEGER NOT NULL DEFAULT 1,
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_satisfies_pkey" PRIMARY KEY ("from_entity_id", "to_entity_id"),
    CONSTRAINT "entity_satisfies_relation_check"
      CHECK ("relation" IN ('satisfies', 'cousin', 'reject')),
    CONSTRAINT "entity_satisfies_no_self" CHECK ("from_entity_id" <> "to_entity_id")
);

-- The read path: "what satisfies X?" — from + relation, covering to_entity_id.
CREATE INDEX "idx_entity_satisfies_from_relation"
  ON "entity_satisfies" ("from_entity_id", "relation");

-- Cleanup of a hard-deleted entity. Archival does NOT delete (place-grounded
-- rows are never deleted), so this fires only for genuine hard deletes; the
-- read path still filters archived and resolves redirects.
ALTER TABLE "entity_satisfies"
  ADD CONSTRAINT "entity_satisfies_from_fkey"
  FOREIGN KEY ("from_entity_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE;
ALTER TABLE "entity_satisfies"
  ADD CONSTRAINT "entity_satisfies_to_fkey"
  FOREIGN KEY ("to_entity_id") REFERENCES "core_entities"("entity_id") ON DELETE CASCADE;
