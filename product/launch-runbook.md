# Launch Runbook — Austin on Railway

The ordered, followable path from "nothing deployed" to "live in Austin". Each phase has a
gate — don't start the next phase until the gate is green. Supersedes the checklist half of
[pre-launch.md](pre-launch.md) (which keeps the data-validation items; they're referenced at the
gates below).

**Topology (launch):** one Railway project — Postgres + Redis + ONE api service
(`PROCESS_ROLE=all`, the default: API + workers + crons in one process; the codebase already
supports splitting into api/worker services later via `PROCESS_ROLE`, don't split at launch).
Build is the existing multi-stage [Dockerfile](../apps/api/Dockerfile) via [railway.json](../railway.json)
(healthcheck `/health` already wired).

---

## Phase 0 — Accounts & keys (one-time, before any deploy)

Collect PRODUCTION credentials (dev keys stay local-only in `.env`, which is gitignored):

- [ ] Clerk: production instance → `CLERK_SECRET_KEY` (sk_live), `CLERK_PUBLISHABLE_KEY` (pk_live).
      Re-do the JWT email-template config on the prod instance (the dev dashboard had it
      misconfigured once — code self-heals, but set it right).
- [ ] Stripe: live keys → `STRIPE_SECRET_KEY`, webhook endpoint on the prod domain →
      `STRIPE_WEBHOOK_SECRET`; RevenueCat prod app + `REVENUECAT_WEBHOOK_SECRET` if IAP ships at launch.
- [ ] Google: `LLM_API_KEY` (Gemini) and `GOOGLE_PLACES_API_KEY` on a GCP project with billing;
      enable the Cloud **billing BigQuery export** (one-time) so spend is queryable alongside our
      internal `api_usage_ledger`.
- [ ] `TOMTOM_API_KEY` (market boundary provisioning), Reddit API creds (`REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD`).
- [ ] Sentry project → `SENTRY_DSN`.

**Gate:** every key above exists in a password manager, none of them are test keys.

## Phase 1 — Railway provisioning

- [ ] Railway project: add **Postgres** and **Redis** plugins + the api service from the repo.
- [ ] Postgres extensions: migrations `CREATE EXTENSION IF NOT EXISTS` everything needed
      (pg_trgm, btree_gin, postgis, vector, fuzzystrmatch, citext) — verify Railway's Postgres
      image ships postgis+pgvector (it does on the current image; if not, use the `pgvector/pgvector`
      or TimescaleDB-style custom image).
- [ ] Set core env: `NODE_ENV=production`, `APP_ENV=prod`, `DATABASE_URL=${{Postgres.DATABASE_URL}}`,
      `REDIS_HOST/PORT/PASSWORD` from the Redis plugin, `PORT` (Railway injects).
- [ ] Set all Phase-0 secrets.
- [ ] Set the three Stripe redirect URLs to the prod domain (they default to localhost):
      `STRIPE_SUCCESS_URL`, `STRIPE_CANCEL_URL`, `STRIPE_PORTAL_RETURN_URL`.
- [ ] Throttler prod limits are automatic via NODE_ENV; Sentry: `SENTRY_ENVIRONMENT=production`,
      `SENTRY_TRACES_SAMPLE_RATE=0.1`.
- [ ] **Flags: everything OFF for first boot** (they default off):
      `COLLECTION_SCHEDULER_ENABLED=false`, `KEYWORD_SEARCH_ENABLED=false`,
      `LLM_BATCH_POLL_ENABLED=false`, `ENTITY_SIBLING_EDGES_REBUILD_ENABLED=false`,
      `ENTITY_EMBEDDING_RECONCILE_ENABLED=false`, `LOCATION_LIFECYCLE_CRON_ENABLED=false`,
      `SEARCH_DEMAND_AGGREGATE_REFRESH_ENABLED=false`. `COLLECTION_LLM_MODE=batch`.
- [ ] Remove/guard `DebugModule` (`/api/debug/sentry-test`) before the prod deploy.
- [ ] Fill real contact/jurisdiction into the `/privacy` + `/terms` pages (app-store submissions
      link to these).

**Gate:** service deploys, `/health` green (checks DB+Redis), Sentry receives a test event.

## Phase 2 — Database provisioning (empty prod DB → ready)

Order matters:

1. `railway run yarn db:migrate:deploy` — all migrations (extensions, tables, HNSW indexes).
2. Onboard the market — ONE command (attribute vocabulary is fully self-provisioning now,
   no seeding needed):
   `yarn ts-node scripts/onboard-market.ts --subreddit austinfood --city "Austin, TX"
--short Austin --state TX --center 30.2672,-97.7431 --county 30.646,-97.6034
--county 29.8833,-97.9414 --county 30.1105,-97.3153 --county 29.8849,-97.6699
--county 30.7582,-98.2284`
   (county anchors = any point inside each metro county; TomTom fetches + PostGIS unions the
   polygons; the subreddit viewport + volume jobs chain automatically. `yarn db:seed` replays
   the same provisioning from the config lists if you prefer; both are idempotent.)
3. Verify: HNSW index exists (`idx_entities_name_embedding_hnsw` — boot self-heal also covers
   this), markets table has Austin with geometry (~13,726 km², 6 boundaries), collection
   community row maps austinfood → the market.

**Gate:** an empty search against the prod API returns 200 with zero results (not 500).

## Phase 3 — The Austin data load

Prereq: **batch INVALID_ARGUMENT fix landed and a batch slice is green** (the one open code
thread; see memory). Then, from a machine with the pushshift archives
(`PUSHSHIFT_LOCAL_ARCHIVE_PATH`) pointed at the PROD `DATABASE_URL`:

1. Flip on the load-path flags: `LLM_BATCH_POLL_ENABLED=true`,
   `ENTITY_EMBEDDING_RECONCILE_ENABLED=true`.
2. Smoke slice first: `yarn ts-node scripts/archive/batch-slice-test.ts` (5 posts, batch mode)
   → expect deferral → ingested → +entities.
3. Full load: `yarn ts-node scripts/archive-collect.ts --subreddit austinfood --batch-size 250`
   (pre-filter tooling TBD gets applied here when built). ~23k posts / ~583k comments ≈ $25–50
   LLM at batch rates; enrichment Google spend tracked live in `api_usage_ledger`.
4. Monitor: `llm_batch_jobs` statuses; `SELECT service, operation, sku_tier, sum(request_count)
FROM api_usage_ledger GROUP BY 1,2,3;` for spend.
5. Post-load passes: sibling edges rebuild (`scripts/rebuild-sibling-edges.ts` or flip
   `ENTITY_SIBLING_EDGES_REBUILD_ENABLED=true` for the 4AM cron), dedupe-merge
   (`scripts/food-dedupe-merge.ts`, dry-run first), janitor dry-run then live
   (`scripts/restaurant-janitor.ts`).
6. **Data validation gate — the [pre-launch.md](pre-launch.md) checks:** Thread-G full-corpus
   spot audit (hub fire, praise FP, faithfulness), sibling K/R sweep eyeball, dedupe counter
   read, typeahead latency re-measure.

**Gate:** real searches (pizza / ramen / tacos / brunch) return quality Austin results you'd ship.

## Phase 4 — Steady-state flags on

- [ ] `COLLECTION_SCHEDULER_ENABLED=true`, `KEYWORD_SEARCH_ENABLED=true`
      (+ `KEYWORD_SEARCH_INTERVAL_DAYS` at desired cadence) — ongoing collection, all batched.
- [ ] `SEARCH_DEMAND_AGGREGATE_REFRESH_ENABLED=true`, `LOCATION_LIFECYCLE_CRON_ENABLED=true`.
- [ ] Poll crons are always-on (scheduler/lifecycle/aggregation) — sanity-check the poll release
      schedule env (`POLL_RELEASE_DAY_OF_WEEK` etc.) fits launch timing.
- [ ] `SEARCH_DENSE_SIBLINGS_MODE` is irrelevant to real traffic (client always sends explicit
      `includeSimilar`) — leave default.

**Gate:** 48h of crons running with no Sentry errors; `api_usage_ledger` daily spend at expected level.

## Phase 5 — Mobile cutover + store submission

- [ ] `EXPO_PUBLIC_API_URL=https://<railway-domain>/api/v1` in the EAS build env (detection
      logic is already prod-safe; no code change).
- [ ] Clerk publishable key → prod value in the mobile env.
- [ ] EAS production build; TestFlight pass against prod API (search, toggle, polls, favorites,
      auth, purchase sandbox).
- [ ] Store listings: privacy/terms URLs, screenshots. Known non-blocker: Android map
      pins/taps broken (iOS-first launch).

**Gate:** TestFlight build against prod passes your own real-usage week.

## Deferred by choice (not launch blockers)

- PROCESS_ROLE api/worker split (scale-out shape, single service is right at launch size).
- Web client + CORS origin allowlist (CORS off is fine for native-only).
- Health checks for external APIs/queue liveness (Sentry covers operationally).
- Post-launch: monthly ledger + BigQuery billing review.
