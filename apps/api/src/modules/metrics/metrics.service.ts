import { Injectable } from '@nestjs/common';
import {
  Registry,
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Summary,
  CounterConfiguration,
  GaugeConfiguration,
  HistogramConfiguration,
  SummaryConfiguration,
  Metric,
} from 'prom-client';

type MetricKey =
  | `counter:${string}`
  | `gauge:${string}`
  | `histogram:${string}`
  | `summary:${string}`;

@Injectable()
export class MetricsService {
  private readonly registry: Registry;
  private readonly metrics = new Map<MetricKey, Metric<string>>();

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'crave_search_',
    });
  }

  async getMetricsSnapshot(): Promise<string> {
    return this.registry.metrics();
  }

  getCounter(configuration: CounterConfiguration<string>): Counter<string> {
    const key: MetricKey = `counter:${configuration.name}`;
    const existing = this.metrics.get(key);
    if (existing) {
      return existing as Counter<string>;
    }

    const counter = new Counter({
      registers: [this.registry],
      ...configuration,
    });
    this.metrics.set(key, counter);
    return counter;
  }

  getGauge(configuration: GaugeConfiguration<string>): Gauge<string> {
    const key: MetricKey = `gauge:${configuration.name}`;
    const existing = this.metrics.get(key);
    if (existing) {
      return existing as Gauge<string>;
    }

    const gauge = new Gauge({
      registers: [this.registry],
      ...configuration,
    });
    this.metrics.set(key, gauge);
    return gauge;
  }

  getHistogram(
    configuration: HistogramConfiguration<string>,
  ): Histogram<string> {
    const key: MetricKey = `histogram:${configuration.name}`;
    const existing = this.metrics.get(key);
    if (existing) {
      return existing as Histogram<string>;
    }

    const histogram = new Histogram({
      registers: [this.registry],
      ...configuration,
    });
    this.metrics.set(key, histogram);
    return histogram;
  }

  getSummary(configuration: SummaryConfiguration<string>): Summary<string> {
    const key: MetricKey = `summary:${configuration.name}`;
    const existing = this.metrics.get(key);
    if (existing) {
      return existing as Summary<string>;
    }

    const summary = new Summary({
      registers: [this.registry],
      ...configuration,
    });
    this.metrics.set(key, summary);
    return summary;
  }
}
