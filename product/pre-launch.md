# Pre-Launch Checklist

The SHORT list of things that genuinely need launch-scale data (or launch timing) and cannot be
settled on the dev corpus. Everything else gets answered NOW with current data — do not park
items here to avoid work; this file is for the rare truly-data-gated checks.

## Search / collection (verify on the full Austin corpus, after the archive load)

- [ ] **Sibling K/R eyeball on real data** — re-run `scripts/search-harness/sibling-sweep.ts` on the
      loaded Austin corpus and eyeball the kept/killed lists for ~20 anchors. Defaults K=25/R=20
      were frozen on the dev corpus; confirm they still read right at 10-50x entity count.
- [ ] **Thread G at scale** — cuisine-hub over/under-fire rate, praise false-positive rate,
      dish-token faithfulness, fabricated-dish check across the full load (spot-validated on
      slices pre-load; this is the full-corpus confirmation).
- [ ] **Batch-dedupe Phase 3 go/no-go** — read the `intra_batch_near_duplicate_collapsed` counter
      after the full load. Phase 3 (LLM emits raw mentions; a deterministic staging resolver
      canonicalizes across the batch; delete LLM canonicalization) only if the counter shows the
      class is big enough to justify the restructure.
- [ ] **Typeahead latency at scale** — measure per-keystroke autocomplete latency on the loaded
      corpus. If p95 degrades past feel-threshold, build the prefix FST/trie; otherwise close it.
- [ ] **Alias worker go/no-go** — measure how many `food_aliases` the prompt field actually banked
      across the load and whether recall misses trace to missing aliases. Worker only if the data
      says the prompt-field floor is insufficient.

## Ops / cost

- [ ] **Enable the location-refresh cron** (`refreshStaleLocations`) at launch — freshness only
      matters when users are looking. Suggested: weekly, TTL 90d, limit sized to stay inside the
      free Enterprise SKU quota (see plans/search-collection-open-threads.md cost notes).
- [ ] **Google usage ledger review** — after the first month of real traffic, read the internal
      call ledger + Cloud billing export; hunt inefficiencies.

## Explicitly NOT parked here (answered with current data, 2026-07-05+)

- always-vs-expansion dense flag → SETTLED: client always sends explicit `includeSimilar`
  (toggle); env mode is dead weight for real traffic.
- Homograph venue-name rescue → check on current corpus during slice validation.
- On-demand batch flush cadence → small design decision, built pre-launch.
- Pack-size quality sweep → run on real slices interactively (costs cents).
