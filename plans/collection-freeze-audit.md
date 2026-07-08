# Collection Freeze Audit — the green light for archive loads

**Date:** 2026-07-08. Purpose: classify every piece of the collection contract by
what a future change would cost, and drive the "would force re-paying real money"
list to zero. Companion to [archive-prefilter-pipeline.md](archive-prefilter-pipeline.md).

## The cost ladder (what a change actually costs)

Every conceivable change lands on one of four rungs. Only rung 4 re-pays real money,
and NOTHING currently sits there:

1. **Reprocess projections (free, minutes).** Scoring weights/halflives, projection
   aggregation, ranking. Rebuilds from persisted mention events. Covers:
   `mentionCount`, `totalUpvotes`, `supportMentionCount/Upvotes`, `lastMentionedAt`,
   `generalPraiseUpvotes`, all Crave Score config.
2. **Re-resolve from stored mentions (free, hours).** Entity resolution / matching /
   banking changes (alias rules, attribute linking, dedupe-merge). Re-runs against
   persisted raw outputs; no LLM calls.
3. **Re-extract from stored inputs (~$25/city, LLM only).** Prompt changes —
   new mention fields, changed field semantics (e.g. the category law), Step
   re-designs. `collection_extraction_inputs.inputPayload` persists the exact LLM
   input per chunk; re-extraction re-runs the prompt over stored inputs and
   re-points documents to the new active run (old runs orphaned, never
   double-counted — the active-run projection guarantee). No Reddit re-read, no
   Google spend, verdicts/embeddings cached.
4. **Re-collect sources (would re-pay… nothing, actually).** Different window,
   different subreddits, un-dropping Stage-0 exclusions: archives are LOCAL `.zst`
   files — re-reading them is free; only rung-3 LLM cost applies on top. The
   Reddit API is not involved for archive data.

**The one non-repeatable spend — Google Places enrichment — is keyed to
RESTAURANTS, not to any of the above.** `hasPlaceId` guards re-enrichment; a
re-collection/re-extraction reuses every enriched restaurant. Entity merges keep
locations. The dollars survive every contract change.

## Contract classification (from the full field inventory, 2026-07-08)

**FROZEN — long-stable, multiple validation passes:**
`restaurant` + canonicalization (Step 2), `food` + composition (Step 4),
`food_categories` (Step 4.3 law re-validated on real slices this week),
`food_attributes` / `restaurant_attributes` (Step 3), all `*_surfaces`,
`is_menu_item` (Step 5), `general_praise` (Step 6, availability/popularity law
added + validated), `source_id`, Reddit metadata consumption (`score`,
`created_utc` → the two scoring-critical inputs, both persisted on
SourceDocument AND events), full `rawPayload` retention (author etc. recoverable).

**SETTLED THIS WEEK (schema v1.1 — the load must be ≥ this version):**

- `ingredients` (mention → Connection.ingredients), replacing `food_aliases`
  (aliases now flow from the offline dish-knowledge synthesis + surface-divergence
  banking). Wired end-to-end incl. projection aggregation.
- Relevance gate (verdicts persisted, prompt-hashed, calibrated R=1.000).

**WATCH (the only genuinely-new machinery):**

- **Dish-knowledge synthesis** (canonical ingredients + aliases per dish;
  3 commits in 2 days). It is a POST-LOAD, per-dish amortized pass — a defect
  here costs a re-synthesis, never a re-collection. **Pre-load gate: run it
  end-to-end on the seed corpus once and eyeball.**

## Green-light checklist

- [x] Every mention field classified; none above rung 3 (~$25 worst case).
- [x] Google spend isolated from all contract changes (skip-guard + merge-safe).
- [x] Re-extraction mechanics proven (active-run re-pointing; batch backfill path).
- [x] Raw evidence complete (inputPayload + rawOutput + full rawPayload per source).
- [ ] Owner confirms `ingredients` contract is final (his design, other session).
- [ ] Dish-knowledge synthesis e2e on the seed corpus (post-load pass rehearsal).

**Verdict: the contract is freeze-ready.** The load decision is now purely about
data usefulness and the ~$200–400 one-time Google spend — which the staged cost
proof (250 → 1,000 → 2,000 posts, ledger-measured per-restaurant rate) will
price precisely before full commitment.

## What the new loader must NEVER truncate (the test-pipeline lesson, structural)

Survives everything — reuse, never reset: `core_entities` place-backed
restaurants + `core_restaurant_locations` (Google spend), `geo_boundary_features`

- markets (TomTom), `collection_relevance_verdicts`, embeddings +
  `derived_*` (rebuildable but cheap to keep), `collection_source_documents`,
  `collection_extraction_inputs` (rungs 2–3 depend on them), `api_usage_ledger` /
  `llm_decision_records` (history).
  Replaceable per re-run: extraction runs (re-point active), mentions/events,
  projections, scores.
