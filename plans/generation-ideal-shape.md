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

### 3.1 Generation is a row

```
extraction_generations(
  generation_id, prompt_kind, prompt_version, scope_communities[],
  state,            -- draft | shadowing | ready | active | superseded | discarded
  campaign_id,      -- the funded envelope, if any
  doc_total, doc_extracted,          -- completeness is a FACT, not a query
  created_at, activated_at, superseded_at
)
```

Runs belong to a generation. Documents belong to a generation. **And every
derived row carries `generation_id`** — entities, connections, scores,
edges.

Consequences, each of which deletes a defect class:

- **"Is this active?" becomes `generation_id = <active>`** — one predicate,
  zero joins. D2/D7/D12/gap-4b become unwriteable.
- **Activation becomes one UPDATE** (`state='active'` on the new,
  `'superseded'` on the old). Atomic by construction. D8's completeness
  gate is a column comparison, not a 4-table query.
- **Activation becomes genuinely REVERSIBLE** — the superseded generation's
  derived rows still exist, just not active. D1's false claim becomes true.
  Reclaiming space is a separate, explicit `discard` on a superseded
  generation.
- **Shadow-minted vocabulary is naturally invisible**: the merge sweeps
  filter to the active generation, so D5 evaporates without a cron
  kill-switch — which means **collection genuinely never pauses**, restoring
  the property the current design claims but doesn't have.
- **F3's zombies** get a real answer: a starved connection is simply one
  with no support in the active generation.

### 3.2 Readers cannot forget the filter

A `generation_id` column is necessary but not sufficient — 37 sites could
still omit the predicate. The derived tables get **views** that carry the
predicate, and the raw `core_*` tables become writable only by the rebuild/
activation machinery:

```
CREATE VIEW entities  AS SELECT * FROM core_entities      WHERE generation_id = active_generation();
CREATE VIEW dishes    AS SELECT * FROM core_restaurant_items WHERE generation_id = active_generation();
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

1. **Add `generation_id` to the derived tables, nullable**, plus the
   `extraction_generations` table. Backfill the existing corpus as
   generation 1 (active). Nothing reads it yet — zero risk.
2. **Write the views + the CI reader lockdown.** Flip readers over one
   module at a time; the spec fails loudly on regressions.
3. **Rebuild/activation writes `generation_id`.** Activation becomes a
   state flip; keep the old physical delete OFF (that alone makes rollback
   real).
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
