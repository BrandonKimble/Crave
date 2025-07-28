import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GooglePlacesService } from './google-places.service';
import { LoggerService, CorrelationUtils } from '../../../shared';

@ApiTags('Google Places Health')
@Controller('health/google-places')
export class GooglePlacesHealthController {
  private readonly logger: LoggerService;

  constructor(
    private readonly googlePlacesService: GooglePlacesService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('GooglePlacesHealthController');
  }

  @Get()
  @ApiOperation({ summary: 'Check Google Places service health' })
  @ApiResponse({
    status: 200,
    description: 'Google Places service health status',
  })
  async checkHealth() {
    this.logger.info('Google Places health check requested', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'health_check',
    });

    const connectionTest = await this.googlePlacesService.testConnection();
    const config = this.googlePlacesService.getGooglePlacesConfig();
    const metrics = this.googlePlacesService.getPerformanceMetrics();

    return {
      service: 'Google Places',
      status: connectionTest.status,
      message: connectionTest.message,
      timestamp: new Date().toISOString(),
      config: {
        timeout: config.timeout,
        requestsPerSecond: config.requestsPerSecond,
        defaultRadius: config.defaultRadius,
        retryOptions: config.retryOptions,
      },
      metrics: {
        requestCount: metrics.requestCount,
        averageResponseTime: metrics.averageResponseTime,
        totalApiCalls: metrics.totalApiCalls,
        successRate: metrics.successRate,
        rateLimitHits: metrics.rateLimitHits,
        lastReset: metrics.lastReset.toISOString(),
      },
    };
  }

  @Get('config')
  @ApiOperation({ summary: 'Get Google Places service configuration' })
  @ApiResponse({
    status: 200,
    description:
      'Google Places service configuration (excluding sensitive data)',
  })
  getConfig() {
    this.logger.info('Google Places config requested', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'get_config',
    });

    return {
      service: 'Google Places',
      config: this.googlePlacesService.getGooglePlacesConfig(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get Google Places service performance metrics' })
  @ApiResponse({
    status: 200,
    description: 'Google Places service performance metrics',
  })
  getMetrics() {
    this.logger.info('Google Places metrics requested', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'get_metrics',
    });

    return {
      service: 'Google Places',
      metrics: this.googlePlacesService.getPerformanceMetrics(),
      timestamp: new Date().toISOString(),
    };
  }
}
