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

## Launch shape (owner-decided build work, not data-gated)

- [ ] **Rebuild the Stripe web checkout rail + Strava-pattern dual-button
      paywall** (decided 2026-08-01: pre-launch shape). Primary paywall button
      opens external Stripe web checkout (Apple-commission-free on the US
      storefront per the April 2025 Epic v. Apple contempt ruling); secondary
      button does native IAP via RevenueCat. Restore the client rail
      (createCheckoutSession/createPortalSession, DTOs, CheckoutSession table)
      from commit `c2861853^` — webhook/refund/cancel plumbing never left.
      Full context: business/business-model.md (Margin lever) +
      plans/payments-ideal-shape.md (Purchase flows).

## Ops / cost

- [ ] **Enable the location-refresh cron** (`refreshStaleLocations`) at launch — freshness only
      matters when users are looking. Suggested: weekly, TTL 90d, limit sized to stay inside the
      free Enterprise SKU quota (see plans/search-collection-open-threads.md cost notes).
- [ ] **Verify LLM audit reasons resolve correctly in prod**: `LLM_AUDIT_REASONS`
      unset + `APP_ENV=prod` → ephemeral judge reasons OFF (entity match,
      attribute placement, poll subject — paid-and-discarded), while the
      relevance gate's PERSISTED verdict reasons stay ON by design (~$0.08/city,
      permanent record of excluded signal). Flip `LLM_AUDIT_REASONS=true`
      temporarily whenever tuning judge prompts in prod.
- [ ] **Disconnect the GitHub repo from prod api+worker in the Railway
      dashboard** (service → Settings → Source), then remove the never-match
      watchPatterns. Discovered 2026-08-01: the patterns that disable
      auto-deploy ALSO make Railway SKIP CLI deploys, so deploy.sh currently
      needs a pattern window opened/closed around every prod deploy. The
      disconnect makes deploy.sh just work and closes the push-to-deploy
      hole for real.
- [ ] **Upgrade Railway to Pro + enable daily Postgres backups** — scheduled
      volume backups (dashboard: postgis-db service → volume → Backups) are
      Pro-plan-only. This is the only automated backup for prod Postgres;
      until then coverage is deploy-time only (pre-migration `pg_dump` in
      `scripts/rig/deploy.sh`, last 5 kept in `~/.crave-deploy-backups`).
      After enabling, run one restore rehearsal (see
      plans/production-hardening.md §8).
- [ ] **Google usage ledger review** — after the first month of real traffic, read the internal
      call ledger + Cloud billing export; hunt inefficiencies.

## Explicitly NOT parked here (answered with current data, 2026-07-05+)

- always-vs-expansion dense flag → SETTLED: client always sends explicit `includeSimilar`
  (toggle); env mode is dead weight for real traffic.
- Homograph venue-name rescue → check on current corpus during slice validation.
- On-demand batch flush cadence → small design decision, built pre-launch.
- Pack-size quality sweep → run on real slices interactively (costs cents).
