import { Injectable, OnModuleInit, HttpStatus, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseConfig } from './database-config.interface';
import { LoggerService, CorrelationUtils } from '../shared';
import { AppException } from '../shared/exceptions';
import { isDeployedEnv, resolveAppEnv } from '../shared/config/app-env';

export class DatabaseConfigurationError extends AppException {
  readonly errorCode = 'DATABASE_CONFIGURATION_ERROR';

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message, HttpStatus.BAD_REQUEST, { details });
  }
}

/**
 * Validates the database configuration THAT EXISTS.
 *
 * REWRITTEN 2026-08-08. The previous version was 354 lines validating a
 * Sequelize-era configuration Prisma cannot honor — retry factors, eviction
 * intervals, slow-query thresholds — none of it consumed by anything but
 * this validator. Fiction validating fiction, and it was worse than inert:
 * its production posture check warned "connection pool < 20, consider
 * increasing" — arguing AGAINST the correct setting. Prod Postgres has
 * max_connections=100 shared by TWO services plus migrate-at-boot and
 * operator sessions; the incident this rewrite follows was both services
 * running Prisma's 73-connection default into that ceiling. Small pools are
 * the cure here, not the disease.
 *
 * What remains is exactly what is real: the URL is a well-formed Postgres
 * URL, and `max` — the one knob that reaches Prisma (see
 * prisma.service.ts's pinConnectionLimit) — is sane against the ceiling.
 */
@Injectable()
export class DatabaseValidationService implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('DatabaseValidationService');
  }

  validateDatabaseConfiguration(config: ConfigService): void {
    const dbConfig = config.get<DatabaseConfig>('database');

    if (!dbConfig) {
      throw new DatabaseConfigurationError('Database configuration is missing');
    }

    this.validateConnectionString(dbConfig.url);
    this.validateConnectionPool(dbConfig.connectionPool);

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

  private validateConnectionPool(
    poolConfig: DatabaseConfig['connectionPool'],
  ): void {
    const { max } = poolConfig;

    if (!Number.isInteger(max) || max < 1) {
      throw new DatabaseConfigurationError(
        'Connection pool max must be a positive integer',
        { provided: max, minimum: 1 },
      );
    }

    // The ceiling derivation (2026-08-08): max_connections=100, two app
    // services, plus migrate/Timescale/operators. One service asking for
    // more than 40 means the PAIR can exceed 80% of the ceiling — the
    // incident's arithmetic. Warn, don't refuse: a single-service topology
    // or a raised ceiling are legitimate, but they should be loud choices.
    if (max > 40 && this.logger) {
      this.logger.warn(
        'Connection pool max is large for a shared 100-connection ceiling',
        {
          correlationId: CorrelationUtils.getCorrelationId(),
          operation: 'validate_connection_pool',
          max,
          derivation:
            'two services × max must leave headroom for migrate-at-boot and operator sessions',
        },
      );
    }
  }

  /**
   * Environment-posture check. F404 survives: keyed on APP_ENV via
   * isDeployedEnv (staging groups with prod), never NODE_ENV.
   */
  validateEnvironmentConsistency(config: ConfigService): void {
    const appEnv =
      (config.get<string>('appEnv') as
        | 'dev'
        | 'staging'
        | 'prod'
        | undefined) ?? resolveAppEnv();
    const dbConfig = config.get<DatabaseConfig>('database');

    if (!dbConfig) {
      throw new DatabaseConfigurationError(
        'Database configuration is missing for environment consistency check',
      );
    }

    // Deployed envs share one 100-connection database between two services;
    // a laptop shares one local database between one API and every script a
    // session runs. The posture is the same everywhere: SMALL pools are
    // correct, and only an oversized one is worth a warning (handled above).
    // The old per-env branches warned prod pools UNDER 20 to "consider
    // increasing" — deleted as actively harmful advice.
    if (this.logger) {
      this.logger.info('Environment-specific validation completed', {
        correlationId: CorrelationUtils.getCorrelationId(),
        operation: 'validate_environment_consistency',
        environment: isDeployedEnv(appEnv) ? 'production' : 'development',
      });
    }
  }
}
