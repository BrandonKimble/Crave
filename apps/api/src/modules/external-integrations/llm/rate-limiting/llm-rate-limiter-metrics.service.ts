import {
  Injectable,
  Inject,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Counter, Gauge, Histogram } from 'prom-client';
import { LoggerService } from '../../../../shared';
import { MetricsService } from '../../../metrics/metrics.service';
import {
  CentralizedRateLimiter,
  ReservationResult,
} from './centralized-rate-limiter.service';

type LlmRequestOutcome =
  | 'success'
  | 'rate_limit_error'
  | 'rate_limit_abort'
  | 'error';

@Injectable()
export class LlmRateLimiterMetricsService
  implements OnModuleInit, OnModuleDestroy
{
  private logger!: LoggerService;
  private refreshTimer?: NodeJS.Timeout;

  private requestCounter!: Counter<string>;
  private rateLimitErrorCounter!: Counter<string>;
  private requestDurationHistogram!: Histogram<string>;
  private reservationWaitHistogram!: Histogram<string>;
  private scrapeErrorCounter!: Counter<string>;

  private rpmCurrentGauge!: Gauge<string>;
  private rpmSafeGauge!: Gauge<string>;
  private rpmMaxGauge!: Gauge<string>;
  private rpmUtilizationGauge!: Gauge<string>;
  private rpmAvailableCapacityGauge!: Gauge<string>;

  private tpmCurrentGauge!: Gauge<string>;
  private tpmReservedGauge!: Gauge<string>;
  private tpmWindowGauge!: Gauge<string>;
  private tpmSafeGauge!: Gauge<string>;
  private tpmMaxGauge!: Gauge<string>;
  private tpmUtilizationGauge!: Gauge<string>;
  private tpmAvgTokensGauge!: Gauge<string>;
  private tpmProjectedGauge!: Gauge<string>;

  private activeRequestsGauge!: Gauge<string>;
  private reservationsTotalGauge!: Gauge<string>;
  private reservationsConfirmedGauge!: Gauge<string>;
  private reservationsConfirmationRateGauge!: Gauge<string>;
  private reservationsAvgAccuracyGauge!: Gauge<string>;

  private bottleneckGauge!: Gauge<string>;

  constructor(
    private readonly rateLimiter: CentralizedRateLimiter,
    private readonly metricsService: MetricsService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('LlmRateLimiterMetrics');

    this.requestCounter = this.metricsService.getCounter({
      name: 'llm_requests_total',
      help: 'Total LLM requests processed by the SmartLLMProcessor',
      labelNames: ['outcome'],
    });
    this.rateLimitErrorCounter = this.metricsService.getCounter({
      name: 'llm_rate_limit_errors_total',
      help: 'Total LLM rate limit errors encountered (429/quota responses)',
      labelNames: [],
    });
    this.requestDurationHistogram = this.metricsService.getHistogram({
      name: 'llm_request_duration_seconds',
      help: 'End-to-end LLM request duration in seconds (includes reservation wait + processing)',
      labelNames: ['outcome'],
      buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300],
    });
    this.reservationWaitHistogram = this.metricsService.getHistogram({
      name: 'llm_reservation_wait_seconds',
      help: 'Reservation wait time in seconds returned by the centralized rate limiter',
      labelNames: ['guaranteed'],
      buckets: [0, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300],
    });
    this.scrapeErrorCounter = this.metricsService.getCounter({
      name: 'llm_rate_limiter_metrics_scrape_errors_total',
      help: 'Total errors while exporting centralized rate limiter metrics to Prometheus',
      labelNames: [],
    });

    this.rpmCurrentGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_rpm_current',
      help: 'LLM current RPM (reservations in the last minute window)',
      labelNames: [],
    });
    this.rpmSafeGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_rpm_safe',
      help: 'LLM safe RPM (maxRPM * headroom)',
      labelNames: [],
    });
    this.rpmMaxGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_rpm_max',
      help: 'LLM configured max RPM (provider quota)',
      labelNames: [],
    });
    this.rpmUtilizationGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_rpm_utilization_percent',
      help: 'LLM RPM utilization as a percent of safe RPM',
      labelNames: [],
    });
    this.rpmAvailableCapacityGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_rpm_available_capacity',
      help: 'LLM RPM remaining capacity (maxRPM - currentRPM)',
      labelNames: [],
    });

    this.tpmCurrentGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_tpm_current',
      help: 'LLM current TPM (used tokens in last minute)',
      labelNames: [],
    });
    this.tpmReservedGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_tpm_reserved',
      help: 'LLM reserved TPM (reserved tokens in last minute)',
      labelNames: [],
    });
    this.tpmWindowGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_tpm_window_tokens',
      help: 'LLM total tokens in window (used + reserved)',
      labelNames: [],
    });
    this.tpmSafeGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_tpm_safe',
      help: 'LLM safe TPM (maxTPM * headroom)',
      labelNames: [],
    });
    this.tpmMaxGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_tpm_max',
      help: 'LLM configured max TPM (provider quota)',
      labelNames: [],
    });
    this.tpmUtilizationGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_tpm_utilization_percent',
      help: 'LLM TPM utilization as a percent of safe TPM',
      labelNames: [],
    });
    this.tpmAvgTokensGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_avg_tokens_per_request',
      help: 'LLM average tokens per request (based on last-minute usage)',
      labelNames: [],
    });
    this.tpmProjectedGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_projected_tpm',
      help: 'LLM projected TPM if running at max RPM (avgTokensPerRequest * maxRPM)',
      labelNames: [],
    });

    this.activeRequestsGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_active_requests',
      help: 'LLM active request count tracked by centralized limiter',
      labelNames: [],
    });
    this.reservationsTotalGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_total_reservations',
      help: 'Total reservations recorded by the centralized limiter (lifetime within Redis TTL)',
      labelNames: [],
    });
    this.reservationsConfirmedGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_confirmed_requests',
      help: 'Total confirmed requests recorded by the centralized limiter (lifetime within Redis TTL)',
      labelNames: [],
    });
    this.reservationsConfirmationRateGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_confirmation_rate_percent',
      help: 'Percent of reservations that were confirmed',
      labelNames: [],
    });
    this.reservationsAvgAccuracyGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_reservation_accuracy_ms',
      help: 'Average reservation accuracy in milliseconds (abs(now - reservationTime))',
      labelNames: [],
    });

    this.bottleneckGauge = this.metricsService.getGauge({
      name: 'llm_rate_limiter_bottleneck',
      help: 'Current bottleneck type (value=1 for active type)',
      labelNames: ['type'],
    });

    void this.refresh();
    this.refreshTimer = setInterval(() => {
      void this.refresh();
    }, 15000);
  }

  onModuleDestroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  recordReservation(reservation: ReservationResult): void {
    const waitSeconds = Math.max(0, reservation.waitMs) / 1000;
    this.reservationWaitHistogram.observe(
      { guaranteed: reservation.guaranteed ? 'true' : 'false' },
      waitSeconds,
    );
  }

  recordRequestOutcome(outcome: LlmRequestOutcome, durationMs?: number): void {
    if (outcome === 'rate_limit_error') {
      this.rateLimitErrorCounter.inc();
      return;
    }

    this.requestCounter.inc({ outcome });
    if (typeof durationMs === 'number' && Number.isFinite(durationMs)) {
      this.requestDurationHistogram.observe(
        { outcome },
        Math.max(0, durationMs) / 1000,
      );
    }
  }

  private async refresh(): Promise<void> {
    try {
      const snapshot = await this.rateLimiter.getMetrics();
      if ('error' in snapshot) {
        this.scrapeErrorCounter.inc();
        return;
      }

      const rpm = snapshot.rpm;
      const tpm = snapshot.tpm;
      const active = snapshot.active;
      const reservations = snapshot.reservations;
      const optimization = snapshot.optimization;

      if (rpm) {
        this.rpmCurrentGauge.set(rpm.current ?? 0);
        this.rpmSafeGauge.set(rpm.safe ?? 0);
        this.rpmMaxGauge.set(rpm.max ?? 0);
        this.rpmUtilizationGauge.set(rpm.utilizationPercent ?? 0);
        this.rpmAvailableCapacityGauge.set(rpm.availableCapacity ?? 0);
      }

      if (tpm) {
        this.tpmCurrentGauge.set(tpm.current ?? 0);
        this.tpmReservedGauge.set(tpm.reserved ?? 0);
        this.tpmWindowGauge.set(tpm.windowTokens ?? 0);
        this.tpmSafeGauge.set(tpm.safe ?? 0);
        this.tpmMaxGauge.set(tpm.max ?? 0);
        this.tpmUtilizationGauge.set(tpm.utilizationPercent ?? 0);
        this.tpmAvgTokensGauge.set(tpm.avgTokensPerRequest ?? 0);
        this.tpmProjectedGauge.set(tpm.projectedTPM ?? 0);
      }

      if (active) {
        this.activeRequestsGauge.set(active.current ?? 0);
      }

      if (reservations) {
        this.reservationsTotalGauge.set(reservations.total ?? 0);
        this.reservationsConfirmedGauge.set(reservations.confirmed ?? 0);
        this.reservationsConfirmationRateGauge.set(
          reservations.confirmationRate ?? 0,
        );
        this.reservationsAvgAccuracyGauge.set(reservations.avgAccuracyMs ?? 0);
      }

      const bottleneckType = optimization?.currentBottleneck ?? 'none';
      (['none', 'rpm', 'tpm'] as const).forEach((type) => {
        this.bottleneckGauge.set({ type }, type === bottleneckType ? 1 : 0);
      });
    } catch (error) {
      this.scrapeErrorCounter.inc();
      this.logger.debug('Failed to refresh LLM limiter metrics', {
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
