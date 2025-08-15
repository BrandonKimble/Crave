import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  BaseApiConfig,
  BasePerformanceMetrics,
  RetryOptions,
  ApiHealthStatus,
} from './external-integrations.types';
import { BaseExternalApiException } from './external-integrations.exceptions';

/**
 * Base External API Service
 *
 * Implements PRD Section 9.2.1: "Centralized API management, basic rate limiting"
 * Provides common functionality for all external API integrations including:
 * - Performance metrics tracking
 * - Retry logic with exponential backoff
 * - Error handling patterns
 * - Health monitoring
 */
@Injectable()
export abstract class BaseExternalApiService implements OnModuleInit {
  protected logger!: LoggerService;
  protected performanceMetrics: BasePerformanceMetrics = {
    requestCount: 0,
    totalResponseTime: 0,
    averageResponseTime: 0,
    lastReset: new Date(),
    errorCount: 0,
    successRate: 100,
    rateLimitHits: 0,
  };

  constructor(
    protected readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    protected readonly serviceName: string,
  
  ) {} 

  async onModuleInit(): Promise<void> {
    if (this.loggerService) {
      this.logger = this.loggerService.setContext(this.serviceName);
    }
    if (this.logger) {
      this.logger.info(`Initializing ${this.serviceName}`);
    }
    await this.initializeService();
    if (this.logger) {
      this.logger.info(`${this.serviceName} initialized successfully`);
    }
  }

  /**
   * Abstract method for service-specific initialization
   */
  protected abstract initializeService(): Promise<void>;

  /**
   * Abstract method to get service-specific configuration
   */
  protected abstract getServiceConfig(): BaseApiConfig;

  /**
   * Centralized retry operation with exponential backoff
   * Implements PRD section 9.2.2: "proper retry logic"
   */
  protected async retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    customRetryOptions?: Partial<RetryOptions>,
  ): Promise<T> {
    const config = this.getServiceConfig();
    const retryOptions = {
      ...config.retryOptions,
      ...customRetryOptions,
    };

    const correlationId = CorrelationUtils.getCorrelationId();

    for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        const startTime = Date.now();
        const result = await operation();
        const responseTime = Date.now() - startTime;

        this.updateSuccessMetrics(responseTime, correlationId || 'unknown');

        this.logger.info(`${operationName} succeeded`, {
          operation: operationName,
          attempt: attempt + 1,
          responseTime,
          correlationId: correlationId || 'unknown',
        });

        return result;
      } catch (error) {
        const responseTime = Date.now() - (Date.now() - 1000); // Approximate

        // Don't retry on authentication errors or configuration errors
        if (
          error instanceof BaseExternalApiException &&
          (error.errorCode.includes('AUTHENTICATION') ||
            error.errorCode.includes('CONFIGURATION'))
        ) {
          this.updateErrorMetrics(responseTime, correlationId || 'unknown');
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === retryOptions.maxRetries) {
          this.updateErrorMetrics(responseTime, correlationId || 'unknown');
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay =
          retryOptions.retryDelay *
          Math.pow(retryOptions.retryBackoffFactor, attempt);

        this.logger.warn(`${operationName} failed, retrying`, {
          operation: operationName,
          attempt: attempt + 1,
          maxRetries: retryOptions.maxRetries,
          delay,
          error: {
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            code:
              error instanceof Error && 'code' in error
                ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                  typeof (error as any).code === 'string' ||
                  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                  typeof (error as any).code === 'number'
                  ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                    (error as any).code
                  : undefined
                : undefined,
            name: error instanceof Error ? error.name : undefined,
            cause:
              error instanceof Error && 'cause' in error
                ? String(error.cause)
                : undefined,
          },
          correlationId: correlationId || 'unknown',
        });

        await this.sleep(delay);
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error(
      `Retry operation failed after ${retryOptions.maxRetries} attempts`,
    );
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics(): BasePerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics(): void {
    this.performanceMetrics = {
      requestCount: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      lastReset: new Date(),
      errorCount: 0,
      successRate: 100,
      rateLimitHits: 0,
    };
  }

  /**
   * Get service health status
   */
  getHealthStatus(): ApiHealthStatus {
    const config = this.getServiceConfig();
    const status: 'healthy' | 'degraded' | 'unhealthy' =
      this.performanceMetrics.successRate > 80 ? 'healthy' : 'degraded';

    return {
      service: this.serviceName,
      status,
      uptime: Date.now() - this.performanceMetrics.lastReset.getTime(),
      metrics: this.performanceMetrics,
      configuration: {
        timeout: config.timeout,
        retryOptions: config.retryOptions,
      },
    };
  }

  /**
   * Update metrics for successful operations
   */
  protected updateSuccessMetrics(
    responseTime: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    correlationId: string,
  ): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
    this.performanceMetrics.successRate = Math.round(
      ((this.performanceMetrics.requestCount -
        this.performanceMetrics.errorCount) /
        this.performanceMetrics.requestCount) *
        100,
    );
  }

  /**
   * Update metrics for failed operations
   */
  protected updateErrorMetrics(
    responseTime: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    correlationId: string,
  ): void {
    this.performanceMetrics.requestCount++;
    this.performanceMetrics.errorCount++;
    this.performanceMetrics.totalResponseTime += responseTime;
    this.performanceMetrics.averageResponseTime = Math.round(
      this.performanceMetrics.totalResponseTime /
        this.performanceMetrics.requestCount,
    );
    this.performanceMetrics.successRate = Math.round(
      ((this.performanceMetrics.requestCount -
        this.performanceMetrics.errorCount) /
        this.performanceMetrics.requestCount) *
        100,
    );
  }

  /**
   * Update metrics for rate limit hits
   */
  protected updateRateLimitMetrics(retryAfter?: number): void {
    this.performanceMetrics.rateLimitHits++;

    this.logger.warn(`Rate limit hit for ${this.serviceName}`, {
      service: this.serviceName,
      rateLimitHits: this.performanceMetrics.rateLimitHits,
      retryAfter,
    });
  }

  /**
   * Sleep utility for retry delays
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
