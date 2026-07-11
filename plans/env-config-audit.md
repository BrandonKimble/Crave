# API env config audit — 2026-07-11

Mandate: a knob earns `.env` residence only if it is a secret or legitimately
differs across environments; everything else belongs in code as a constant with
a comment; dead knobs get deleted.

Method: every `KEY=` line in `apps/api/.env` diffed against every
`process.env.*` read AND every ConfigService/string-key read across
`apps/api/src`, `apps/api/scripts`, `apps/api/test`, `apps/api/job-control.ts`,
`apps/api/prisma`. A var with zero reads anywhere = DEAD.

Classifications: **(a)** secret/env-specific — stays; **(b)** tunable that
never changes — should live as a code constant; **(c)** DEAD — deleted;
**(d)** dangerous default/override — flagged.

## Applied in this pass

1. **54 dead lines deleted from `.env`** (list below). `.env` is gitignored,
   so this is local-only by nature; `.env.example` should get the same sweep
   when next touched.
2. **Stale telemetry reads deleted from code**:
   `src/modules/content-processing/reddit-collector/extraction-pipeline.service.ts`
   `buildChunkingConfigSnapshot()` still read `LLM_MAX_CHUNK_COMMENTS` /
   `LLM_MAX_CHUNK_CHARS` — knobs the chunker retired in the 2026-07-11 packing
   audit (`llm-chunking.service.ts` now derives chars from the token target).
   The snapshot was reporting knobs that no longer govern anything. Removed;
   only `targetChunkTokens` remains.
3. **(d) fix: `LLM_CHUNK_TARGET_TOKENS=30000` removed from `.env`.** The
   packing audit set the code default to 35000
   (`llm-chunking.service.ts:8 DEFAULT_MAX_CHUNK_TOKEN_ESTIMATE`); the stale
   30000 override was silently undercutting it. Behavior change: next boot
   packs to 35k. Knob itself stays supported in code (legit batch-cost lever).

## (c) DEAD — deleted from .env (no read anywhere)

| Group                          | Vars deleted                                                                                                                                                                                 | Note                                                                                                                                                                                       |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ENTITY*PRIORITY*\*             | all 12 (DEMAND*\*\_WEIGHT, APP_WEIGHT*×4, _\_CAP ×4, _\_RECENCY_DECAY_DAYS ×2)                                                                                                               | old entity-priority scoring; superseded by demand-scoring pipeline                                                                                                                         |
| QUALITY*SCORE*\*               | all 18                                                                                                                                                                                       | old quality-score knob set; crave-score redesign shipped, no reads remain                                                                                                                  |
| POLL\_\* dead subset           | POLL_AGGREGATION_ENABLED, POLL_CITY_MIN_IMPRESSIONS, POLL_DEFAULT_COOLDOWN_DAYS, POLL_MAX_OPTIONS_PER_POLL, POLL_NOTIFICATIONS_ENABLED, POLL_TREND_COOLDOWN_DAYS, POLL_TREND_MIN_IMPRESSIONS | remaining POLL\_ vars ARE read (poll-scheduler.service.ts, poll-timing.ts)                                                                                                                 |
| SEARCH_INTEREST instant subset | SEARCH_INTEREST_INSTANT_COOLDOWN_MS, \_MAX_INSTANT_ACTIVE, \_MAX_INSTANT_WAITING                                                                                                             | instant-enrichment path gone; MAX_PER_BATCH + MAX_PROCESSING_BACKLOG still read                                                                                                            |
| KEYWORD*CITY*\*                | KEYWORD_CITY_DEMAND_WINDOW_DAYS, KEYWORD_CITY_MIN_IMPRESSIONS                                                                                                                                | keyword cadence moved to collection_schedules rows (2026-07-08)                                                                                                                            |
| TEST\_\* dead subset           | TEST_ARCHIVE_SUBREDDIT, TEST_BULL_PREFIX, TEST_CHRONO_SUBREDDIT, TEST_COLLECTION, TEST_COLLECTION_JOBS_ENABLED, TEST_DRY_RUN, TEST_EXECUTION_MODE, TEST_LLM_RATE_LIMIT_PREFIX, TEST_RESET_DB | old harness knobs; live ones kept (TEST*REDDIT_FETCH_LIMIT, TEST_LLM_POST_SAMPLE*\*, TEST_CHRONO/ARCHIVE_BATCH_SIZE, TEST_ARCHIVE_MAX_POSTS, TEST_INJECT_FIRST_POST_ID, TEST_DATABASE_URL) |
| misc                           | RANK_SCORE_REFRESH_WINDOW_MINUTES, SEARCH_MAX_CONNECTIONS_PER_RESTAURANT                                                                                                                     | no reads                                                                                                                                                                                   |
| stale override                 | LLM_CHUNK_TARGET_TOKENS=30000                                                                                                                                                                | see (d) above — knob live in code, stale VALUE deleted                                                                                                                                     |

## (a) SECRET / env-specific — stays in .env

DATABASE*URL, TEST_DATABASE_URL, REDIS_HOST/PORT, SENTRY*\_ (DSN + sample rates
— rates are env-split dev=1.0/prod-lower), CLERK\__ (keys, audience, admin ids),
JWT*SECRET/EXPIRATION, STRIPE*_ (keys + URLs), REVENUECAT\__,
BILLING*DEFAULT_ENTITLEMENT/TRIAL_DAYS, LLM_API_KEY, GOOGLE_PLACES_API_KEY,
REDDIT_CLIENT_ID/SECRET/USERNAME/PASSWORD/USER_AGENT, TOMTOM_API_KEY,
CLOUDINARY*_ (creds + ENV*PREFIX + NOTIFICATION_URL — the tunnel URL is
per-session by design), PUSHSHIFT_BASE_DIR/LOCAL*\_ (machine-local paths),
PORT, NODE_ENV, APP_ENV, LOG_CONSOLE/FILES/LEVEL,
\*\_CACHE_REDIS_KEY_DEV/\_PROD (namespacing picked by APP_ENV).

**THROTTLER\_\*** — env-specific ON PURPOSE (dev-relaxed vs prod-grade); the
warning comment in .env is the contract. Stays.

**Legit env-axis toggles (stay):** COLLECTION_SCHEDULER_ENABLED,
ENTITLEMENT_GATING (log|enforce — the business-model access axis),
SEARCH_DENSE_SIBLINGS_MODE (always|expansion — product call still open on real
data), DISH_KNOWLEDGE_SYNTHESIS_ENABLED, KEYWORD_COLLECTION_DRY_RUN,
UNIFIED_PROCESSING_DRY_RUN, COLLECTION_LLM_MODE (read in code, set per env).

## (b) Tunables — **FOLD-IN EXECUTED 2026-07-11** (95 .env lines deleted)

Doctrine applied: never-changed tunables became code constants with rationale
comments; process.env reads removed except where a genuine env axis exists
(quota-shaped caps). Drift reconciliations (where .env ≠ code fallback) are
called out per row. All groups DONE:

- **AUTOCOMPLETE\_\*** (11 vars) — DONE → literals in
  `autocomplete.service.ts:120-131` constructor block (+
  `search-query-suggestion.service.ts` minGlobalDistinctUsers=3). All 11 .env
  values equaled the code defaults; no drift. Env reads removed. The
  cache/lane AUTOCOMPLETE\_\* keys (env-absent, override-only) untouched.
- **SEARCH\_\* knob block** — DONE. Page sizes/result limit →
  `search.service.ts` DEFAULT_PAGE_SIZE 25 / MAX_PAGE_SIZE 100 /
  DEFAULT_RESULT_LIMIT 100 (env values restated them; resolve\* helpers now
  return the constants). On-demand: cooldown 300s + maxEntities 5 →
  `on-demand-request.service.ts`. **DRIFT: SEARCH_ON_DEMAND_MIN_RESULTS** —
  .env 1 vs code fallbacks 25/defaultPageSize (three consumers disagreed);
  reconciled to **1** (the value production behavior used = trigger on zero
  results) in NEW shared `src/modules/search/on-demand-tuning.constants.ts`
  (ON_DEMAND_MIN_RESULTS), imported by search.service,
  keyword-search-scheduler, keyword-slice-selection. Diagnostics flags
  (VERBOSE_DIAGNOSTICS/LOG_ENABLED/INCLUDE_PHASE_TIMINGS/
  ALWAYS_INCLUDE_SQL_PREVIEW) stay env (dev observability).
- **DATABASE\_\*** (13 vars) — DONE → constants in `configuration.ts` database
  block; POOL_MAX/MIN stay env (only genuinely env-different knob).
  **DRIFT: DATABASE_HANDLE_DISCONNECTS** — .env true vs code fallback false;
  reconciled to **true**. DATABASE_LOGGING folded to NODE_ENV===development.
- **GOOGLE_PLACES\_\*** (12 vars) — DONE → `configuration.ts` googlePlaces
  block. **Verify verdict:** we call Places API (New)
  (places.googleapis.com/v1); Google publishes NO default quotas anymore
  (per-method QPM, per-project, console-only). The 200 rps / 12,000 rpm were
  copied numbers, not measured quota → replaced with a conservative floor of
  **10 rps / 600 rpm** per method (+ per-day kept as cost guards). rps/rpm/rpd
  keep env override (per-project quota is a real env axis); raise only from
  console.cloud.google.com/google/maps-apis/quotas. Timeout/radius/retry →
  constants.
- **LLM\_ tuning block** — DONE → `configuration.ts` llm block constants:
  temperature 0.1 / topP 0.5 / topK 30 / candidateCount 1 / thinking
  LOW+MINIMAL / maxTokens 0 (=model default 65,536) / system-cache 10800+600.
  Rate limiter (`centralized-rate-limiter.service.ts`): **verify verdict** —
  old 1000 RPM / 1M TPM were Tier-1-era; Gemini no longer publishes tier
  tables (AI Studio shows live limits); published Flash Tier 2 = 2,000 RPM /
  4M TPM and Tier 3 ≥ that → defaults now **2,000 RPM / 4M TPM** (env
  override kept — set from AI Studio, never guessed). Headroom 0.95 →
  constant. **DRIFT: LLM_MAX_REQUEST_TOKENS** .env 65000 vs fallback 60000 →
  reconciled to **65000** (`smart-llm-processor.service.ts`). Consecutive-429
  breakers (LLM+Reddit) → constant 3 (dev-only; prod null). Jitter 40/250 →
  constants. **DRIFT: CONCURRENCY** .env 20 vs fallback 16 → constant **20**
  (`llm-concurrent-processing.service.ts`). LLM_DEBUG_THOUGHTS\_\* stay in dev
  .env (dev-only debug). LLM_MODEL/QUERY_MODEL/BASE_URL stay env.
- **Timeouts (verify item)** — DONE. .env had LLM_TIMEOUT/QUERY_TIMEOUT/
  HEADERS/BODY/CONNECT all **0 = no timeout** (prod hang risk). Honest values
  folded into `configuration.ts` llm block: queryTimeout **30s** (interactive
  natural-search), timeout **600s** (interactive extraction hang guard),
  undici dispatcher headers/body **600s** (non-streaming generation delivers
  headers only after full generation), connect **10s**. The `|| 0` fallbacks
  in `llm.service.ts` onModuleInit (which silently disabled everything) →
  `?? honest-default`.
- **Sentry sampling (verify item)** — DONE. main.ts already defaulted
  dev 1.0 / prod 0.1; `configuration.ts` sentry block now matches
  (APP_ENV-aware 1.0/0.1). Stale SENTRY_TRACES/PROFILES_SAMPLE_RATE=1.0 lines
  deleted from .env (they'd have overridden prod to 1.0 if copied). Env
  override kept as ops lever.
- **Cache TTL/size knobs** — DONE → constants (LLM query-result cache
  900/120/200, entity-resolution 900/60/120/2000) in `configuration.ts`.
  NOTE these were .env-load-bearing (code fallbacks were 0 = cache DISABLED);
  values promoted, not deleted. \_VERSION + \_REDIS_KEY\_\* stay env
  (cache-busting + namespacing).
- **Misc** — DONE: RESTAURANT_VIEW_COOLDOWN_MS 120s (`history.service.ts`),
  PHOTO_REPORT_HIDE_THRESHOLD 3 (`configuration.ts` cloudinary), POLL\_\*
  live subset → `poll-scheduler.service.ts` constants + `poll-timing.ts` 4
  (**DRIFT: POLL_RELEASE_DAY_OF_WEEK** .env 1/Monday vs code 0/Sunday —
  reconciled to **0 Sunday** per polls spec §B.5, the one case where the code
  value beat .env), KEYWORD gate knobs → `configuration.ts` keywordProcessing
  constants, KEYWORD_SEARCH_SORTS → orchestrator constant,
  **DRIFT: KEYWORD_SEARCH_LIMIT** .env 1 vs fallback 1000 → reconciled to
  **1** (deliberate collection-cost lever; 1000 never governed),
  UNIFIED_PROCESSING_BATCH_SIZE **DRIFT** .env 300 vs 250 → **300**,
  ENTITY_RESOLUTION_BATCH_SIZE 100, RESTAURANT_ENRICHMENT_CONCURRENCY 5,
  **DRIFT: RESTAURANT_ENRICHMENT_MIN_SCORE_THRESHOLD** .env 0.15 vs fallback
  0.2 → **0.15**, SEARCH_INTEREST\_\* → onDemand constants 5/120/10.

Open (out of scope, flagged): `.env` still sets LLM_MODEL=gemini-3-flash-preview
while the code fallback tracks gemini-3.5-flash (the A/B-chosen production
model) — decide deliberately which model dev should run and align.

## Healthy pattern already in place

~129 env keys are read in code but absent from `.env` — i.e. defaults live in
code and env is override-only. That IS the ideal shape; the follow-up work in
(b) is converging the remaining .env-restated tunables to the same pattern.

## (d) flags — ALL RESOLVED 2026-07-11 (details in the (b) section above)

- GOOGLE_PLACES rate caps: DONE — 200 rps was a copied number; conservative
  10 rps / 600 rpm per-method floor in code, env-overridable from measured
  console quota.
- LLM_MAX_RPM/TPM: DONE — defaults now 2,000 RPM / 4M TPM (published Flash
  Tier 2 floor; Tier 3 ≥ that; exact live limits only visible in AI Studio).
- Sentry sampling: DONE — APP_ENV-aware dev 1.0 / prod 0.1 in code; stale 1.0
  .env lines deleted.
- LLM timeouts: DONE — zero-timeout config eliminated; query 30s, extraction
  600s, undici headers/body 600s, connect 10s.
