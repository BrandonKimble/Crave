import {
  isEnvFlagEnabled,
  isEnvFlagExplicitlyDisabled,
} from '../shared/config/env-flag';
import { placesOperationLimits } from '../modules/external-integrations/shared/vendor-pricing';
// ONE resolveAppEnv, imported (audit 2026-08-02, F403). This file used to
// carry a byte-equivalent COPY of it — including the same six-line comment
// about staging naming itself — while already importing two of its siblings
// from here. app-env.ts's own header says it exists because five services
// hand-rolled exactly this; the config assembly was the sixth.
import {
  isProdEnv,
  resolveAppEnv,
  type AppEnv,
} from '../shared/config/app-env';
/**
 * Determines optimal database connection pool size based on environment
 * and application requirements from PRD sections 6.6.1 and 6.1.2
 */
function getDatabasePoolSize(): string {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'development':
      return '10'; // Smaller pool for development with detailed logging
    case 'staging':
      return '25'; // Mid-size pool for staging
    case 'test':
      return '5'; // Smaller pool for testing to avoid connection conflicts
    case 'production':
      return '50'; // MVP production pool size (can scale to 100+)
    default:
      return '10'; // Conservative default
  }
}

/**
 * Gets the appropriate database URL based on environment
 * Uses TEST_DATABASE_URL for test environment to ensure isolation
 */
function getDatabaseUrl(): string {
  const env = process.env.NODE_ENV || 'development';

  if (env === 'test') {
    return (
      process.env.TEST_DATABASE_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/crave_search_test'
    );
  }

  return (
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/crave_search'
  );
}

function resolveScopedEnv(
  appEnv: AppEnv,
  values: {
    dev?: string;
    prod?: string;
    fallback?: string;
  },
): string | undefined {
  const selected = isProdEnv(appEnv) ? values.prod : values.dev;
  return selected || values.fallback || undefined;
}

// Secrets read their canonical env name ONLY. The legacy `<NAME>_PROD` /
// `<NAME>_DEV` resolution shim was deleted 2026-07-11 (value census): .env
// sets only the canonical names, and a silent legacy-name hit is exactly a
// fallback masking misconfiguration.
function resolveSecretEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : undefined;
}

/**
 * A SETTING WITH A MALFORMED VALUE REFUSES; IT NEVER WIDENS OR CLOSES QUIETLY
 * (F365).
 *
 * The lifecycle janitor read three settings straight off `process.env` and
 * coerced two of them with a bare `Number(...)`. A typo'd TTL therefore
 * yielded NaN, and NaN is NOT nullish — so `olderThanDays ?? 90` did not
 * catch it, `Date.now() - NaN * 86400000` produced an Invalid Date, and the
 * `lastPolledAt < cutoff` filter then matched NOTHING: the DETECT half of the
 * decay lifecycle switched itself off permanently with no error anywhere.
 *
 * This is the same conclusion F106 reached for the audience parser and F107 /
 * F108 for the gating mode: one declaration, in config, validated at boot.
 */
function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `${name} must be a positive integer (got ${JSON.stringify(raw)}). ` +
        `A malformed lifecycle setting silently disables the janitor rather ` +
        `than failing, so boot refuses instead.`,
    );
  }
  return value;
}

export default () => {
  const appEnv = resolveAppEnv();

  return {
    appEnv,
    port: parseInt(process.env.PORT || '3000', 10),
    locationLifecycle: {
      /**
       * The weekly detect→act pass. OFF by default: a dev corpus has nothing
       * worth keeping fresh, and this cron SPENDS Places money.
       */
      cronEnabled: isEnvFlagEnabled(
        process.env.LOCATION_LIFECYCLE_CRON_ENABLED,
      ),
      /** DETECT: re-poll a location this many days after its last poll. */
      refreshTtlDays: positiveIntEnv('LOCATION_REFRESH_TTL_DAYS', 90),
      /** DETECT: how many stale locations one weekly pass re-polls. */
      refreshLimit: positiveIntEnv('LOCATION_REFRESH_LIMIT', 250),
      /**
       * ACT: failed enrichment attempts before an ungrounded placeholder is
       * archived. This and retryLimit decide who gets ARCHIVED and how much
       * Places money the retry lane spends — they were the two knobs that
       * were NOT configurable while the two that matter less were (F365).
       */
      noMatchAttemptThreshold: positiveIntEnv(
        'LOCATION_NO_MATCH_ATTEMPT_THRESHOLD',
        3,
      ),
      /** ACT: ungrounded placeholders re-enriched per weekly pass. */
      retryLimit: positiveIntEnv('LOCATION_RETRY_LIMIT', 25),
    },
    // NO `logging:` BLOCK. LOG_LEVEL is read straight off process.env by
    // shared/logging/winston.config.ts, which is the only thing that has ever
    // consumed it; the mirror here had zero readers (audit 2026-08-02, F405).
    // One declaration per fact — the env var is live, this copy was not.
    database: {
      url: getDatabaseUrl(),
      connectionPool: {
        // Pool sizing is the only genuinely env-different DB knob (dev 10 vs
        // prod 50) — stays env-overridable. Everything else below is a
        // never-changed constant (2026-07-11 config fold-in).
        max: parseInt(
          process.env.DATABASE_CONNECTION_POOL_MAX || getDatabasePoolSize(),
          10,
        ),
        min: parseInt(process.env.DATABASE_CONNECTION_POOL_MIN || '2', 10),
        acquire: 60_000, // ms to wait for a pool connection before erroring
        idle: 10_000, // ms an idle connection lingers before release
        evict: 10_000, // eviction sweep interval (ms)
        handleDisconnects: true, // always reconnect on dropped connections
      },
      query: {
        timeout: 30_000, // per-query ceiling (ms); slow analytical work uses its own paths
        retry: {
          attempts: 3,
          delay: 1_000, // base backoff (ms)
          factor: 2.0, // exponential backoff multiplier
        },
      },
      performance: {
        preparedStatements: true,
        logging: {
          // Query logging is a dev observability aid, not an env knob.
          enabled: process.env.NODE_ENV === 'development',
          slowQueryThreshold: 1_000, // ms — log queries slower than this
        },
      },
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0', 10),
    },
    bull: {
      prefix: process.env.BULL_PREFIX || `crave:${appEnv}`,
    },
    // THE THREE GLOBAL RATE-LIMIT WINDOWS. Read by
    // infrastructure/throttler/throttler.module.ts's `readThrottlerWindow`,
    // which builds the key path as a TEMPLATE LITERAL
    // (`throttler.${window}.${field}`) and THROWS at boot if a value is
    // missing or malformed. A literal grep for `get('throttler.` finds
    // nothing — this block is live all the same (audit 2026-08-02, F405).
    throttler: {
      // Short window: burst protection (1 second)
      short: {
        ttl: parseInt(process.env.THROTTLER_SHORT_TTL || '1000', 10),
        limit: parseInt(process.env.THROTTLER_SHORT_LIMIT || '5', 10),
      },
      // Medium window: 10 seconds
      medium: {
        ttl: parseInt(process.env.THROTTLER_MEDIUM_TTL || '10000', 10),
        limit: parseInt(process.env.THROTTLER_MEDIUM_LIMIT || '30', 10),
      },
      // Long window: 1 minute
      long: {
        ttl: parseInt(process.env.THROTTLER_LONG_TTL || '60000', 10),
        limit: parseInt(process.env.THROTTLER_LONG_LIMIT || '100', 10),
      },
    },
    clerk: {
      secretKey: process.env.CLERK_SECRET_KEY,
      jwtAudience: process.env.CLERK_JWT_AUDIENCE,
      apiUrl: process.env.CLERK_API_URL || 'https://api.clerk.com/v1',
      adminUserIds: (process.env.CLERK_ADMIN_USER_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      // THE WEB CHECKOUT RAIL (restored 2026-08-03, owner-ruled — see
      // business/business-model.md "Margin lever"). No defaults on ANY of
      // these: a guessed price id sells the wrong thing, and a guessed
      // redirect URL sends a paying customer somewhere that isn't ours.
      // Unconfigured is unconfigured — the endpoints refuse (503) instead.
      //
      // TWO price ids, because the paywall shows two offers of the ONE
      // product (owner ruling 2026-08-03): $7.99/mo and $39.99/yr, the
      // annual one carrying the ~1-week free trial. Premium is still the
      // only PRODUCT, forever (D1-residual) — this is a closed vocabulary of
      // two prices OF it, not a second thing sold. The caller names a plan
      // word ('monthly' | 'annual'); only these two env vars can turn that
      // word into a Stripe price, so a price outside the pair is
      // unrepresentable rather than merely refused.
      prices: {
        monthly: process.env.STRIPE_MONTHLY_PRICE_ID,
        annual: process.env.STRIPE_ANNUAL_PRICE_ID,
      },
      checkoutSuccessUrl: process.env.STRIPE_CHECKOUT_SUCCESS_URL,
      checkoutCancelUrl: process.env.STRIPE_CHECKOUT_CANCEL_URL,
      portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL,
    },
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      // Notifications are signed with the account PRIMARY (root) key's
      // secret — NOT the key that made the upload (E2E-proven 2026-07-10).
      webhookSecret:
        process.env.CLOUDINARY_WEBHOOK_SECRET ||
        process.env.CLOUDINARY_API_SECRET,
      // Folder/public_id prefix per environment (isolates dev assets).
      envPrefix: process.env.CLOUDINARY_ENV_PREFIX || 'dev',
      // Public URL Cloudinary POSTs upload/moderation notifications to
      // (dev = tunnel; prod = Railway URL). Signed into every ticket.
      notificationUrl: process.env.CLOUDINARY_NOTIFICATION_URL,
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET || 'crave_ugc_photo',
      // Distinct-user reports that auto-hide a UGC photo pending review.
      reportHideThreshold: 3,
    },
    revenueCat: {
      apiKey: process.env.REVENUECAT_API_KEY,
      webhookSecret: process.env.REVENUECAT_WEBHOOK_SECRET,
      // NO DEFAULT. 'premium:premium_monthly' used to sit here — a guessed
      // pair nobody chose, which made an unmapped RC id silently mint a grant
      // under vendor vocabulary. Unconfigured is unconfigured: nothing
      // translates, every RC event fails loudly, RevenueCat redelivers.
      // See billing/revenuecat-entitlement-map.ts (F101/D1).
      entitlementMap: process.env.REVENUECAT_ENTITLEMENT_MAP,
    },
    billing: {
      defaultEntitlement: process.env.BILLING_DEFAULT_ENTITLEMENT || 'premium',
      trialDays: parseInt(process.env.BILLING_TRIAL_DAYS || '0', 10),
    },
    reddit: {
      clientId: resolveSecretEnv('REDDIT_CLIENT_ID'),
      clientSecret: resolveSecretEnv('REDDIT_CLIENT_SECRET'),
      username: resolveSecretEnv('REDDIT_USERNAME'),
      password: resolveSecretEnv('REDDIT_PASSWORD'),
      // Reddit API rules require 'platform:app-id:version (by /u/username)'
      // — a generic UA is exactly what their anti-abuse layer punishes. The
      // app-id is a deliberately NEUTRAL codename (owner directive
      // 2026-07-24): distinctive + stable is what Reddit wants; it need not
      // and must not carry the product brand.
      userAgent:
        process.env.REDDIT_USER_AGENT ||
        `web:threadsift:v1.0.0 (by /u/${process.env.REDDIT_USERNAME || 'threadsift'})`,
      timeout: parseInt(process.env.REDDIT_TIMEOUT || '10000', 10),
      requestsPerMinute: parseInt(
        process.env.REDDIT_REQUESTS_PER_MINUTE || '100',
        10,
      ),
      retryOptions: {
        maxRetries: parseInt(process.env.REDDIT_MAX_RETRIES || '3', 10),
        retryDelay: parseInt(process.env.REDDIT_RETRY_DELAY || '1000', 10),
        retryBackoffFactor: parseFloat(
          process.env.REDDIT_RETRY_BACKOFF_FACTOR || '2.0',
        ),
      },
    },
    llm: {
      apiKey: resolveSecretEnv('LLM_API_KEY'),
      // Fallbacks track the CURRENT production model (.env normally sets these);
      // a stale fallback silently downgraded two generations when env was absent.
      // gemini-3-flash-preview CHOSEN by the 150-post quality A/B
      // (2026-07-11, model A/B harness — since deleted, decision banked): equal blind-judged
      // attribution + zero true fabrication vs 3.5-flash, BETTER recall,
      // at ~1/3 the price ($6.60 vs $20.48 per 1k posts batch). Env override
      // exists for A/B work only — the default IS the decision.
      model: process.env.LLM_MODEL || 'gemini-3-flash-preview',
      queryModel: process.env.LLM_QUERY_MODEL || 'gemini-3-flash-preview',
      // ---- Timeouts (2026-07-11 fold-in; formerly env, .env had them all 0
      // = no timeout, a prod hang risk on the interactive query path) ----
      // The interactive query-path ceiling moved to GEMINI_CALLER_PROFILES
      // (F122/D16): it is per-caller configuration, and this key's only four
      // readers were the four query-class call sites.
      queryLogOutputs: isEnvFlagEnabled(process.env.LLM_QUERY_LOG_OUTPUTS),
      baseUrl:
        process.env.LLM_BASE_URL ||
        'https://generativelanguage.googleapis.com/v1beta',
      // Per-call abort ceiling for interactive content-extraction calls.
      // Non-streaming Gemini generation on big chunks can run minutes; 10 min
      // is a hang guard, not a tuning target. Batch pipeline is async/polled
      // and unaffected.
      timeout: 600_000,
      // Undici global dispatcher: headers arrive only after full generation
      // on non-streaming calls, so headers/body get the same 10 min ceiling;
      // TCP connect should never be slow.
      headersTimeoutMs: 600_000,
      bodyTimeoutMs: 600_000,
      connectTimeoutMs: 10_000,
      // ---- Model behavior (tuned once per model switch, never per env) ----
      maxTokens: 0, // 0 = model default output cap (65,536 for Gemini Flash)
      temperature: 0.1, // near-deterministic extraction/interpretation
      topP: 0.5,
      topK: 30,
      candidateCount: 1,
      thinking: {
        // Thinking levels chosen in the gemini-3 A/B: LOW for extraction,
        // MINIMAL for the latency-sensitive query path.
        level: 'LOW',
        queryLevel: 'MINIMAL',
        includeThoughts: isEnvFlagEnabled(
          process.env.LLM_THINKING_INCLUDE_THOUGHTS,
        ),
        // Runtime per-caller overrides (JSON: {"caller.tag":"MEDIUM"}).
        // Wins over the profile table; red team F4 found the channel was
        // documented but unparseable — a promised override nobody could set.
        perCaller: ((): Record<string, string> | undefined => {
          const raw = process.env.LLM_THINKING_PER_CALLER;
          if (!raw) return undefined;
          try {
            return JSON.parse(raw) as Record<string, string>;
          } catch {
            return undefined;
          }
        })(),
      },
      thoughtDebug: {
        enabled: isEnvFlagEnabled(process.env.LLM_DEBUG_THOUGHTS_ONCE),
        query: !isEnvFlagExplicitlyDisabled(
          process.env.LLM_DEBUG_THOUGHTS_QUERY,
        ),
        content: !isEnvFlagExplicitlyDisabled(
          process.env.LLM_DEBUG_THOUGHTS_CONTENT,
        ),
        maxChars: parseInt(process.env.LLM_DEBUG_THOUGHTS_MAX_CHARS || '0', 10),
        maxQueryEntries: parseInt(
          process.env.LLM_DEBUG_THOUGHTS_MAX_QUERIES || '0',
          10,
        ),
        maxContentEntries: parseInt(
          process.env.LLM_DEBUG_THOUGHTS_MAX_CONTENT_CHUNKS || '0',
          10,
        ),
        writeToFile: isEnvFlagEnabled(
          process.env.LLM_DEBUG_THOUGHTS_WRITE_FILE,
        ),
        filePath: process.env.LLM_DEBUG_THOUGHTS_FILE_PATH || undefined,
        filePathQuery:
          process.env.LLM_DEBUG_THOUGHTS_FILE_PATH_QUERY || undefined,
        filePathContent:
          process.env.LLM_DEBUG_THOUGHTS_FILE_PATH_CONTENT || undefined,
      },
      cache: {
        // Gemini system-instruction cache: 3h TTL, refresh 10 min early.
        systemTtlSeconds: 10_800,
        systemRefreshLeadSeconds: 600,
        // Query-analysis result cache (was .env-only; 0 here would DISABLE
        // it — 900/120/200 are the values production behavior has been using).
        queryResultTtlSeconds: 900,
        queryResultRedisKey:
          resolveScopedEnv(appEnv, {
            dev: process.env.LLM_QUERY_RESULT_CACHE_REDIS_KEY_DEV,
            prod: process.env.LLM_QUERY_RESULT_CACHE_REDIS_KEY_PROD,
            fallback: process.env.LLM_QUERY_RESULT_CACHE_REDIS_KEY,
          }) || `crave:${appEnv}:llm:query-analysis`,
        queryResultCacheVersion:
          process.env.LLM_QUERY_RESULT_CACHE_VERSION || 'v1',
        queryResultLocalTtlSeconds: 120,
        queryResultLocalMaxEntries: 200,
        queryResultIncludeMetadata: isEnvFlagEnabled(
          process.env.LLM_QUERY_RESULT_CACHE_INCLUDE_METADATA,
        ),
      },
    },
    googlePlaces: {
      apiKey: resolveSecretEnv('GOOGLE_PLACES_API_KEY'),
      timeout: 10_000, // per-request HTTP timeout (ms)
      // ---- Self-imposed rate caps (2026-07-11 verify) ----
      // We call Places API (New) (places.googleapis.com/v1). Google no longer
      // publishes default quotas; they are per-method QPM set per-project in
      // the Cloud Console. The old 200 rps / 12,000 rpm here was a copied
      // number, NOT a measured quota — a silent 429 source. 10 rps / 600 rpm
      // is a conservative floor safe under any default tier; raise ONLY after
      // reading the project's actual per-method quota at
      // console.cloud.google.com/google/maps-apis/quotas. Env override kept
      // because the real quota is a per-project (per-env) fact.
      // Service-wide default applies only to operations NOT listed below.
      // 60/min: an unregistered operation gets one call per second — enough
      // to work, slow enough to surface in the ledger and force an explicit
      // entry (closed-vocabulary posture; the per-op ceilings are the law).
      requestsPerMinute: parseInt(
        process.env.GOOGLE_PLACES_REQUESTS_PER_MINUTE || '60',
        10,
      ),
      // Daily cap is a cost guard, not a Google quota.
      requestsPerDay: parseInt(
        process.env.GOOGLE_PLACES_REQUESTS_PER_DAY || '150000',
        10,
      ),
      // KEYED BY PlacesOperation — the SAME names the rate-limit scope, the
      // usage ledger and the pricing table use (red team 2026-08-02). These
      // used to be a third vocabulary: `placeAutocomplete` here vs
      // `autocomplete` in the ledger, and text search had NO key at all while
      // its scope was `findPlaceFromText`. Setting a textSearch limit was a
      // silent no-op on the most expensive Places call.
      // Record<PlacesOperation, …> — a stray key and a MISSING key are both
      // compile errors, which is what the three-vocabularies bug needed.
      // DERIVED CEILINGS (owner-ratified basis, 2026-08-03: "the upper
      // limit of what we might do in a month when live" = one city
      // onboarding + typical steady collection of every city). Measured
      // from api_usage_ledger, 45d window incl. the 07-30/31 full-city
      // onboarding burst — per-minute = the historical peak minute
      // rounded up to the next 50; per-day = onboarding-day max + steady
      // p95 day, rounded up to the next thousand. Numbers are
      // DERIVATIONS of those measurements, not tunables — re-derive from
      // the ledger before changing.
      operationLimits: placesOperationLimits({
        autocomplete: {
          requestsPerMinute: 500, // measured peak 452/min
          requestsPerDay: 12_000, // 7,361 burst + 3,680 steady p95
        },
        placeDetails: {
          requestsPerMinute: 400, // measured peak 392/min
          requestsPerDay: 12_000, // 7,565 burst + 4,091 steady p95
        },
        // Text search is the expensive operation ($0.032/call at the pro
        // SKU vs placeDetails' $0.017).
        textSearch: {
          requestsPerMinute: 250, // measured peak 226/min
          requestsPerDay: 8_000, // 5,123 burst + 2,573 steady p95
        },
      }),
      defaultRadius: 5_000, // meters — default search radius
    },
    tomtom: {
      apiKey: resolveSecretEnv('TOMTOM_API_KEY'),
      timeout: parseInt(process.env.TOMTOM_TIMEOUT || '10000', 10),
      reverseGeocodeBaseUrl:
        process.env.TOMTOM_REVERSE_GEOCODE_BASE_URL ||
        'https://api.tomtom.com/search/2/reverseGeocode',
      geocodeBaseUrl:
        process.env.TOMTOM_GEOCODE_BASE_URL ||
        'https://api.tomtom.com/search/2/geocode',
      additionalDataUrl:
        process.env.TOMTOM_ADDITIONAL_DATA_URL ||
        'https://api.tomtom.com/search/2/additionalData.json',
      geometryZoom: process.env.TOMTOM_GEOMETRY_ZOOM
        ? parseInt(process.env.TOMTOM_GEOMETRY_ZOOM, 10)
        : undefined,
      apiVersion: process.env.TOMTOM_API_VERSION || undefined,
    },
    entityResolution: {
      cache: {
        redisKey:
          resolveScopedEnv(appEnv, {
            dev: process.env.ENTITY_RESOLUTION_CACHE_REDIS_KEY_DEV,
            prod: process.env.ENTITY_RESOLUTION_CACHE_REDIS_KEY_PROD,
            fallback: process.env.ENTITY_RESOLUTION_CACHE_REDIS_KEY,
          }) || `crave:${appEnv}:entity-resolution`,
        // Entity-resolution cache (was .env-only; 0 here would DISABLE it —
        // these are the values production behavior has been using).
        ttlSeconds: 900,
        negativeTtlSeconds: 60, // short negative TTL so new entities appear fast
        localTtlSeconds: 120,
        localMaxEntries: 2_000,
        version: process.env.ENTITY_RESOLUTION_CACHE_VERSION || 'v1',
      },
    },
    // Re-fetch gate for already-processed threads (2026-07-11 fold-in; renamed
    // from `keywordProcessing` 2026-08-03 — the old name lied: pipelineScope
    // gates chronological and archive lanes too). Values DERIVED 2026-08-03
    // from the mirror corpus (F468/F470):
    //  - gateLookbackDays = risingHalfLifeDays (21, K1-ratified): a thread
    //    unrefreshed for one fast half-life has lost half its rising-lane
    //    weight — that is the staleness bound. Measured residual comment
    //    arrival past day 7 is ~0.15 comments/post (98.9% of 42,460 comments
    //    arrive within 21d of the post), so the cooldown skips almost nothing.
    //  - minNewComments = ceil(1 / measured mentions-per-comment) =
    //    ceil(1/0.436) = 3: the smallest delta whose expected extraction yield
    //    is at least one whole mention — below it a re-fetch buys less than
    //    one evidence row on average.
    //  - commentSampleLimit = minNewComments + 2 already-seen margin (the
    //    reader warns and fetches when limit < min, so the ordering is
    //    enforced, not remembered).
    refetchGate: {
      gateLookbackDays: 21,
      commentSampleLimit: 5,
      minNewComments: 3,
      pipelineScope: ['chronological', 'archive', 'keyword'],
    },
    unifiedProcessing: {
      dryRun: isEnvFlagEnabled(process.env.UNIFIED_PROCESSING_DRY_RUN),
    },
    // FOUR KEYS, ALL READ (audit 2026-08-02, F405). This block declared ~40
    // keys — batchProcessing, checkpoints, storage.s3, validation, batchSize,
    // processingTimeout — of which archive-ingestion.service.ts read exactly
    // these four. A key nothing reads is not a lenient default; it is a lie
    // about what the operator controls.
    pushshift: {
      baseDirectory:
        process.env.PUSHSHIFT_BASE_DIR || 'data/pushshift/archives',
      targetSubreddits: (
        process.env.PUSHSHIFT_SUBREDDITS || 'austinfood,FoodNYC'
      ).split(','),
      fileTypes: ['comments', 'submissions'],
      storage: {
        local: {
          basePath: process.env.PUSHSHIFT_LOCAL_BASE_PATH || 'data/pushshift',
          archivePath:
            process.env.PUSHSHIFT_LOCAL_ARCHIVE_PATH ||
            'data/pushshift/archives',
        },
      },
    },
  };
};
