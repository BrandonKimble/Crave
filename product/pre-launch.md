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

- [ ] **CI HAS FAILED 100 CONSECUTIVE RUNS — lint, type-check, build and the
      entire test suite have never run there.** Found 2026-08-02. The `build`
      job dies at `yarn install --frozen-lockfile` because
      `patches/@rnmapbox+maps+10.2.9.patch` no longer applies: the package was
      bumped to 10.3.1 and the patch was never regenerated. Nothing noticed
      because deploys are manual CLI and consult no CI.

      Two consequences beyond the red build. First, every "tests green" claim
      in this repo — mine included — has been LOCAL ONLY. Second, that patch
      is not applied on ANY machine, including developer laptops, so its 1,007
      lines of real map-camera customisation (`ProfilePresentationCameraHost
      Registry`, `nativeHostKey`, `animationCompletionId`) are silently absent
      — which is exactly the two long-standing mobile tsc errors in
      `search-map.tsx` and `use-search-runtime-camera-intent-runtime.ts`.

      The patch is 1,007 lines of real source buried in 12,497 lines of
      accidentally-captured Android BUILD ARTIFACTS (`android/build/**`).
      Stripping those is mechanical, but retargeting at 10.3.1 is not:
      `RNMBXCameraViewManager.m` no longer exists upstream and two other files
      moved, so the customisation has to be re-applied to the new structure
      and verified with a native build. That belongs to whoever owns the map.
      A second CI job (`search-runtime-contract-tests`) fails separately with
      exit 127 — a missing `node` in that step.

### Red-team 2026-08-02 — what remains

Almost everything the three adversarial passes found is now FIXED (see git
from `d8f520316` onward): the ledger-vs-billed dollar gap, the janitor's
candidate-count policy, the paywall's anonymous short-circuit, the LLM
Redis-outage fail-open, the three-name Places vocabulary, the two demand-mass
implementations, the RevenueCat transfer that could revoke both sides, and
rank duplication in the pooled search merge.

Open in this lane:

- [~] **The pooled search merge ordering — HANDED OFF.** Page 1 of a relaxed
  search re-sorts in JS by `craveScore` while the SQL orders by `rising,
crave_score_exact, crave_score, total_upvotes, restaurant_id`, so a
  rising-sorted relaxed page 1 is not rising-sorted and the ordering rule
  visibly changes at the page-2 boundary. The result SET is correct and
  sections still hold; only the arrangement within page 1 is wrong.
  Superseded rather than patched: the session that owns search is cutting
  over to the step-3 POOLED query (`SEARCH_POOLED_MODE`), one query whose
  single ORDER BY covers every page — which deletes the merge, the
  exclusion list and this defect together.

- [ ] **`hasAccess` fails open on any error** while every spend gate fails
      closed. Left deliberately: an outage should not lock out paying
      customers, and flipping it is a product decision with a real downside.
      It is bounded by an error log today; if you want it tighter, the honest
      shape is a third state (indeterminate) that alerts rather than silently
      granting forever.
- [ ] **Autocomplete fires on every keystroke** (`AUTOCOMPLETE_DEBOUNCE_MS =
0`). Now that the embedding arm is spend-gated this is bounded, but the
      debounce is an owner choice — §16 says a number must be a fact, a
      derivation, or your decision, and this one is yours.

Also carried forward from the architecture pass, as judgement calls rather
than defects: the 1,461-line repository framework serving two repositories
(commit to the boundary or delete it), and the absence of branded id types
anywhere in the codebase.

- [x] **DEPLOY THE RATE-LIMIT FIX — DONE, verified live 2026-08-02.** The
      throttler bypass (`?x=/webhooks/` disabled rate limiting entirely) is
      closed in production. Re-measured after the deploy: 30 parallel
      unauthenticated POSTs to `/api/v1/auth/apple/native` gave 10x400 +
      20x429 WITH the query param — identical to the control. Before the fix
      the same probe returned 40x400 and zero 429s.

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
- [x] **~~Disconnect the GitHub repo from prod api+worker~~ DONE 2026-08-02**:
      verified no source repo is connected (service config has no source
      block; recent prod deploys all CLI-triggered) and the never-match
      watchPatterns are removed — deploy.sh just works now. Its SKIPPED
      check remains as a tripwire.
- [x] **~~Upgrade Railway to Pro + enable daily Postgres backups~~ DONE
      2026-08-02**: Pro active, daily schedule on the prod postgis volume
      (04:58 UTC, 6-day retention), first backup taken immediately, and the
      volume-restore path REHEARSED and RED-proven on staging (restore mints
      a new volume; complete with a volume swap — full runbook in
      plans/production-hardening.md §8).
- [ ] **Google usage ledger review** — after the first month of real traffic, read the internal
      call ledger + Cloud billing export; hunt inefficiencies.
- [ ] **Cloudinary environment split (paid)** — the account is on the FREE plan
      (one product environment), so staging and prod share credentials with only
      prefix separation, and the account-level API secret is shared. At launch:
      upgrade to a plan with multiple product environments (Cloudinary
      dashboard → Settings → Product environments → New environment, name it
      `crave-staging`), copy its cloud name/key/secret into the Railway staging
      api+worker vars (`CLOUDINARY_*`), and rotate the prod secret afterward.
      (Deferred 2026-08-02: owner chose not to start paid plans yet.)
- [ ] **Stripe live-mode activation (needs business details)** — prod still runs
      test keys. Dashboard → Activate account (business info, bank account),
      then swap `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` on prod api to the
      live values and re-point the webhook endpoint in live mode. Pairs with the
      Stripe web-checkout rail rebuild above.
- [ ] **Clerk dedicated staging application (optional)** — staging currently
      uses the dev instance of the prod Clerk app (pk_test/sk_test), which is
      Clerk's intended staging story and fine pre-launch. If real staging users
      ever matter: Clerk dashboard → top-left app switcher → Create application
      → name `crave-staging` → copy its dev keys into Railway staging vars.

## Explicitly NOT parked here (answered with current data, 2026-07-05+)

- always-vs-expansion dense flag → SETTLED: client always sends explicit `includeSimilar`
  (toggle); env mode is dead weight for real traffic.
- Homograph venue-name rescue → check on current corpus during slice validation.
- On-demand batch flush cadence → small design decision, built pre-launch.
- Pack-size quality sweep → run on real slices interactively (costs cents).
