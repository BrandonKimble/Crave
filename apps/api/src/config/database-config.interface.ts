/**
 * Database configuration interface for type safety
 * Supports production-ready connection pooling and performance tuning
 */
export interface DatabaseConnectionPool {
  max: number;
  min: number;
  acquire: number;
  idle: number;
  evict: number;
  handleDisconnects: boolean;
}

export interface DatabaseRetryConfig {
  attempts: number;
  delay: number;
  factor: number;
}

export interface DatabaseQueryConfig {
  timeout: number;
  retry: DatabaseRetryConfig;
}

export interface DatabasePerformanceConfig {
  preparedStatements: boolean;
  logging: {
    enabled: boolean;
    slowQueryThreshold: number;
  };
}

export interface DatabaseConfig {
  url: string;
  connectionPool: DatabaseConnectionPool;
  query: DatabaseQueryConfig;
  performance: DatabasePerformanceConfig;
}

export interface AppConfig {
  port: number;
  database: DatabaseConfig;
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  [key: string]: any;
}
