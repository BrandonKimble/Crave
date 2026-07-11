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

## (b) Tunables that mirror code defaults — recommend folding into code

These are read in code with sane defaults; the `.env` lines mostly restate the
default. They are NOT deleted here because each removal must be checked
against its code default one-by-one (some .env values differ from the code
fallback, so deleting the line changes behavior). Recommended follow-up: for
each, either delete the `.env` line (default already equals it) or promote the
`.env` value into the code default, then delete the line. Groups:

- **AUTOCOMPLETE\_\*** (11 vars) — ranking weights; read via
  `autocomplete.service.ts` dynamic `process.env[key]`. Weights were tuned once
  during the autocomplete red-team; they don't vary by environment. → code
  constants in autocomplete.service.ts.
- **SEARCH\_\* knob block** (page sizes, on-demand caps/cooldowns, expansion
  caps/budget, diagnostics flags) — diagnostics flags
  (SEARCH_VERBOSE_DIAGNOSTICS, SEARCH_LOG_ENABLED,
  SEARCH_INCLUDE_PHASE_TIMINGS, SEARCH_ALWAYS_INCLUDE_SQL_PREVIEW) are dev-only
  observability and CAN stay env; the numeric caps belong in code.
- **DATABASE\_\* pool/retry knobs** (13 vars) — never changed; pool sizing is the
  only genuinely env-different one (dev 10 vs prod sizing). Keep POOL_MAX/MIN
  env, fold the rest.
- **GOOGLE*PLACES*\* rate/retry knobs** (12 vars) — quota-shaped constants;
  verify against the actual Google quota tier before folding
  (200 rps / 12k rpm / 150k rpd currently asserted — confirm these match the
  billing account's quota, they look like copied defaults, not measured).
- **LLM\_ tuning block** (temperature/top*p/top_k/thinking levels/max tokens/
  RPM/TPM/headroom/jitter) — model-behavior constants tuned once per model
  switch; RPM/TPM are quota-shaped (verify vs the Gemini tier). The
  LLM_DEBUG_THOUGHTS*\* subblock is dev-only debug and fine in dev .env, should
  never exist in prod env.
- **Cache TTL/size knobs** (LLM*QUERY_RESULT_CACHE*_,
  ENTITY*RESOLUTION_CACHE*_ TTLs/entries/versions) — never changed; the
  \_VERSION vars are cache-busting levers worth keeping env, TTLs → code.
- **Misc**: RESTAURANT*VIEW_COOLDOWN_MS, PHOTO_REPORT_HIDE_THRESHOLD,
  POLL*\_ live subset, KEYWORD\_\_ live subset, CONCURRENCY,
  UNIFIED*PROCESSING_BATCH_SIZE, ENTITY_RESOLUTION_BATCH_SIZE,
  RESTAURANT_ENRICHMENT*\* → code constants.

## Healthy pattern already in place

~129 env keys are read in code but absent from `.env` — i.e. defaults live in
code and env is override-only. That IS the ideal shape; the follow-up work in
(b) is converging the remaining .env-restated tunables to the same pattern.

## (d) flags (not changed, verify)

- GOOGLE_PLACES_REQUESTS_PER_SECOND=200 (+ per-minute/day) — confirm against
  the real billing-account quota; a too-high limiter is a silent 429 source.
- LLM_MAX_RPM=1000 / LLM_MAX_TPM=1000000 — confirm against the Gemini paid-tier
  quota for gemini-3.5-flash; batch pipeline mostly sidesteps this now.
- SENTRY_TRACES_SAMPLE_RATE=1.0 / PROFILES=1.0 — correct for dev; prod env must
  set lower (cost).
- LLM_TIMEOUT/LLM_QUERY_TIMEOUT/HEADERS/BODY/CONNECT=0 (= no timeout) —
  deliberate for long batch calls, but prod interactive query path with zero
  timeout is a hang risk; consider a nonzero LLM_QUERY_TIMEOUT in prod.
