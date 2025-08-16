import { Controller, Get, Inject, OnModuleInit } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LLMService } from './llm.service';
import { LoggerService, CorrelationUtils } from '../../../shared';

@ApiTags('LLM Health')
@Controller('health/llm')
export class LLMHealthController implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    private readonly llmService: LLMService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('LLMHealthController');
  }

  @Get()
  @ApiOperation({ summary: 'Check LLM service health' })
  @ApiResponse({
    status: 200,
    description: 'LLM service health status',
  })
  async checkHealth() {
    this.logger.info('LLM health check requested', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'health_check',
    });

    const connectionTest = await this.llmService.testConnection();
    const config = this.llmService.getLLMConfig();
    const metrics = this.llmService.getPerformanceMetrics();

    return {
      service: 'LLM',
      status: connectionTest.status,
      message: connectionTest.message,
      timestamp: new Date().toISOString(),
      config: {
        model: config.model,
        timeout: config.timeout,
        maxTokens: config.maxTokens,
        temperature: config.temperature,
      },
      metrics: {
        requestCount: metrics.requestCount,
        averageResponseTime: metrics.averageResponseTime,
        totalTokensUsed: metrics.totalTokensUsed,
        successRate: metrics.successRate,
        lastReset: metrics.lastReset.toISOString(),
      },
    };
  }

  @Get('config')
  @ApiOperation({ summary: 'Get LLM service configuration' })
  @ApiResponse({
    status: 200,
    description: 'LLM service configuration (excluding sensitive data)',
  })
  getConfig() {
    this.logger.info('LLM config requested', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'get_config',
    });

    return {
      service: 'LLM',
      config: this.llmService.getLLMConfig(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Get LLM service performance metrics' })
  @ApiResponse({
    status: 200,
    description: 'LLM service performance metrics',
  })
  getMetrics() {
    this.logger.info('LLM metrics requested', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'get_metrics',
    });

    return {
      service: 'LLM',
      metrics: this.llmService.getPerformanceMetrics(),
      timestamp: new Date().toISOString(),
    };
  }
}
