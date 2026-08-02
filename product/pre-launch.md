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

### Red-team 2026-08-02 — confirmed, NOT yet fixed

Three adversarial passes (correctness, architecture, money+client). Everything
below was verified at the source; the fixed items are in git. These remain,
ranked. Each says why it is not broken _today_, because most are latent for a
reason that will stop being true.

- [ ] **Ledger dollars vs billed dollars: every ceiling is ~1.7x looser than
      it reads.** The reconciliation multiplier (from the BigQuery export) is
      applied when GROSSING an estimate for owner approval, and nowhere else.
      Campaign envelopes are minted in billed dollars and drained in ledger
      dollars, and the Tier-3 backstop derives 3x from ledger-priced trailing
      spend. At the known ~1.7x Gemini under-metering the real backstop is
      ~5.1x billed. Ideal: gross at the single pricing seam so estimate,
      meter, envelope and backstop are one currency by construction.
- [ ] **The paywall waves through callers who send no credentials.** The
      interceptor short-circuits on `if (!userId) return next.handle()`, and
      auth is per-route with `OptionalClerkAuthGuard` on several. So an
      anonymous caller gets content a lapsed subscriber is 403'd from.
      Publicness is inferred from ABSENCE rather than declared, even though
      `@AllowUnentitled` already exists and is carefully applied. Latent only
      because `ENTITLEMENT_GATING` is off. Ideal: invert — non-exempt route
      requires an entitled AUTHENTICATED user. Run `log` mode in prod before
      `enforce`; the exempt set has never been exercised against real traffic.
- [ ] **`hasAccess` fails open on any error** while every spend gate fails
      closed. Defensible (an outage should not lock out payers) but it is the
      opposite default from money and it is unbounded — a schema drift opens
      the paywall permanently with only a log line. Owner decision, left as-is
      deliberately: flipping it can lock out paying customers.
- [ ] **The janitor's retry/archive policy reads a field that means something
      else.** It gates on `lastEnrichmentAttempt->>'count' >= 3`, but the only
      writer sets `count = ranked.length` — the number of Google CANDIDATES,
      not attempts. So a restaurant is archived because Google returned the
      most evidence, and every `error`-status placeholder (which writes no
      count) is re-enriched every week forever at real Places spend. Latent
      only because `LOCATION_LIFECYCLE_CRON_ENABLED=false`. **Do not enable
      that cron until this is fixed.** Ideal: a typed attempt counter column.
- [ ] **RPM/TPM admission covers one of ~13 LLM call paths.** The reservation
      engine lives in SmartLLMProcessor, reachable only from chunked content
      extraction; search interpretation, the relevance gate and photo-vision
      call Gemini with no rate admission. The `gemini.tokens` drift instrument
      therefore measures one path of a multi-path system. Ideal: move the
      reservation next to `assertSpendBudgetOpen` inside `callLLMApi`.
- [ ] **Redis down removes LLM rate limiting entirely.** The reservation
      falls back to a ~1.5s sleep and returns `guaranteed: false`, which the
      caller only ever copies into a log payload. N workers then fire with no
      ceiling. The Places coordinator already has an in-process emergency
      counter for exactly this; the LLM path never got one.
- [ ] **`textSearch` cannot be rate-limited through config.** One Places
      operation carries three names (rate scope `findPlaceFromText`, ledger
      `textSearch`, and no config key at all), so adding a `textSearch` limit
      silently does nothing and falls back to 600/min — on the most expensive
      Places call. Ideal: one exported operation union used as all three keys.
- [ ] **The §4 demand-mass law has two incompatible SQL implementations** —
      one excludes echo kinds and groups by kind, the other does neither. Same
      entity, same day, different scores; the collector uses the looser one to
      decide what gets enriched.
- [ ] **Ranking: the SQL authority is re-implemented differently in TS** for
      the strict+relaxed page-1 merge (drops `rising`, uses a coarser score),
      and per-run `rank` survives that merge without recomputation — the map
      read model assumes equal rank means same restaurant. Ideal: rank is
      assigned once, at the response boundary.
- [ ] **Autocomplete fires per keystroke** (`AUTOCOMPLETE_DEBOUNCE_MS = 0`)
      and the server's recall fan-out includes an embedding arm. Now that
      embeddings are gated this is bounded, but the debounce is an owner
      choice that deserves re-pricing, not a number I should invent.
- [ ] **RevenueCat TRANSFER can revoke both sides**: it revokes the loser,
      then silently `continue`s if the gaining side has no fetchable state
      (a lifetime/promotional entitlement has `expires_date: null` and is
      skipped), logging the event as processed.
- [ ] **A 1,461-line repository framework serves two repositories**, one with
      zero consumers, while 95 services use Prisma directly — including the
      one that injects a repository and then reaches past it. Either commit to
      the boundary or delete it; the 599-line base-class spec is currently an
      always-green measurement of code the system barely uses.

- [ ] **Decide the timestamp story: 162 naive columns vs 31 aware.** This
      database stores instants in `timestamp WITHOUT time zone` 162 times and
      `timestamp WITH time zone` 31 times. Prisma binds a JS Date as
      `timestamptz`, so any HAND-WRITTEN SQL comparing the two makes Postgres
      coerce the naive column using the session's TimeZone — the query means
      something different depending on where the server thinks it is. Prisma's
      own query builder knows each column's type and is unaffected; only raw
      SQL is exposed. Found 2026-08-02 when the polls feed turned out to be
      unable to load a second page on a dev box running America/Chicago (a
      real cursor matched 3,175 rows where the correct comparison matched
      16,528). Three sites are fixed with an explicit `AT TIME ZONE 'UTC'`;
      six more are listed in `apps/api/src/shared/sql-timestamp-frame.guard.spec.ts`
      and are LATENT ONLY BECAUSE prod and staging both run UTC. The guard
      test stops new ones appearing. The durable fix is migrating the columns
      to `timestamptz`, which is an owner-scale schema decision.

- [ ] **DEPLOY THE RATE-LIMIT FIX — production is exploitable right now.**
      Commit `e7d20549` closes a throttler bypass: appending `?x=/webhooks/`
      to any URL disabled rate limiting entirely. MEASURED against live prod
      on 2026-08-01: 40 parallel unauthenticated POSTs to
      `/api/v1/auth/apple/native` gave 12x400 + 28x429 plain, and 40x400 with
      ZERO 429 with the query param. Every ceiling in the app — auth
      brute-force, LLM search spend, the heavy viewport reads — is currently
      one query param away from not existing. The fix is on `main` and cannot
      reach prod until the watchPatterns/repo-disconnect item below is done,
      so that item is now security-blocking, not cleanup.

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
