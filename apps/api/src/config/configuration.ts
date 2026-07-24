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

function resolveAppEnv(): string {
  const raw = process.env.APP_ENV || process.env.CRAVE_ENV;
  if (raw && raw.trim()) {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'production') {
      return 'prod';
    }
    if (normalized === 'development') {
      return 'dev';
    }
    return raw.trim();
  }

  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') {
    return 'prod';
  }
  return 'dev';
}

function isProductionAppEnv(appEnv: string): boolean {
  const normalized = appEnv.toLowerCase();
  return normalized === 'prod' || normalized === 'production';
}

function resolveScopedEnv(
  appEnv: string,
  values: {
    dev?: string;
    prod?: string;
    fallback?: string;
  },
): string | undefined {
  const selected = isProductionAppEnv(appEnv) ? values.prod : values.dev;
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

export default () => {
  const appEnv = resolveAppEnv();

  return {
    appEnv,
    port: parseInt(process.env.PORT || '3000', 10),
    logging: {
      level: (process.env.LOG_LEVEL || '').toLowerCase(),
    },
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
    sentry: {
      dsn: process.env.SENTRY_DSN,
      environment:
        process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE,
      // APP_ENV-aware defaults: full sampling in dev, 10% in prod (cost).
      // Env override kept as an ops lever (e.g. temporarily raise prod).
      tracesSampleRate: parseFloat(
        process.env.SENTRY_TRACES_SAMPLE_RATE ||
          (isProductionAppEnv(appEnv) ? '0.1' : '1.0'),
      ),
      profilesSampleRate: parseFloat(
        process.env.SENTRY_PROFILES_SAMPLE_RATE ||
          (isProductionAppEnv(appEnv) ? '0.1' : '1.0'),
      ),
    },
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
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
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
      defaultPriceId: process.env.STRIPE_DEFAULT_PRICE_ID,
      successUrl:
        process.env.STRIPE_SUCCESS_URL ||
        'http://localhost:3000/payments/success',
      cancelUrl:
        process.env.STRIPE_CANCEL_URL ||
        'http://localhost:3000/payments/cancel',
      billingPortalReturnUrl:
        process.env.STRIPE_PORTAL_RETURN_URL ||
        'http://localhost:3000/account/subscription',
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
      entitlementMap:
        process.env.REVENUECAT_ENTITLEMENT_MAP || 'premium:premium_monthly',
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
      // — a generic UA is exactly what their anti-abuse layer punishes.
      userAgent:
        process.env.REDDIT_USER_AGENT ||
        `web:crave-search:v1.0.0 (by /u/${process.env.REDDIT_USERNAME || 'crave-search'})`,
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
      // (2026-07-11, scripts/collection-model-ab-v2.ts): equal blind-judged
      // attribution + zero true fabrication vs 3.5-flash, BETTER recall,
      // at ~1/3 the price ($6.60 vs $20.48 per 1k posts batch). Env override
      // exists for A/B work only — the default IS the decision.
      model: process.env.LLM_MODEL || 'gemini-3-flash-preview',
      queryModel: process.env.LLM_QUERY_MODEL || 'gemini-3-flash-preview',
      // ---- Timeouts (2026-07-11 fold-in; formerly env, .env had them all 0
      // = no timeout, a prod hang risk on the interactive query path) ----
      // Interactive natural-search interpretation: user-facing, must fail fast.
      queryTimeout: 30_000,
      queryLogOutputs: process.env.LLM_QUERY_LOG_OUTPUTS === 'true',
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
        includeThoughts: process.env.LLM_THINKING_INCLUDE_THOUGHTS === 'true',
      },
      thoughtDebug: {
        enabled: process.env.LLM_DEBUG_THOUGHTS_ONCE === 'true',
        query: process.env.LLM_DEBUG_THOUGHTS_QUERY !== 'false',
        content: process.env.LLM_DEBUG_THOUGHTS_CONTENT !== 'false',
        maxChars: parseInt(process.env.LLM_DEBUG_THOUGHTS_MAX_CHARS || '0', 10),
        maxQueryEntries: parseInt(
          process.env.LLM_DEBUG_THOUGHTS_MAX_QUERIES || '0',
          10,
        ),
        maxContentEntries: parseInt(
          process.env.LLM_DEBUG_THOUGHTS_MAX_CONTENT_CHUNKS || '0',
          10,
        ),
        writeToFile: process.env.LLM_DEBUG_THOUGHTS_WRITE_FILE === 'true',
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
        redisKey:
          resolveScopedEnv(appEnv, {
            dev: process.env.LLM_SYSTEM_CACHE_REDIS_KEY_DEV,
            prod: process.env.LLM_SYSTEM_CACHE_REDIS_KEY_PROD,
            fallback: process.env.LLM_SYSTEM_CACHE_REDIS_KEY,
          }) || `crave:${appEnv}:llm:system-instruction-cache`,
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
        queryResultIncludeMetadata:
          process.env.LLM_QUERY_RESULT_CACHE_INCLUDE_METADATA === 'true',
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
      requestsPerMinute: parseInt(
        process.env.GOOGLE_PLACES_REQUESTS_PER_MINUTE || '600',
        10,
      ),
      // Daily cap is a cost guard, not a Google quota.
      requestsPerDay: parseInt(
        process.env.GOOGLE_PLACES_REQUESTS_PER_DAY || '150000',
        10,
      ),
      operationLimits: {
        placeAutocomplete: {
          requestsPerMinute: 600, // same conservative per-method floor as above
          requestsPerDay: 150_000,
        },
        placeDetails: {
          requestsPerMinute: 600,
          requestsPerDay: 100_000,
        },
      },
      defaultRadius: 5_000, // meters — default search radius
      retryOptions: {
        maxRetries: 3,
        retryDelay: 1_000, // base backoff (ms)
        retryBackoffFactor: 2.0,
      },
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
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRATION || '7d',
    },
    // On-demand keyword-collection throughput (2026-07-11 fold-in; the old
    // SEARCH_INTEREST_* env aliases restated these same values).
    onDemand: {
      maxPerBatch: 5, // entities enqueued per on-demand cycle
      estimatedJobMinutes: 120, // used for backlog/ETA math
      maxProcessingBacklog: 10, // stop enqueueing past this many in-flight jobs
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
    restaurantEnrichment: {
      // 0.15 is the value production behavior has been using (.env override
      // of the old 0.2 fallback — reconciled 2026-07-11 in favor of .env).
      minScoreThreshold: 0.15,
    },
    // Keyword-collection gating (2026-07-11 fold-in; .env restated these).
    keywordProcessing: {
      gateLookbackDays: 21, // recency window for gate decisions
      commentSampleLimit: 5, // comments sampled per candidate thread
      minNewComments: 3, // skip threads with fewer new comments
      pipelineScope: ['chronological', 'archive', 'keyword'],
    },
    unifiedProcessing: {
      dryRun: process.env.UNIFIED_PROCESSING_DRY_RUN === 'true',
    },
    pushshift: {
      baseDirectory:
        process.env.PUSHSHIFT_BASE_DIR || 'data/pushshift/archives',
      targetSubreddits: (
        process.env.PUSHSHIFT_SUBREDDITS || 'austinfood,FoodNYC'
      ).split(','),
      fileTypes: ['comments', 'submissions'],
      batchSize: parseInt(process.env.PUSHSHIFT_BATCH_SIZE || '1000', 10),
      processingTimeout: parseInt(
        process.env.PUSHSHIFT_PROCESSING_TIMEOUT || '300000',
        10,
      ), // 5 minutes
      validation: {
        enabled: process.env.PUSHSHIFT_VALIDATION_ENABLED !== 'false',
        sampleLines: parseInt(
          process.env.PUSHSHIFT_VALIDATION_SAMPLE_LINES || '10',
          10,
        ),
      },
      storage: {
        local: {
          basePath: process.env.PUSHSHIFT_LOCAL_BASE_PATH || 'data/pushshift',
          archivePath:
            process.env.PUSHSHIFT_LOCAL_ARCHIVE_PATH ||
            'data/pushshift/archives',
        },
        s3: {
          bucket: process.env.PUSHSHIFT_S3_BUCKET,
          region: process.env.PUSHSHIFT_S3_REGION || 'us-east-1',
          keyPrefix:
            process.env.PUSHSHIFT_S3_KEY_PREFIX || 'pushshift-archives/',
        },
      },
      // Batch Processing System Configuration
      batchProcessing: {
        minBatchSize: parseInt(
          process.env.PUSHSHIFT_MIN_BATCH_SIZE || '100',
          10,
        ),
        maxBatchSize: parseInt(
          process.env.PUSHSHIFT_MAX_BATCH_SIZE || '5000',
          10,
        ),
        maxMemoryUsageMB: parseInt(
          process.env.PUSHSHIFT_MAX_MEMORY_MB || '512',
          10,
        ),
        enableCheckpoints: process.env.PUSHSHIFT_ENABLE_CHECKPOINTS !== 'false',
        enableResourceMonitoring:
          process.env.PUSHSHIFT_ENABLE_RESOURCE_MONITORING !== 'false',
        adaptiveBatchSizing:
          process.env.PUSHSHIFT_ADAPTIVE_BATCH_SIZING !== 'false',
        progressReportingInterval: parseInt(
          process.env.PUSHSHIFT_PROGRESS_REPORTING_INTERVAL || '10000',
          10,
        ),
        resourceCheckInterval: parseInt(
          process.env.PUSHSHIFT_RESOURCE_CHECK_INTERVAL || '1000',
          10,
        ),
        memoryCheckInterval: parseInt(
          process.env.PUSHSHIFT_MEMORY_CHECK_INTERVAL || '5000',
          10,
        ),
        preserveThreadStructure:
          process.env.PUSHSHIFT_PRESERVE_THREADS !== 'false',
        validateTimestamps:
          process.env.PUSHSHIFT_VALIDATE_TIMESTAMPS !== 'false',
        qualityFilters: {
          minScore: parseInt(
            process.env.PUSHSHIFT_QUALITY_MIN_SCORE || '-5',
            10,
          ),
          excludeDeleted: process.env.PUSHSHIFT_EXCLUDE_DELETED !== 'false',
          excludeRemoved: process.env.PUSHSHIFT_EXCLUDE_REMOVED !== 'false',
        },
      },
      // Checkpoint Service Configuration
      checkpoints: {
        enablePersistence:
          process.env.PUSHSHIFT_CHECKPOINT_PERSISTENCE !== 'false',
        storageLocation:
          process.env.PUSHSHIFT_CHECKPOINT_STORAGE || './data/checkpoints',
        maxCheckpointsPerJob: parseInt(
          process.env.PUSHSHIFT_MAX_CHECKPOINTS_PER_JOB || '50',
          10,
        ),
        cleanupInterval: parseInt(
          process.env.PUSHSHIFT_CHECKPOINT_CLEANUP_INTERVAL || '3600000',
          10,
        ), // 1 hour
        retentionPeriod: parseInt(
          process.env.PUSHSHIFT_CHECKPOINT_RETENTION_PERIOD || '604800000',
          10,
        ), // 7 days
      },
    },
  };
};
