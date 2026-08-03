# The foundational re-derivation: GENERATION as a first-class dimension

Written 2026-08-01 after the final red team. The question that prompted it:
_are the abstractions themselves generating these defects?_ Yes. This doc
names the missing concept, derives the ideal shape from scratch, and maps
every defect the red teams found onto it.

## 1. The evidence

Across four red-team rounds the critical defects were:

| Defect | What it actually was                                                                             |
| ------ | ------------------------------------------------------------------------------------------------ |
| D2     | activate-shadow's hand-rolled "which docs does this run own" was wrong (13,912 prod docs, 15.5%) |
| D7     | activate-shadow's hand-rolled "which restaurants are affected" missed a table                    |
| D12    | shadow-diff's hand-rolled "which runs are the shadow" wasn't community-scoped                    |
| gap 4b | shadow-diff counted OTHER shadow versions' events as active support                              |
| D5     | the 3AM merge sweeps never ask the question at all — they see shadow vocabulary as real          |
| F3     | starved connections keep matching search because nothing marks them                              |
| D1     | "reversible" was false: activation DELETES the superseded generation                             |
| D8     | nothing knew whether a shadow was COMPLETE                                                       |

Seven of eight are the same defect wearing different clothes: **"is this
fact part of the current generation?" is re-derived, by hand, at every call
site.** Measured: `active_extraction_run_id` appears at **37 non-test call
sites across 12 files**, each with its own join.

And the root cause is visible in the schema:

- `core_restaurant_entity_events` / `core_restaurant_events` → carry
  `extraction_run_id`. Provenance: **yes**.
- `collection_source_documents` → carries `active_extraction_run_id`.
  Provenance: **a pointer**.
- `core_entities`, `core_restaurant_items`, scores, edges → carry
  **NOTHING**. (Verified against prod: no run, no generation, no version.)

So the derived layer — the layer the app actually serves and the layer a
re-extraction replaces — is the one layer with no notion of which
extraction produced it. Every consumer must reconstruct it with a three-hop
join (derived → events → documents → pointer). Thirty-seven chances to be
subtly wrong; the red teams found seven of them.

## 2. The missing concept

**A GENERATION**: one coherent extraction of a scope of documents under one
prompt version. Today a generation exists only as an emergent property of
(prompt hash × a set of runs × per-document pointers). It has no row, no
identity, no state, and no lifecycle — so it cannot be reasoned about,
gated, counted, activated atomically, or rolled back.

Everything hard about the shadow flow is hard because we are simulating an
object the schema doesn't have.

## 3. The ideal shape (derived from scratch)

### 3.1 CORRECTION — entities are IDENTITY, never generation-scoped

My first draft of this section said "every derived row carries
`generation_id` — entities, connections, scores, edges." **That is wrong,
and testing it against the anchor law is what caught it.**

Measured: 181 user list items anchor to 41 entities. The whole reason a
user's saved restaurant survives a re-extraction is that the entity ID is
_shared across generations_ — resolution lands new mentions back onto the
same row. Stamp a generation on entities and a user's list item points at a
"non-current" entity the instant a generation flips. The abstraction would
break the exact property the system exists to protect.

So the layers are NOT uniformly generation-scoped. The correct model:

| Layer                                    | Generation-scoped?                         | Why                                                                          |
| ---------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| Documents                                | no                                         | source truth, immutable                                                      |
| Evidence (events)                        | **yes** — already, via `extraction_run_id` | this is what makes a shadow possible                                         |
| **Identity** (`core_entities`)           | **NO — deliberately shared**               | user anchors, redirects, and alias history live here; sharing IS the feature |
| Projections (connections, scores, edges) | derived from ACTIVE evidence only          | rebuilt, not versioned                                                       |

The real defect was never "the derived layer lacks a generation column."
It is that **the domain question — "what is active / owned / affected?" —
is hand-written as ad-hoc SQL at 37 call sites instead of existing once.**
A generation table would not have fixed that; it would have added a 38th
place to get it wrong.

### 3.1b The actual fix: ONE definition per domain question

Every defect maps to a question that should have exactly one tested
implementation:

| Question                                           | Defects it caused | Home                                                                                                          |
| -------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| which documents does this run OWN?                 | D2                | `documentsOwnedByRun()`                                                                                       |
| which restaurants does this document set affect?   | D7                | `affectedRestaurantsForDocuments()` (already existed in replay.service — activate-shadow just didn't call it) |
| which runs are THIS shadow, for THESE communities? | D12, gap 4b       | `shadowRunsFor()`                                                                                             |
| which entities have ACTIVE support?                | D5, F3            | `entitiesWithActiveSupport()`                                                                                 |

Two structural supports make those definitions clean:

1. **Run lineage as real columns, not JSON.** `replay_of_run_id` (FK) and
   `prompt_version` (FK) instead of `metadata->>'replayOfExtractionRunId'`
   and a hash join. D2's fix is ugly precisely because the relationship is
   buried in JSON.
2. **A CI lockdown spec** forbidding raw `active_extraction_run_id` /
   `system_prompt_hash` joins outside that one module — the pattern
   `gemini-gateway-lockdown.spec.ts` already proves works.

Generations may still earn a row later for _completeness_ tracking (D8) —
but as a **scope/progress record**, never as a tag on identity.

### 3.2 Readers cannot forget the filter

A `generation_id` column is necessary but not sufficient — 37 sites could
still omit the predicate. The derived tables get **views** that carry the
predicate, and the raw `core_*` tables become writable only by the rebuild/
activation machinery:

```
-- Readers never join to documents/runs themselves; the definition lives once.
CREATE VIEW active_entity_support AS
  SELECT DISTINCT e.entity_id
  FROM core_entities e
  JOIN core_restaurant_items c ON e.entity_id IN (c.restaurant_id, c.food_id);
-- (connections ARE the active projection: the rebuild only builds them from
--  events whose run is the document's ACTIVE run, so "has a connection" IS
--  "has active support" — no new column needed.)
```

Enforced the way the one-gateway law is already enforced: a CI spec that
fails when a reader references a raw `core_*` table. That pattern is proven
here — `gemini-gateway-lockdown.spec.ts` has held the Gemini boundary for
weeks.

### 3.3 Spend attribution is ambient, not threaded

D4 (the envelope meters ~7% of spend) exists because `campaignId` is hand-
threaded into exactly one ledger call via `resumeContext`. Everything
downstream of batch ingest — resolution, embeddings, attributes, cuisine —
escapes.

Ideal: an **AsyncLocalStorage work-context** set once at the entry point
(runner/script/job) carrying `{generationId, campaignId}`. `UsageLedger`
reads it ambiently, so _every_ vendor call under that context is attributed
without any call site remembering. Un-attributed spend during a campaign
window then becomes a detectable anomaly rather than the default.

This is the same law already applied to prompts and the Gemini client: one
truth, one home, ambient rather than copied.

### 3.4 The operator surface is typed code, not shell

D3 (verbs hit the local DB), D11 (flags couldn't be forwarded), and the
silent `exit 0` all came from bash + `ts-node` + env-var coupling with zero
tests. Ideal: one typed CLI (a Nest command module) with an explicit
`--target prod|staging|local`, real subcommands, and integration tests
against a scratch database. `reextract.sh` becomes a thin alias.

### 3.5 What is already ideal — keep

- **Evidence is append-only and run-versioned.** This is why a shadow is
  possible at all; it is the good half of the design.
- **The user/derived boundary**: anchors + RESTRICT FKs + referenced-means-
  alive. Proven on live data (1,850 doomed entities, zero user references).
  A generation carries no user data, so this law is unchanged.
- **Prompts as versioned rows** with one governed active switch.
- **Campaign manifest + approve-by-hash.**

## 4. Migration path (each step independently valuable)

1. **One `ExtractionScopeService`** owning the four questions above, with
   specs. Additive — nothing changes behaviour on day one.
2. **Move every call site onto it**, then add the CI lockdown spec so a
   38th hand-rolled join cannot appear.
3. **Run lineage as real columns** (`replay_of_run_id`, `prompt_version`)
   so the definitions stop parsing JSON.
4. **Merge sweeps + GC filter by generation** → delete the CRONS_ENABLED
   invariant from the runbook, because it stops being needed.
5. **Ambient work-context for spend** → delete the "envelope meters 7%"
   invariant.
6. **Typed CLI** → delete the REEXTRACT_DB invariant.

Note what step 4-6 have in common: **each one deletes an operational
invariant from the runbook.** That is the test of a real abstraction — the
documentation gets _shorter_, because the rule is enforced by construction
instead of remembered by an operator.

## 5. Sequencing judgment (owner call)

The current patched flow is safe to run: every critical defect found has a
minimal fix, and the residual gaps are written as invariants the agent
must follow. The generation refactor touches the hottest tables in the
system and overlaps another session's in-flight content-identity work.

Two honest options:

- **Run Austin first** on the patched flow, then refactor with a real run's
  evidence in hand (and a fresh corpus to backfill as generation 1). Slower
  to ideal, lower risk, and the invariants are written down.
- **Refactor first.** Ideal sooner, and the Austin run then exercises the
  real shape — but it delays the run and lands on tables two sessions are
  actively editing.

Recommendation: **Austin first, refactor immediately after** — with steps
1–2 (additive column + views + lockdown) started in parallel now, since
they are risk-free and are the load-bearing half.

---

## CORRECTION 2026-08-03 (truth audit F1230–F1233) — appended, nothing above altered

Verified against the code on 2026-08-03.

- **F1230 — "37 non-test call sites across 12 files" is stale and pointing
  the wrong way.** Actual today: **54 non-spec occurrences across 14 files**
  (`grep -rn "active_extraction_run_id\|activeExtractionRunId" apps/api/src
apps/api/scripts | grep -v '\.spec\.'`). The count GREW after this doc was
  written, and it grew _after_ `ExtractionScopeService` landed — so migration
  step 2 ("move every call site onto it") is at best partial, and
  `extraction-scope-lockdown.spec.ts` demonstrably does not cover all sites.
  The diagnosis is more right than the doc knows; the number understates it.
- **F1231 — migration step 1 has ALREADY LANDED; it is not "started in
  parallel now".** `apps/api/src/modules/content-processing/reddit-collector/
extraction-scope.service.ts` exists and exports `documentsOwnedByRun`,
  `affectedRestaurantsForDocuments` and `shadowRunsFor`; it is wired in
  `reddit-collector.module.ts` and consumed by `scripts/activate-shadow.ts`.
- **F1232 — `entitiesWithActiveSupport()` does not exist.** The fourth of
  the four "domain questions" in the §3.2 table was never built (zero hits
  repo-wide), and the `CREATE VIEW active_entity_support` beside it is in no
  migration. Both read as proposals in context, but the table lists the
  function as if it were a peer of the three real ones — it is not.
- **F1233 — "`gemini-gateway-lockdown.spec.ts` has held the Gemini boundary
  for weeks" is wrong by an order of magnitude.** That file was first added
  **2026-07-29** (`git log --diff-filter=A`); this doc is dated 2026-08-01.
  Three days, not weeks. The pattern is still the right precedent to cite;
  the tenure claim was doing rhetorical work it had not earned.

Confirmed TRUE on re-check: `core_entities` carries no run/generation/version
column; `affectedRestaurantsForDocuments()` pre-existed in `replay.service.ts`;
the user-anchor count "41 entities" is exact on the mirror (the companion
"181 user list items" is a stale snapshot — 201 today). The §3.3
AsyncLocalStorage work-context is correctly framed as proposed and has not
been built. Prod-only figures (1,850 doomed entities, 13,912 docs / 15.5%,
the ~7% envelope metering) were NOT re-verified — they are not reproducible
from the repo.
