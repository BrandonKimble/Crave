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
    return raw.trim();
  }

  const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
  if (nodeEnv === 'production') {
    return 'prod';
  }
  return 'dev';
}

function resolveScopedEnv(
  appEnv: string,
  values: {
    dev?: string;
    prod?: string;
    fallback?: string;
  },
): string | undefined {
  const normalized = appEnv.toLowerCase();
  const selected = normalized === 'prod' ? values.prod : values.dev;
  return selected || values.fallback || undefined;
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
        max: parseInt(
          process.env.DATABASE_CONNECTION_POOL_MAX || getDatabasePoolSize(),
          10,
        ),
        min: parseInt(process.env.DATABASE_CONNECTION_POOL_MIN || '2', 10),
        acquire: parseInt(
          process.env.DATABASE_CONNECTION_ACQUIRE_TIMEOUT || '60000',
          10,
        ),
        idle: parseInt(
          process.env.DATABASE_CONNECTION_IDLE_TIMEOUT || '10000',
          10,
        ),
        evict: parseInt(
          process.env.DATABASE_CONNECTION_EVICT_INTERVAL || '10000',
          10,
        ),
        handleDisconnects: process.env.DATABASE_HANDLE_DISCONNECTS === 'true',
      },
      query: {
        timeout: parseInt(process.env.DATABASE_QUERY_TIMEOUT || '30000', 10),
        retry: {
          attempts: parseInt(process.env.DATABASE_RETRY_ATTEMPTS || '3', 10),
          delay: parseInt(process.env.DATABASE_RETRY_DELAY || '1000', 10),
          factor: parseFloat(process.env.DATABASE_RETRY_FACTOR || '2.0'),
        },
      },
      performance: {
        preparedStatements:
          process.env.DATABASE_PREPARED_STATEMENTS !== 'false',
        logging: {
          enabled:
            process.env.DATABASE_LOGGING === 'true' ||
            process.env.NODE_ENV === 'development',
          slowQueryThreshold: parseInt(
            process.env.DATABASE_SLOW_QUERY_THRESHOLD || '1000',
            10,
          ),
        },
      },
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },
    bull: {
      prefix: process.env.BULL_PREFIX || `crave:${appEnv}`,
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
      clientId: resolveScopedEnv(appEnv, {
        dev: process.env.REDDIT_CLIENT_ID_DEV,
        prod: process.env.REDDIT_CLIENT_ID_PROD,
        fallback: process.env.REDDIT_CLIENT_ID,
      }),
      clientSecret: resolveScopedEnv(appEnv, {
        dev: process.env.REDDIT_CLIENT_SECRET_DEV,
        prod: process.env.REDDIT_CLIENT_SECRET_PROD,
        fallback: process.env.REDDIT_CLIENT_SECRET,
      }),
      username: resolveScopedEnv(appEnv, {
        dev: process.env.REDDIT_USERNAME_DEV,
        prod: process.env.REDDIT_USERNAME_PROD,
        fallback: process.env.REDDIT_USERNAME,
      }),
      password: resolveScopedEnv(appEnv, {
        dev: process.env.REDDIT_PASSWORD_DEV,
        prod: process.env.REDDIT_PASSWORD_PROD,
        fallback: process.env.REDDIT_PASSWORD,
      }),
      userAgent: process.env.REDDIT_USER_AGENT || 'CraveSearch/1.0.0',
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
      apiKey: resolveScopedEnv(appEnv, {
        dev: process.env.LLM_API_KEY_DEV,
        prod: process.env.LLM_API_KEY_PROD,
        fallback: process.env.LLM_API_KEY,
      }),
      model: process.env.LLM_MODEL || 'gemini-2.5-flash-preview-09-2025',
      queryModel: process.env.LLM_QUERY_MODEL || 'gemini-2.5-flash',
      queryTimeout: parseInt(process.env.LLM_QUERY_TIMEOUT || '0', 10),
      queryLogOutputs: process.env.LLM_QUERY_LOG_OUTPUTS === 'true',
      baseUrl:
        process.env.LLM_BASE_URL ||
        'https://generativelanguage.googleapis.com/v1beta',
      timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
      headersTimeoutMs: parseInt(
        process.env.LLM_HEADERS_TIMEOUT_MS || '120000',
        10,
      ),
      bodyTimeoutMs: parseInt(process.env.LLM_BODY_TIMEOUT_MS || '300000', 10),
      connectTimeoutMs: parseInt(
        process.env.LLM_CONNECT_TIMEOUT_MS || '30000',
        10,
      ),
      maxTokens: process.env.LLM_MAX_TOKENS
        ? parseInt(process.env.LLM_MAX_TOKENS, 10)
        : 0, // 0 = Use Gemini 2.5 Flash default 65,536 tokens maximum
      temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
      topP: parseFloat(process.env.LLM_TOP_P || '0.5'),
      topK: parseInt(process.env.LLM_TOP_K || '30', 10),
      candidateCount: parseInt(process.env.LLM_CANDIDATE_COUNT || '1', 10),
      thinking: {
        enabled: process.env.LLM_THINKING_ENABLED === 'true',
        budget: parseInt(process.env.LLM_THINKING_BUDGET || '0', 10),
        level: process.env.LLM_THINKING_LEVEL || undefined,
        queryLevel: process.env.LLM_QUERY_THINKING_LEVEL || undefined,
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
        systemTtlSeconds: parseInt(
          process.env.LLM_SYSTEM_CACHE_TTL_SECONDS || '10800',
          10,
        ),
        systemRefreshLeadSeconds: parseInt(
          process.env.LLM_SYSTEM_CACHE_REFRESH_LEAD_SECONDS || '600',
          10,
        ),
        redisKey:
          resolveScopedEnv(appEnv, {
            dev: process.env.LLM_SYSTEM_CACHE_REDIS_KEY_DEV,
            prod: process.env.LLM_SYSTEM_CACHE_REDIS_KEY_PROD,
            fallback: process.env.LLM_SYSTEM_CACHE_REDIS_KEY,
          }) || `crave:${appEnv}:llm:system-instruction-cache`,
        queryResultTtlSeconds: parseInt(
          process.env.LLM_QUERY_RESULT_CACHE_TTL_SECONDS || '0',
          10,
        ),
        queryResultRedisKey:
          resolveScopedEnv(appEnv, {
            dev: process.env.LLM_QUERY_RESULT_CACHE_REDIS_KEY_DEV,
            prod: process.env.LLM_QUERY_RESULT_CACHE_REDIS_KEY_PROD,
            fallback: process.env.LLM_QUERY_RESULT_CACHE_REDIS_KEY,
          }) || `crave:${appEnv}:llm:query-analysis`,
        queryResultCacheVersion:
          process.env.LLM_QUERY_RESULT_CACHE_VERSION || 'v1',
        queryResultLocalTtlSeconds: parseInt(
          process.env.LLM_QUERY_RESULT_CACHE_LOCAL_TTL_SECONDS || '0',
          10,
        ),
        queryResultLocalMaxEntries: parseInt(
          process.env.LLM_QUERY_RESULT_CACHE_LOCAL_MAX_ENTRIES || '0',
          10,
        ),
        queryResultIncludeMetadata:
          process.env.LLM_QUERY_RESULT_CACHE_INCLUDE_METADATA === 'true',
      },
    },
    googlePlaces: {
      apiKey: resolveScopedEnv(appEnv, {
        dev: process.env.GOOGLE_PLACES_API_KEY_DEV,
        prod: process.env.GOOGLE_PLACES_API_KEY_PROD,
        fallback: process.env.GOOGLE_PLACES_API_KEY,
      }),
      timeout: parseInt(process.env.GOOGLE_PLACES_TIMEOUT || '10000', 10),
      requestsPerSecond: parseInt(
        process.env.GOOGLE_PLACES_REQUESTS_PER_SECOND || '50',
        10,
      ),
      requestsPerMinute: parseInt(
        process.env.GOOGLE_PLACES_REQUESTS_PER_MINUTE || '12000',
        10,
      ),
      requestsPerDay: parseInt(
        process.env.GOOGLE_PLACES_REQUESTS_PER_DAY || '150000',
        10,
      ),
      operationLimits: {
        placeAutocomplete: {
          requestsPerMinute: parseInt(
            process.env.GOOGLE_PLACES_AUTOCOMPLETE_REQUESTS_PER_MINUTE ||
              process.env.GOOGLE_PLACES_REQUESTS_PER_MINUTE ||
              '12000',
            10,
          ),
          requestsPerDay: parseInt(
            process.env.GOOGLE_PLACES_AUTOCOMPLETE_REQUESTS_PER_DAY ||
              process.env.GOOGLE_PLACES_REQUESTS_PER_DAY ||
              '150000',
            10,
          ),
        },
        placeDetails: {
          requestsPerMinute: parseInt(
            process.env.GOOGLE_PLACES_PLACE_DETAILS_REQUESTS_PER_MINUTE ||
              process.env.GOOGLE_PLACES_REQUESTS_PER_MINUTE ||
              '600',
            10,
          ),
          requestsPerDay: parseInt(
            process.env.GOOGLE_PLACES_PLACE_DETAILS_REQUESTS_PER_DAY ||
              process.env.GOOGLE_PLACES_REQUESTS_PER_DAY ||
              '100000',
            10,
          ),
        },
      },
      defaultRadius: parseInt(
        process.env.GOOGLE_PLACES_DEFAULT_RADIUS || '5000',
        10,
      ),
      retryOptions: {
        maxRetries: parseInt(process.env.GOOGLE_PLACES_MAX_RETRIES || '3', 10),
        retryDelay: parseInt(
          process.env.GOOGLE_PLACES_RETRY_DELAY || '1000',
          10,
        ),
        retryBackoffFactor: parseFloat(
          process.env.GOOGLE_PLACES_RETRY_BACKOFF_FACTOR || '2.0',
        ),
      },
    },
    moderation: {
      apiKey: resolveScopedEnv(appEnv, {
        dev: process.env.GOOGLE_MODERATION_API_KEY_DEV,
        prod: process.env.GOOGLE_MODERATION_API_KEY_PROD,
      }),
      endpoint:
        process.env.GOOGLE_MODERATION_ENDPOINT ||
        'https://contentmoderation.googleapis.com/v1beta/moderations:moderateText',
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRATION || '7d',
    },
    onDemand: {
      maxPerBatch: parseInt(
        process.env.SEARCH_ON_DEMAND_MAX_PER_BATCH ||
          process.env.SEARCH_INTEREST_MAX_PER_BATCH ||
          '5',
        10,
      ),
      estimatedJobMinutes: parseInt(
        process.env.SEARCH_ON_DEMAND_ESTIMATED_JOB_MINUTES || '120',
        10,
      ),
      maxImmediateWaiting: parseInt(
        process.env.SEARCH_ON_DEMAND_MAX_INSTANT_WAITING ||
          process.env.SEARCH_INTEREST_MAX_INSTANT_WAITING ||
          '3',
        10,
      ),
      maxImmediateActive: parseInt(
        process.env.SEARCH_ON_DEMAND_MAX_INSTANT_ACTIVE ||
          process.env.SEARCH_INTEREST_MAX_INSTANT_ACTIVE ||
          '1',
        10,
      ),
      maxProcessingBacklog: parseInt(
        process.env.SEARCH_ON_DEMAND_MAX_PROCESSING_BACKLOG ||
          process.env.SEARCH_INTEREST_MAX_PROCESSING_BACKLOG ||
          '10',
        10,
      ),
      instantCooldownMs: parseInt(
        process.env.SEARCH_ON_DEMAND_INSTANT_COOLDOWN_MS ||
          process.env.SEARCH_INTEREST_INSTANT_COOLDOWN_MS ||
          '300000',
        10,
      ),
    },
    entityResolution: {
      cache: {
        redisKey:
          resolveScopedEnv(appEnv, {
            dev: process.env.ENTITY_RESOLUTION_CACHE_REDIS_KEY_DEV,
            prod: process.env.ENTITY_RESOLUTION_CACHE_REDIS_KEY_PROD,
            fallback: process.env.ENTITY_RESOLUTION_CACHE_REDIS_KEY,
          }) || `crave:${appEnv}:entity-resolution`,
        ttlSeconds: parseInt(
          process.env.ENTITY_RESOLUTION_CACHE_TTL_SECONDS || '0',
          10,
        ),
        negativeTtlSeconds: parseInt(
          process.env.ENTITY_RESOLUTION_CACHE_NEGATIVE_TTL_SECONDS || '0',
          10,
        ),
        localTtlSeconds: parseInt(
          process.env.ENTITY_RESOLUTION_CACHE_LOCAL_TTL_SECONDS || '0',
          10,
        ),
        localMaxEntries: parseInt(
          process.env.ENTITY_RESOLUTION_CACHE_LOCAL_MAX_ENTRIES || '0',
          10,
        ),
        version: process.env.ENTITY_RESOLUTION_CACHE_VERSION || 'v1',
      },
    },
    restaurantEnrichment: {
      minScoreThreshold: parseFloat(
        process.env.RESTAURANT_ENRICHMENT_MIN_SCORE_THRESHOLD || '0.2',
      ),
    },
    keywordProcessing: {
      gateLookbackDays: parseInt(
        process.env.KEYWORD_GATE_LOOKBACK_DAYS || '21',
        10,
      ),
      commentSampleLimit: parseInt(
        process.env.KEYWORD_COMMENT_SAMPLE_LIMIT || '5',
        10,
      ),
      minNewComments: parseInt(process.env.KEYWORD_MIN_NEW_COMMENTS || '3', 10),
      pipelineScope: (
        process.env.KEYWORD_GATE_PIPELINES ||
        'chronological,archive,keyword,on-demand'
      )
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0),
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
