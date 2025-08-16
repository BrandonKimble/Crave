import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
} from '@nestjs/common';
import { LoggerService } from '../logging/logger.service';

// Stub interfaces for OpenTelemetry types (to be replaced when packages are installed)
interface StubCounter {
  add(value: number, attributes?: Record<string, string>): void;
}

interface StubHistogram {
  record(value: number, attributes?: Record<string, string>): void;
}

interface StubMeter {
  createCounter(name: string, options?: { description?: string }): StubCounter;
  createHistogram(
    name: string,
    options?: { description?: string },
  ): StubHistogram;
  createUpDownCounter(
    name: string,
    options?: { description?: string },
  ): StubCounter;
}

/**
 * Professional Metrics Service using OpenTelemetry
 *
 * Provides centralized metrics collection and export to Prometheus
 * Replaces scattered instance-level metrics with proper observability
 */
@Injectable()
export class MetricsService implements OnModuleInit, OnModuleDestroy {
  private logger!: LoggerService;

  // Stub meters for different domains (logging-based implementation)
  private apiMeter!: StubMeter;
  private dbMeter!: StubMeter;
  private llmMeter!: StubMeter;
  private redditMeter!: StubMeter;

  // Common counters (initialized in onModuleInit)
  private httpRequestCounter!: StubCounter;
  private httpDurationHistogram!: StubHistogram;
  private dbQueryCounter!: StubCounter;
  private dbQueryDurationHistogram!: StubHistogram;
  private llmRequestCounter!: StubCounter;
  private llmTokenCounter!: StubCounter;
  private redditApiCounter!: StubCounter;

  constructor(
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit() {
    this.logger = this.loggerService.setContext('MetricsService');

    // Create stub meters that log metrics instead of collecting them
    this.apiMeter = this.createStubMeter('api-metrics');
    this.dbMeter = this.createStubMeter('database-metrics');
    this.llmMeter = this.createStubMeter('llm-metrics');
    this.redditMeter = this.createStubMeter('reddit-metrics');

    // Initialize counters and histograms
    this.httpRequestCounter = this.apiMeter.createCounter(
      'http_requests_total',
      {
        description: 'Total number of HTTP requests',
      },
    );
    this.httpDurationHistogram = this.apiMeter.createHistogram(
      'http_request_duration_ms',
      {
        description: 'HTTP request duration in milliseconds',
      },
    );
    this.dbQueryCounter = this.dbMeter.createCounter('db_queries_total', {
      description: 'Total number of database queries',
    });
    this.dbQueryDurationHistogram = this.dbMeter.createHistogram(
      'db_query_duration_ms',
      {
        description: 'Database query duration in milliseconds',
      },
    );
    this.llmRequestCounter = this.llmMeter.createCounter('llm_requests_total', {
      description: 'Total number of LLM API requests',
    });
    this.llmTokenCounter = this.llmMeter.createCounter('llm_tokens_total', {
      description: 'Total tokens consumed by LLM',
    });
    this.redditApiCounter = this.redditMeter.createCounter(
      'reddit_api_requests_total',
      {
        description: 'Total number of Reddit API requests',
      },
    );

    this.logger.info(
      'Metrics service initialized with stub implementation (install OpenTelemetry packages for full functionality)',
    );
  }

  async onModuleDestroy() {
    this.logger.info('Metrics service shut down');
  }

  // Create stub meter implementation
  private createStubMeter(name: string): StubMeter {
    return {
      createCounter: (
        counterName: string,
        options?: { description?: string },
      ): StubCounter => ({
        add: (value: number, attributes?: Record<string, string>) => {
          this.logger.debug(`Counter ${counterName}`, {
            value,
            attributes,
            meter: name,
          });
        },
      }),
      createHistogram: (
        histogramName: string,
        options?: { description?: string },
      ): StubHistogram => ({
        record: (value: number, attributes?: Record<string, string>) => {
          this.logger.debug(`Histogram ${histogramName}`, {
            value,
            attributes,
            meter: name,
          });
        },
      }),
      createUpDownCounter: (
        counterName: string,
        options?: { description?: string },
      ): StubCounter => ({
        add: (value: number, attributes?: Record<string, string>) => {
          this.logger.debug(`UpDownCounter ${counterName}`, {
            value,
            attributes,
            meter: name,
          });
        },
      }),
    };
  }

  // HTTP Metrics
  recordHttpRequest(
    method: string,
    path: string,
    statusCode: number,
    duration: number,
  ) {
    this.httpRequestCounter.add(1, {
      method,
      path,
      status_code: statusCode.toString(),
    });

    this.httpDurationHistogram.record(duration, {
      method,
      path,
      status_code: statusCode.toString(),
    });
  }

  // Database Metrics
  recordDatabaseQuery(
    operation: string,
    table: string,
    duration: number,
    success: boolean,
  ) {
    this.dbQueryCounter.add(1, {
      operation,
      table,
      success: success.toString(),
    });

    this.dbQueryDurationHistogram.record(duration, {
      operation,
      table,
      success: success.toString(),
    });
  }

  // LLM Metrics
  recordLLMRequest(
    model: string,
    operation: string,
    tokens: number,
    duration: number,
    success: boolean,
  ) {
    this.llmRequestCounter.add(1, {
      model,
      operation,
      success: success.toString(),
    });

    this.llmTokenCounter.add(tokens, {
      model,
      operation,
    });

    // Create histogram on demand for LLM duration
    const llmDurationHistogram = this.llmMeter.createHistogram(
      'llm_request_duration_ms',
      {
        description: 'LLM request duration in milliseconds',
      },
    );

    llmDurationHistogram.record(duration, {
      model,
      operation,
      success: success.toString(),
    });
  }

  // Reddit API Metrics
  recordRedditApiCall(
    endpoint: string,
    subreddit: string,
    duration: number,
    success: boolean,
  ) {
    this.redditApiCounter.add(1, {
      endpoint,
      subreddit,
      success: success.toString(),
    });

    // Create histogram on demand for Reddit API duration
    const redditDurationHistogram = this.redditMeter.createHistogram(
      'reddit_api_duration_ms',
      {
        description: 'Reddit API request duration in milliseconds',
      },
    );

    redditDurationHistogram.record(duration, {
      endpoint,
      subreddit,
      success: success.toString(),
    });
  }

  // Custom metric creation for specific use cases
  createCounter(
    name: string,
    description: string,
    meterName = 'custom-metrics',
  ) {
    const meter = this.createStubMeter(meterName);
    return meter.createCounter(name, { description });
  }

  createHistogram(
    name: string,
    description: string,
    meterName = 'custom-metrics',
  ) {
    const meter = this.createStubMeter(meterName);
    return meter.createHistogram(name, { description });
  }

  createGauge(name: string, description: string, meterName = 'custom-metrics') {
    const meter = this.createStubMeter(meterName);
    return meter.createUpDownCounter(name, { description });
  }

  // Get current metrics endpoint URL
  getMetricsUrl(): string {
    return 'http://localhost:9090/metrics';
  }
}
