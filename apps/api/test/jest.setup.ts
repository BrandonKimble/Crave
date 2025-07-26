/**
 * Jest setup file for integration tests
 * Handles test environment configuration for parallel execution
 */

// Set test environment variables
process.env.NODE_ENV = 'test';

// Configure test database
if (!process.env.DATABASE_URL && !process.env.TEST_DATABASE_URL) {
  process.env.TEST_DATABASE_URL =
    'postgresql://postgres:postgres@localhost:5432/crave_search_test';
}

// Optimize connection pool for parallel testing
process.env.DATABASE_CONNECTION_POOL_MAX = '10'; // Increased for parallel tests
process.env.DATABASE_CONNECTION_POOL_MIN = '2';
process.env.DATABASE_CONNECTION_ACQUIRE_TIMEOUT = '60000'; // Increased timeout
process.env.DATABASE_CONNECTION_IDLE_TIMEOUT = '10000';
process.env.DATABASE_RETRY_ATTEMPTS = '3';
process.env.DATABASE_RETRY_DELAY = '1000';

// Redis configuration for testing
process.env.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
process.env.REDIS_PORT = process.env.REDIS_PORT || '6379';

// Disable database logging unless explicitly enabled
if (process.env.DATABASE_LOGGING !== 'true') {
  process.env.DATABASE_LOGGING = 'false';
}

// Set reasonable timeouts for Jest
jest.setTimeout(30000);

// Configure Jest for parallel execution
if (process.env.JEST_WORKER_ID) {
  // Running in parallel mode - adjust timeouts and connection pools
  const workerId = parseInt(process.env.JEST_WORKER_ID, 10);

  // Use different Redis database for each worker to prevent conflicts
  process.env.REDIS_DB = `${workerId}`;

  // Stagger connection initialization to prevent thundering herd
  const initDelay = workerId * 100;
  if (initDelay > 0) {
    jest.setTimeout(35000 + initDelay);
  }
}

// Global error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Global error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
