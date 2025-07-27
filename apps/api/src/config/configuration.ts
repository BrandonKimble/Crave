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

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
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
      preparedStatements: process.env.DATABASE_PREPARED_STATEMENTS !== 'false',
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
  reddit: {
    clientId: process.env.REDDIT_CLIENT_ID,
    clientSecret: process.env.REDDIT_CLIENT_SECRET,
    username: process.env.REDDIT_USERNAME,
    password: process.env.REDDIT_PASSWORD,
    userAgent: process.env.REDDIT_USER_AGENT || 'CraveSearch/1.0.0',
  },
  llm: {
    apiKey: process.env.LLM_API_KEY,
    model: process.env.LLM_MODEL || 'gemini-2.5-flash',
    baseUrl:
      process.env.LLM_BASE_URL ||
      'https://generativelanguage.googleapis.com/v1beta',
    timeout: parseInt(process.env.LLM_TIMEOUT || '30000', 10),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4000', 10),
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.1'),
    topP: parseFloat(process.env.LLM_TOP_P || '0.95'),
    topK: parseInt(process.env.LLM_TOP_K || '40', 10),
    candidateCount: parseInt(process.env.LLM_CANDIDATE_COUNT || '1', 10),
    thinking: {
      enabled: process.env.LLM_THINKING_ENABLED !== 'false',
      budget: parseInt(process.env.LLM_THINKING_BUDGET || '0', 10),
    },
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRATION || '7d',
  },
});
