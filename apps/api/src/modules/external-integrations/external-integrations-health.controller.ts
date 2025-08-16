import { Controller, Get, OnModuleInit, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LoggerService, CorrelationUtils } from '../../shared';
import { GooglePlacesService } from './google-places/google-places.service';
import { LLMService } from './llm/llm.service';
import { RedditService } from './reddit/reddit.service';
import { RateLimitCoordinatorService } from './shared/rate-limit-coordinator.service';
import {
  ApiHealthStatus,
  RateLimitStatus,
} from './shared/external-integrations.types';

/**
 * External Integrations Health Controller
 *
 * Implements PRD Section 9.2.2: "External integrations module handles API errors gracefully"
 * Provides centralized health monitoring for all external API services
 */
@ApiTags('Health')
@Controller('health/external-integrations')
export class ExternalIntegrationsHealthController implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly googlePlacesService: GooglePlacesService,
    private readonly llmService: LLMService,
    private readonly redditService: RedditService,
    private readonly rateLimitCoordinator: RateLimitCoordinatorService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext(
      'ExternalIntegrationsHealthController',
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get overall external integrations health status' })
  @ApiResponse({
    status: 200,
    description: 'Health status retrieved successfully',
  })
  async getOverallHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    services: ApiHealthStatus[];
    rateLimits: RateLimitStatus[];
    timestamp: string;
  }> {
    const correlationId = CorrelationUtils.getCorrelationId();

    this.logger.debug('Retrieving overall external integrations health', {
      operation: 'get_overall_health',
      correlationId,
    });

    try {
      // Get health status from all services
      const services: ApiHealthStatus[] = [
        await this.getServiceHealth('google-places', () =>
          this.googlePlacesService.getHealthStatus(),
        ),
        await this.getServiceHealth('llm', () =>
          this.llmService.getHealthStatus(),
        ),
        await this.getServiceHealth('reddit', () =>
          this.redditService.getHealthStatus(),
        ),
      ];

      // Get rate limiting status
      const rateLimits = this.rateLimitCoordinator.getAllStatuses();

      // Determine overall status
      const overallStatus = this.determineOverallStatus(services);

      const response = {
        status: overallStatus,
        services,
        rateLimits,
        timestamp: new Date().toISOString(),
      };

      this.logger.info('Overall health status retrieved', {
        operation: 'get_overall_health',
        status: overallStatus,
        serviceCount: services.length,
        correlationId,
      });

      return response;
    } catch (error) {
      this.logger.error('Failed to retrieve overall health status', {
        operation: 'get_overall_health',
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });

      return {
        status: 'unhealthy',
        services: [],
        rateLimits: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('google-places')
  @ApiOperation({ summary: 'Get Google Places service health status' })
  @ApiResponse({
    status: 200,
    description: 'Google Places health status retrieved',
  })
  async getGooglePlacesHealth(): Promise<ApiHealthStatus> {
    return this.getServiceHealth('google-places', () =>
      this.googlePlacesService.getHealthStatus(),
    );
  }

  @Get('llm')
  @ApiOperation({ summary: 'Get LLM service health status' })
  @ApiResponse({ status: 200, description: 'LLM health status retrieved' })
  async getLLMHealth(): Promise<ApiHealthStatus> {
    return this.getServiceHealth('llm', () =>
      this.llmService.getHealthStatus(),
    );
  }

  @Get('reddit')
  @ApiOperation({ summary: 'Get Reddit service health status' })
  @ApiResponse({ status: 200, description: 'Reddit health status retrieved' })
  async getRedditHealth(): Promise<ApiHealthStatus> {
    return this.getServiceHealth('reddit', () =>
      this.redditService.getHealthStatus(),
    );
  }

  @Get('rate-limits')
  @ApiOperation({ summary: 'Get rate limiting status for all services' })
  @ApiResponse({ status: 200, description: 'Rate limiting status retrieved' })
  getRateLimitStatus(): {
    services: RateLimitStatus[];
    timestamp: string;
  } {
    const correlationId = CorrelationUtils.getCorrelationId();

    this.logger.debug('Retrieving rate limit status', {
      operation: 'get_rate_limit_status',
      correlationId,
    });

    const services = this.rateLimitCoordinator.getAllStatuses();

    return {
      services,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get health status from a service with error handling
   */
  private async getServiceHealth(
    serviceName: string,
    healthFunction: () => Promise<ApiHealthStatus> | ApiHealthStatus,
  ): Promise<ApiHealthStatus> {
    const correlationId = CorrelationUtils.getCorrelationId();

    try {
      const healthStatus = await healthFunction();

      this.logger.debug(`Health status retrieved for ${serviceName}`, {
        service: serviceName,
        status: healthStatus.status,
        correlationId,
      });

      return healthStatus;
    } catch (error) {
      this.logger.error(`Failed to get health status for ${serviceName}`, {
        service: serviceName,
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });

      return {
        service: serviceName,
        status: 'unhealthy',
        uptime: 0,
        metrics: {
          requestCount: 0,
          totalResponseTime: 0,
          averageResponseTime: 0,
          lastReset: new Date(),
          errorCount: 1,
          successRate: 0,
          rateLimitHits: 0,
        },
        configuration: {
          timeout: 0,
          retryOptions: {
            maxRetries: 0,
            retryDelay: 0,
            retryBackoffFactor: 0,
          },
        },
        lastError: {
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date(),
          count: 1,
        },
      };
    }
  }

  /**
   * Determine overall health status based on individual service statuses
   */
  private determineOverallStatus(
    services: ApiHealthStatus[],
  ): 'healthy' | 'degraded' | 'unhealthy' {
    if (services.length === 0) return 'unhealthy';

    const degradedServices = services.filter(
      (s) => s.status === 'degraded',
    ).length;
    const unhealthyServices = services.filter(
      (s) => s.status === 'unhealthy',
    ).length;

    // If any service is unhealthy, overall is degraded (not unhealthy to allow partial operation)
    if (unhealthyServices > 0) return 'degraded';

    // If any service is degraded, overall is degraded
    if (degradedServices > 0) return 'degraded';

    // All services are healthy
    return 'healthy';
  }
}
