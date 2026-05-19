import { Injectable } from '@nestjs/common';
import { Counter, Histogram } from 'prom-client';
import { MetricsService } from '../metrics/metrics.service';

type BootstrapEventPayload = {
  eventType: string;
  sourceProvider: string;
  triggerKind?: string | null;
  stopReason?: string | null;
};

type BootstrapDurationPayload = {
  outcome: string;
  triggerKind?: string | null;
  durationMs: number;
};

@Injectable()
export class MarketBootstrapMetricsService {
  private readonly eventsCounter: Counter<string>;
  private readonly durationHistogram: Histogram<string>;

  constructor(metricsService: MetricsService) {
    this.eventsCounter = metricsService.getCounter({
      name: 'market_bootstrap_events_total',
      help: 'Total count of TomTom market bootstrap lifecycle events',
      labelNames: [
        'event_type',
        'source_provider',
        'trigger_kind',
        'stop_reason',
      ],
    });

    this.durationHistogram = metricsService.getHistogram({
      name: 'market_bootstrap_duration_seconds',
      help: 'TomTom market bootstrap attempt duration in seconds',
      labelNames: ['outcome', 'trigger_kind'],
      buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
    });
  }

  recordEvent(payload: BootstrapEventPayload): void {
    this.eventsCounter.inc(
      {
        event_type: payload.eventType || 'unknown',
        source_provider: payload.sourceProvider || 'unknown',
        trigger_kind: payload.triggerKind || 'unknown',
        stop_reason: payload.stopReason || 'none',
      },
      1,
    );
  }

  recordDuration(payload: BootstrapDurationPayload): void {
    this.durationHistogram.observe(
      {
        outcome: payload.outcome || 'unknown',
        trigger_kind: payload.triggerKind || 'unknown',
      },
      Math.max(0, payload.durationMs) / 1000,
    );
  }
}
