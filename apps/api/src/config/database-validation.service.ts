import { Injectable, OnModuleInit, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseConfig } from './database-config.interface';
import { LoggerService, CorrelationUtils } from '../shared';
import { AppException } from '../shared/exceptions';

export class DatabaseConfigurationError extends AppException {
  readonly errorCode = 'DATABASE_CONFIGURATION_ERROR';
  readonly isOperational = true;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.BAD_REQUEST, { details });
  }
}

@Injectable()
export class DatabaseValidationService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('DatabaseValidationService');
  }

  /**
   * Validates complete database configuration
   * Throws DatabaseConfigurationError if validation fails
   */
  validateDatabaseConfiguration(config: ConfigService): void {
    const dbConfig = config.get<DatabaseConfig>('database');

    if (!dbConfig) {
      throw new DatabaseConfigurationError('Database configuration is missing');
    }

    this.validateConnectionString(dbConfig.url);
    this.validateConnectionPool(dbConfig.connectionPool);
    this.validateQueryConfiguration(dbConfig.query);
    this.validatePerformanceConfiguration(dbConfig.performance);

    if (this.logger) {
      this.logger.info(
        'Database configuration validation completed successfully',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_database_configuration',
        },
      );
    }
  }

  /**
   * Validates database connection string
   */
  private validateConnectionString(url: string): void {
    if (!url) {
      throw new DatabaseConfigurationError(
        'DATABASE_URL is required but not provided',
        {
          hint: 'Set DATABASE_URL environment variable with PostgreSQL connection string',
        },
      );
    }

    if (!url.startsWith('postgresql://') && !url.startsWith('postgres://')) {
      throw new DatabaseConfigurationError(
        'Invalid database URL format - must be PostgreSQL connection string',
        {
          provided: url.substring(0, 20) + '...',
          expected: 'postgresql://...',
        },
      );
    }

    // Validate URL components
    try {
      const urlObj = new URL(url);

      if (!urlObj.hostname) {
        throw new DatabaseConfigurationError(
          'Database hostname is missing from URL',
        );
      }

      if (!urlObj.pathname || urlObj.pathname === '/') {
        throw new DatabaseConfigurationError(
          'Database name is missing from URL',
        );
      }
    } catch (error) {
      if (error instanceof DatabaseConfigurationError) {
        throw error;
      }
      throw new DatabaseConfigurationError('Invalid database URL format', {
        originalError: (error as Error).message,
      });
    }
  }

  /**
   * Validates connection pool configuration
   */
  private validateConnectionPool(
    poolConfig: DatabaseConfig['connectionPool'],
  ): void {
    const { max, min, acquire, idle, evict } = poolConfig;

    if (min < 1) {
      throw new DatabaseConfigurationError(
        'Minimum connection pool size must be at least 1',
        { provided: min, minimum: 1 },
      );
    }

    if (max < min) {
      throw new DatabaseConfigurationError(
        'Maximum connection pool size must be greater than or equal to minimum',
        { max, min },
      );
    }

    if (max > 200) {
      if (this.logger) {
        this.logger.warn('Large connection pool size detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_connection_pool',
          max,
          recommendation: 'Consider scaling considerations',
        });
      }
    }

    if (acquire < 1000) {
      if (this.logger) {
        this.logger.warn('Very short acquire timeout detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_connection_pool',
          acquire,
          warning: 'This may cause connection failures',
        });
      }
    }

    if (idle < 1000) {
      if (this.logger) {
        this.logger.warn('Very short idle timeout detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_connection_pool',
          idle,
          warning: 'This may cause frequent reconnections',
        });
      }
    }

    if (evict < 1000) {
      if (this.logger) {
        this.logger.warn('Very short eviction interval detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_connection_pool',
          evict,
          warning: 'This may impact performance',
        });
      }
    }
  }

  /**
   * Validates query configuration
   */
  private validateQueryConfiguration(
    queryConfig: DatabaseConfig['query'],
  ): void {
    const { timeout, retry } = queryConfig;

    if (timeout < 1000) {
      throw new DatabaseConfigurationError(
        'Query timeout must be at least 1000ms (1 second)',
        { provided: timeout, minimum: 1000 },
      );
    }

    if (timeout > 300000) {
      // 5 minutes
      if (this.logger) {
        this.logger.warn('Very long query timeout detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_query_configuration',
          timeout,
          warning: 'Consider if this is necessary',
        });
      }
    }

    // Validate retry configuration
    if (retry.attempts < 1) {
      throw new DatabaseConfigurationError(
        'Retry attempts must be at least 1',
        { provided: retry.attempts, minimum: 1 },
      );
    }

    if (retry.attempts > 10) {
      if (this.logger) {
        this.logger.warn('High retry attempts detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_query_configuration',
          retryAttempts: retry.attempts,
          warning: 'This may mask underlying issues',
        });
      }
    }

    if (retry.delay < 100) {
      throw new DatabaseConfigurationError(
        'Retry delay must be at least 100ms',
        { provided: retry.delay, minimum: 100 },
      );
    }

    if (retry.factor < 1.0) {
      throw new DatabaseConfigurationError(
        'Retry factor must be at least 1.0',
        { provided: retry.factor, minimum: 1.0 },
      );
    }
  }

  /**
   * Validates performance configuration
   */
  private validatePerformanceConfiguration(
    perfConfig: DatabaseConfig['performance'],
  ): void {
    const { logging } = perfConfig;

    if (logging.slowQueryThreshold < 100) {
      if (this.logger) {
        this.logger.warn('Very low slow query threshold detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_performance_configuration',
          slowQueryThreshold: logging.slowQueryThreshold,
          warning: 'This may generate excessive logs',
        });
      }
    }

    if (logging.slowQueryThreshold > 10000) {
      if (this.logger) {
        this.logger.warn('High slow query threshold detected', {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_performance_configuration',
          slowQueryThreshold: logging.slowQueryThreshold,
          warning: 'You may miss performance issues',
        });
      }
    }
  }

  /**
   * Validates environment-specific configuration consistency
   */
  validateEnvironmentConsistency(config: ConfigService): void {
    const env = process.env.NODE_ENV || 'development';
    const dbConfig = config.get<DatabaseConfig>('database');

    if (!dbConfig) {
      throw new DatabaseConfigurationError(
        'Database configuration is missing for environment consistency check',
      );
    }

    // Environment-specific validation rules
    switch (env) {
      case 'production':
        if (dbConfig.performance.logging.enabled) {
          if (this.logger) {
            this.logger.warn(
              'Detailed logging enabled in production environment',
              {
                correlationId: CorrelationUtils.getCorrelationId(),
                operation: 'validate_environment_consistency',
                environment: 'production',
                warning: 'Consider disabling for performance',
              },
            );
          }
        }
        if (dbConfig.connectionPool.max < 20) {
          if (this.logger) {
            this.logger.warn('Small connection pool detected in production', {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'validate_environment_consistency',
              environment: 'production',
              maxConnections: dbConfig.connectionPool.max,
              warning: 'Consider increasing for better performance',
            });
          }
        }
        break;

      case 'development':
        if (!dbConfig.performance.logging.enabled) {
          if (this.logger) {
            this.logger.warn(
              'Detailed logging disabled in development environment',
              {
                correlationId: CorrelationUtils.getCorrelationId(),
                operation: 'validate_environment_consistency',
                environment: 'development',
                warning: 'Consider enabling for debugging',
              },
            );
          }
        }
        if (dbConfig.connectionPool.max > 20) {
          if (this.logger) {
            this.logger.warn('Large connection pool detected in development', {
              correlationId: CorrelationUtils.getCorrelationId(),
              operation: 'validate_environment_consistency',
              environment: 'development',
              maxConnections: dbConfig.connectionPool.max,
              warning: 'Consider reducing to save resources',
            });
          }
        }
        break;
    }

    if (this.logger) {
      this.logger.info('Environment-specific validation completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'validate_environment_consistency',
        environment: env,
      });
    }
  }
}
