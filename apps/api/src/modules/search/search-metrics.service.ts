import { Injectable } from '@nestjs/common';
import { Histogram, Counter } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service';

interface SearchMetricsPayload {
  format: 'single_list' | 'dual_list';
  openNow: boolean;
  durationMs: number;
  totalFoodResults: number;
  openNowFilteredOut: number;
}

interface SearchFailurePayload {
  format?: 'single_list' | 'dual_list' | 'unknown';
  openNow: boolean;
  errorName: string;
}

@Injectable()
export class SearchMetricsService {
  private readonly requestCounter: Counter<string>;
  private readonly errorCounter: Counter<string>;
  private readonly durationHistogram: Histogram<string>;
  private readonly resultHistogram: Histogram<string>;
  private readonly openNowFilteredHistogram: Histogram<string>;

  constructor(private readonly metricsService: MetricsService) {
    this.requestCounter = this.metricsService.getCounter({
      name: 'search_requests_total',
      help: 'Total count of search requests processed',
      labelNames: ['format', 'open_now'],
    });

    this.errorCounter = this.metricsService.getCounter({
      name: 'search_errors_total',
      help: 'Total count of search requests that resulted in an error',
      labelNames: ['format', 'open_now', 'error'],
    });

    this.durationHistogram = this.metricsService.getHistogram({
      name: 'search_execution_duration_seconds',
      help: 'Query execution duration in seconds',
      labelNames: ['format', 'open_now'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
    });

    this.resultHistogram = this.metricsService.getHistogram({
      name: 'search_food_results_count',
      help: 'Histogram of food result counts returned per search',
      labelNames: ['format', 'open_now'],
      buckets: [0, 5, 10, 25, 50, 75, 100, 200, 400],
    });

    this.openNowFilteredHistogram = this.metricsService.getHistogram({
      name: 'search_open_now_filtered_count',
      help: 'Number of results removed by open-now filtering',
      labelNames: ['format'],
      buckets: [0, 1, 5, 10, 25, 50, 100, 200],
    });
  }

  recordSearchExecution(payload: SearchMetricsPayload): void {
    const labels = {
      format: payload.format,
      open_now: payload.openNow ? 'true' : 'false',
    };

    this.requestCounter.inc(labels, 1);
    this.durationHistogram.observe(labels, payload.durationMs / 1000);
    this.resultHistogram.observe(labels, payload.totalFoodResults);

    if (payload.openNow) {
      this.openNowFilteredHistogram.observe(
        { format: payload.format },
        payload.openNowFilteredOut,
      );
    }
  }

  recordSearchFailure(payload: SearchFailurePayload): void {
    const labels = {
      format: payload.format ?? 'unknown',
      open_now: payload.openNow ? 'true' : 'false',
      error: payload.errorName,
    };
    this.errorCounter.inc(labels, 1);
  }
}
