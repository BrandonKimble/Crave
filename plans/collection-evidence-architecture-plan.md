# Collection Evidence Architecture Plan

Last updated: 2026-04-15
Status: implemented foundation
Scope:

- `/Users/brandonkimble/crave-search/apps/api/prisma/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/content-processing/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/external-integrations/reddit/**`
- `/Users/brandonkimble/crave-search/apps/api/src/modules/search/**`

Related docs:

- `/Users/brandonkimble/crave-search/plans/restaurant-tag-signals-search-plan.md`
- `/Users/brandonkimble/crave-search/plans/search-performance-plan.md`

## Objective

Move collection/storage toward a model where:

- raw collected content is preserved
- extraction inputs are reproducible
- normalized evidence is stored as facts
- product-facing tables are rebuildable projections

This should unlock:

- new analytics without re-ingesting everything from scratch
- new ranking formulas derived from the same evidence
- future partial replay of subsets, if we decide the extra complexity is worth it
- correct event-time decay even when older mentions are processed after newer ones

## Current state

Today the system is mixed:

- some things are already event-like:
  - `collection_processed_sources`
  - `poll_votes`
  - `user_search_logs`
  - `user_restaurant_views`
  - `user_food_views`
- some things are projections / aggregates:
  - `core_restaurant_items`
  - display rank tables
  - quality scores

That means the current system can answer today’s product questions well, but it does not fully preserve the facts needed to:

- re-derive all future metrics
- safely replace the contribution of one subset with a newer model/prompt version

## Key question: is partial replay actually possible?

### Short answer

Yes, but only if we intentionally design for it.

With the current model, partial replay is not safe enough.

### What partial replay requires

To replay a subset as if a newer model ingested the raw data again, we need all of this:

1. Stable source documents

- the original post/comment text
- timestamps
- source-level metadata like upvotes

2. Exact extraction inputs

- the exact chunk or context window we sent to the LLM
- not just the raw source rows

Reason:

- extraction depends on chunking, ordering, post context, and surrounding comments
- reproducing only from raw posts/comments is not guaranteed to recreate the same prompt input

3. Extraction-run identity

- which model
- which prompt/config snapshot
- which chunking rules
- which source subset

4. Source-linked evidence facts

- normalized evidence rows linked back to the source documents and extraction run

5. Rebuildable projections

- scores and aggregates must be derivable from evidence
- not only incrementally mutated forever

6. Deterministic decay semantics

- decay must be based on event time (`mentioned_at`) and scoring time
- not on opaque historical mutation order

If those conditions are met, replay is possible.

### Why this matters for the current decay behavior

Today the system stores rolling decayed snapshots on projection rows like `core_restaurant_items`.

That is efficient, but not fully ideal as a long-lived scoring truth because older events often arrive after newer ones.

With the new model:

- immutable evidence events become the source of truth
- projection scores become rebuildable outputs
- out-of-order ingestion stops being a correctness problem

### What replay means in practice

It does not mean “mutate current rows a little bit.”

It means one of these:

1. Recompute affected projections from the active evidence set for a subset
2. Recompute all projections from evidence events

The first is faster but more complex.
The second is simpler conceptually but heavier operationally.

## Recommendation

Design the collection layer so partial replay becomes possible later, but do not make “subset replay” the first goal.

The immediate value of this architecture is:

- better analytics
- better explainability
- safer future ranking experimentation
- the ability to rebuild projections cleanly
- fully correct event-time decay under out-of-order ingestion

If replay becomes important later, the same model can support it.

## Proposed model

### 1. Source document layer

Recommended table family:

- `collection_source_documents`

Purpose:

- immutable source-of-truth copy of collected material

Typical columns:

- `document_id`
- `platform`
- `source_type`
- `source_id`
- `community`
- `parent_source_id`
- `author_name` if needed
- `title`
- `body`
- `url`
- `source_created_at`
- `collected_at`
- `score` / upvotes snapshot
- `raw_payload`

Rules:

- append-only or replace-by-version
- source identity must be stable

### 2. Extraction run layer

Recommended table family:

- `collection_runs`
- `collection_extraction_runs`

Purpose:

- identify one processing pass over a document set using a specific prompt/model/chunking configuration

Typical columns:

- `extraction_run_id`
- `collection_run_id`
- `pipeline`
- `model`
- `system_prompt_hash`
- `system_prompt`
- `generation_config`
- `chunking_config`
- `started_at`
- `completed_at`
- `status`
- `metadata`

Implemented recommendation:

- no dedicated `prompt_version` or `code_version` columns
- store the exact system prompt plus a hash
- keep optional git sha / release ids in `metadata`

Reason:

- replay correctness depends more on the actual prompt/config and chunk payload than a manually maintained version label
- version labels are easy to neglect; hashes and snapshots are self-describing

### 3. Extraction input snapshot layer

Recommended table family:

- `collection_extraction_inputs`

Purpose:

- preserve the exact LLM input unit used for extraction

Typical columns:

- `input_id`
- `extraction_run_id`
- `input_index`
- `input_payload`
- `raw_output`
- `created_at`

This is the layer that makes future replay truly defensible.

Without it, “rerun this subset under a new prompt” is approximate, not exact.

### Smallest replayable unit

The smallest useful replayable unit is not the full rendered prompt string and not the full raw thread copied over and over.

It is:

- the exact lightweight chunk payload that `buildProcessingPrompt(...)` serializes for the model

In the current code, that payload is effectively:

- `posts[]`
  - `id`
  - `title`
  - `content`
  - `extract_from_post`
  - `comments[]`
    - `id`
    - `content`
    - `parent_id`

This is the minimum replayable input because it captures:

- the exact post/comment subset in the chunk
- the exact ordering/structure used for extraction
- the exact reduced shape the model actually sees

Recommendation:

- store `input_payload` as this lightweight chunk JSON
- do not store the fully concatenated rendered prompt text
- do not duplicate full raw Reddit payloads inside each input row

The source documents still hold the richer raw content. The extraction input snapshot holds the exact model-facing subset/projection.

If we need fast source-document lookup by input, use a join table instead of an ID array:

- `collection_extraction_input_documents`
  - `input_id`
  - `document_id`
  - `ordinal`

### 4. Evidence event layer

Recommended table family:

- `core_restaurant_events`
- `core_restaurant_entity_events`

Preferred DB naming:

- keep restaurant-only evidence and restaurant-to-entity evidence in sibling tables

Purpose:

- persist normalized claims emitted by extraction

Examples of evidence:

- restaurant-only praise
- restaurant mention
- restaurant -> food mention
- restaurant -> category mention
- restaurant -> food attribute mention
- restaurant -> restaurant attribute mention

Typical columns for `core_restaurant_events`:

- `event_id`
- `extraction_run_id`
- `input_id`
- `source_document_id`
- `restaurant_id`
- `evidence_type`
- `mentioned_at`
- `source_upvotes`
- `metadata`

Typical columns for `core_restaurant_entity_events`:

- `evidence_event_id`
- `extraction_run_id`
- `input_id`
- `source_document_id`
- `restaurant_id`
- `entity_id`
- `entity_type`
- `evidence_type`
- `is_menu_item`
- `general_praise`
- `mentioned_at`
- `source_upvotes`
- `metadata`

Implemented provenance addition:

- `mention_key` on both event tables so sibling facts from one extracted mention can be rebuilt together

Important rule:

- these are the long-lived fact tables
- evidence rows should be dedupable and source-linked

Why split the tables:

- restaurant-only evidence needs accurate replay but has no `entity_id`
- forcing it into the entity table would require nullable target fields or a polymorphic model
- the split keeps constraints, rebuilds, and queries simpler

Why `entity_events` is better than `tag_events` here:

- these rows are canonical restaurant-to-entity facts
- `tag` is the product surface built from them, not the raw database meaning

Recommended uniqueness direction:

- prevent duplicate ingestion of the same extracted fact from the same source/input
- avoid over-constraining uniqueness before current mention/output shapes are mapped during implementation

### 5. Projection layer

These are rebuildable product tables:

- `core_restaurant_items`
- `core_restaurant_entity_signals`
- display rank scores
- quality score projections

These should be treated as outputs, not as the only durable truth.

Implemented rebuild/cutover services:

- `ProjectionRebuildService`
- `ReplayService`

## Replay strategy

### Phase 1 recommendation

Support full rebuildability first.

That means:

- projections can be recomputed from evidence
- replay-by-subset is not yet a primary operator

This is enough to unlock:

- new metrics
- new ranking formulas
- safe refactors of scoring logic
- an ideal event-time decay system for rebuilt projections

### Phase 2 recommendation

If subset replay becomes worth it, add the concept of an active extraction set.

Possible model:

- each source document can have many extraction runs
- only one run is active for projection purposes
- switching active runs triggers projection rebuild for the affected scope

That makes “replace subset with newer model output” possible.

### Rebuild scope options

1. Global rebuild

- simplest logic
- heaviest runtime

2. Restaurant-scoped rebuild

- rebuild projections only for affected restaurants
- probably the best long-term tradeoff

3. Source-scoped delta replacement

- subtract old active evidence
- add new active evidence
- most efficient
- highest complexity

Recommendation:

- target restaurant-scoped rebuilds
- do not implement delta subtraction first

## Replay workflow

If we need replay later, the safest workflow should be:

1. Select a contiguous subset

- by `source_created_at` range
- or by `extraction_run_id`
- or by document id range if needed

2. Create a new extraction run

- preserve prompt/model/config on the new run
- write new extraction inputs and outputs
- write new restaurant and restaurant-entity events

3. Build the affected restaurant scope

- find restaurants touched by old or new events in the subset
- treat those restaurants as the rebuild target set

4. Rebuild projections from active evidence

- rebuild `core_restaurant_items`
- rebuild `core_restaurant_entity_signals`
- rebuild any remaining category/rank/quality projections

5. Swap the active run for the subset

- only after projection rebuild succeeds
- never by mutating old projection deltas in place

This keeps replay conceptually simple:

- select subset
- extract into a new run
- rebuild affected restaurants from the active event set
- switch authority

## Making replay simple for arbitrary subsets

Given the product expectation, we only need contiguous subsets.

That simplifies the operator design:

- support replay by date range first
- support replay by extraction run second
- do not optimize for arbitrary scattered document lists in v1

Recommendation:

- every replay path should resolve to a concrete document set first
- every rebuild path should resolve to a concrete restaurant set second

That gives a very legible mental model:

- subset selector -> document set -> event set -> affected restaurants -> rebuilt projections

## Self-documenting code path

If we want future AI agents to understand replay quickly, the code should expose a single obvious pipeline:

1. `collect source documents`
2. `build extraction inputs`
3. `run extraction`
4. `persist evidence events`
5. `rebuild projections`
6. `activate run`

Implemented module/service shape:

- `source-document.repository`
- `extraction-run.service`
- `extraction-input.service`
- `evidence-persistence.service`
- `projection-rebuild.service`
- `replay.service`

Recommended rule:

- all replay entry points go through `replay.service`
- `replay.service` should orchestrate only
- actual logic should live in the shared extraction/event/projection services

Recommended naming:

- use `rebuild` for deterministic projection recomputation
- use `replay` only for the higher-level operation that creates a new run and then rebuilds projections

That distinction will make the codebase easier to read:

- `rebuild` = recompute outputs from events
- `replay` = replace a subset with a newly extracted run

Implemented contiguous-subset cutover entry points:

- `ReplayService.activateExtractionRunForDateRange(...)`
- `ReplayService.activateExtractionRunForDocuments(...)`

Those methods:

1. resolve the document subset
2. switch `active_extraction_run_id`
3. collect affected restaurants
4. rebuild projections from active evidence
5. refresh quality scores

## Decay and scoring

Replay is only trustworthy if decay is computed from evidence timestamps.

Recommended rule:

- evidence stores `mentioned_at`
- projections store current derived scores
- rebuild jobs recompute decay as of “now” from the event timestamps

That means replaying a subset is not “apply the same historical increments in the same order.”

It is:

- rebuild the score from the active evidence set using event time

This is the correct model.

### What this means for the current decay logic

The current system is already partly aligned with this approach:

- updates use `mentionCreatedAt`
- category boost replay processes events in `mentionCreatedAt` order

But projections still rely heavily on rolling snapshots rather than fully rebuildable fact history.

The improvement in this plan is:

- make the evidence history durable enough that the decayed projections can be recomputed from evidence instead of only updated in place forever

## Ideal decay model

### Source of truth

Decayed scores should not be the primary truth.

Instead:

- immutable evidence events are the truth
- projection counts are durable aggregates
- decayed scores are derived/materialized outputs

### Core scoring rule

For any scored target, the conceptual rule should be:

- `score(now) = Σ event_weight(event) * decay(now - event.mentioned_at)`

This means:

- processing order does not matter
- late-arriving older events do not require "going backward in time"
- replay/rebuild stays deterministic

### Practical implementation shape

Recommended layers:

1. Evidence events

- immutable rows with `mentioned_at`
- enough data to determine each event's contribution

2. Projection aggregates

- stable non-decayed fields used for display/filtering
- examples:
  - `mention_count`
  - `total_upvotes`

3. Score materializations

- optional cached decayed scores for search/ranking speed
- rebuildable from events
- never the only durable scoring truth

### Rebuild rule

When an event is written for a projection target:

- do not assume a forward-only delta update is always safe
- the safe default is to rebuild the affected target from its active events

That rebuild can be:

- target-scoped on write
- market/full scoped in maintenance jobs

### Product implication

Counts shown to users and scores used for ranking should stay separate:

- UI counts come from stable aggregates like `mention_count`
- ranking comes from decayed event-time scores

Example:

- show `taco 12` on a restaurant profile
- rank using recent/relevant taco evidence rather than raw count alone

## What this means for the current system

### Good news

The system already has some building blocks:

- event-like logs
- source ledger
- clear projection tables

### Missing pieces

- immutable source document storage for all collected material
- exact extraction input snapshots
- a generalized evidence-event layer
- projection rebuild jobs that do not depend only on past mutations

## Naming cleanup recommendations

If we touch the schema in this area, we should also clean up the most misleading names:

- `core_connections` -> `core_restaurant_items`
- `collection_sources` -> `collection_processed_sources` or `collection_seen_sources`

Recommendation:

- rename `core_connections` because it is central and actively confusing
- rename `collection_sources` because it is not a source document table
- keep replay/category support in the event/projection model rather than preserving legacy side tables

## Recommended rollout

### Phase 1. Tag architecture

Deliver the tag plan first:

- `/Users/brandonkimble/crave-search/plans/restaurant-tag-signals-search-plan.md`

This creates the first event + aggregate dual-table pattern in a focused area.

### Phase 2. Source document persistence

Add:

- `collection_source_documents`

Exit criteria:

- collected posts/comments are durably stored with stable source identity

### Phase 3. Extraction runs + input snapshots

Add:

- `collection_extraction_runs`
- `collection_extraction_inputs`

Exit criteria:

- the exact model-facing chunk payload can be recovered for a run
- the system prompt/config that produced the extraction can be recovered for a run
- multi-batch collection jobs have a first-class parent `collection_runs` row instead of relying on metadata stitching

### Phase 4. General evidence events

Add:

- `core_restaurant_events`
- `core_restaurant_entity_events`

Exit criteria:

- normalized extraction claims are preserved as facts

### Phase 5. Rebuildable projections

Refactor:

- `core_restaurant_items`
- category aggregates
- rank/quality projections

So they can be rebuilt from evidence.

Exit criteria:

- a projection rebuild job can regenerate outputs for at least one restaurant scope from evidence only

## Open questions

- How much raw source payload do we want to retain versus normalize?
- Do we want the extraction input snapshot to store the fully rendered prompt input or a structured payload that can be re-rendered?
- Should evidence events be restaurant-centric only, or generic enough to support future non-restaurant domains?
- What is the first rebuild scope we want to support: full, market, restaurant, or source subset?

## Recommendation summary

The correct long-term shape is:

- source documents
- extraction runs
- extraction input snapshots
- evidence events
- rebuildable projections
- event-time-derived decayed scores

And the answer to the replay question is:

- subset replay is possible, but only if we intentionally build the layers above
- without exact input snapshots and rebuildable projections, it is not trustworthy
- the first practical value of this architecture is analytics and new ranking formulas, not replay
- but if we build it correctly, replay can become a real capability later instead of a dead-end wish
