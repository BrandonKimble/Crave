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
    case 'test':
      return '25'; // Mid-size pool for staging/testing
    case 'production':
      return '50'; // MVP production pool size (can scale to 100+)
    default:
      return '10'; // Conservative default
  }
}

export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  database: {
    url: process.env.DATABASE_URL,
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
    model: process.env.LLM_MODEL || 'gpt-3.5-turbo',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRATION || '7d',
  },
});
