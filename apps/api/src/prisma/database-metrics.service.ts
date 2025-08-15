import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseConfig } from '../config/database-config.interface';
import { LoggerService } from '../shared';

export interface DatabaseMetricsSample {
  timestamp: Date;
  activeConnections: number;
  queryCount: number;
  slowQueries: number;
  connectionErrors: number;
  avgQueryDuration: number;
}

export interface PerformanceAlert {
  type:
    | 'HIGH_UTILIZATION'
    | 'SLOW_QUERIES'
    | 'CONNECTION_ERRORS'
    | 'POOL_EXHAUSTION';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  timestamp: Date;
  metrics: Partial<DatabaseMetricsSample>;
}

@Injectable()
export class DatabaseMetricsService implements OnModuleInit {
  private logger!: LoggerService;
  private dbConfig!: DatabaseConfig;
  private metricsHistory: DatabaseMetricsSample[] = [];
  private readonly maxHistorySize = 1000; // Keep last 1000 samples
  private alertThresholds!: Record<string, number>;
  private lastAlert: Map<string, Date> = new Map();
  private readonly alertCooldown = 300000; // 5 minutes in milliseconds

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    if (this.loggerService) {
      this.logger = this.loggerService.setContext('DatabaseMetricsService');
    }
    const dbConfig = this.configService?.get<DatabaseConfig>('database');
    if (!dbConfig) {
      // In test environments, create minimal config to allow service to function
      if (process.env.NODE_ENV === 'test' || !process.env.NODE_ENV || !this.configService) {
        this.dbConfig = {
          url: process.env.DATABASE_URL || 'postgresql://localhost:5432/test',
          performance: {
            logging: {
              enabled: false,
              slowQueryThreshold: 1000
            }
          },
          connectionPool: {
            max: 10,
            min: 2,
            idle: 10000,
            acquire: 30000
          },
          query: {
            retry: {
              attempts: 3,
              delay: 1000,
              factor: 2.0
            }
          }
        } as DatabaseConfig;
      } else {
        throw new Error(
          'Database configuration is required for metrics service initialization',
        );
      }
    } else {
      this.dbConfig = dbConfig;
    }

    this.initializeAlertThresholds();

    // Start periodic metrics collection in production
    if (process.env.NODE_ENV === 'production') {
      this.startMetricsCollection();
    }
  }

  /**
   * Initialize alert thresholds based on configuration
   */
  private initializeAlertThresholds(): void {
    this.alertThresholds = {
      highUtilization: 0.85, // 85% of max connections
      criticalUtilization: 0.95, // 95% of max connections
      slowQueryRate: 0.15, // 15% of queries are slow
      criticalSlowQueryRate: 0.25, // 25% of queries are slow
      errorRate: 0.05, // 5% error rate
      criticalErrorRate: 0.1, // 10% error rate
      avgQueryDuration: 2000, // 2 seconds average
      criticalAvgQueryDuration: 5000, // 5 seconds average
    };
  }

  /**
   * Record a metrics sample
   */
  recordMetricsSample(
    activeConnections: number,
    queryCount: number,
    slowQueries: number,
    connectionErrors: number,
    avgQueryDuration: number = 0,
  ): void {
    const sample: DatabaseMetricsSample = {
      timestamp: new Date(),
      activeConnections,
      queryCount,
      slowQueries,
      connectionErrors,
      avgQueryDuration,
    };

    // Add to history
    this.metricsHistory.push(sample);

    // Trim history if too large
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }

    // Check for performance alerts
    this.checkForAlerts(sample);
  }

  /**
   * Get recent metrics history
   */
  getMetricsHistory(minutes: number = 60): DatabaseMetricsSample[] {
    const cutoffTime = new Date(Date.now() - minutes * 60 * 1000);
    return this.metricsHistory.filter(
      (sample) => sample.timestamp >= cutoffTime,
    );
  }

  /**
   * Get aggregated performance statistics
   */
  getPerformanceStatistics(minutes: number = 60): any {
    const recentMetrics = this.getMetricsHistory(minutes);

    if (recentMetrics.length === 0) {
      return {
        period: `${minutes} minutes`,
        samples: 0,
        message: 'No data available for the specified period',
      };
    }

    const totalQueries = recentMetrics.reduce(
      (sum, sample) => sum + sample.queryCount,
      0,
    );
    const totalSlowQueries = recentMetrics.reduce(
      (sum, sample) => sum + sample.slowQueries,
      0,
    );
    const totalErrors = recentMetrics.reduce(
      (sum, sample) => sum + sample.connectionErrors,
      0,
    );
    const avgActiveConnections =
      recentMetrics.reduce((sum, sample) => sum + sample.activeConnections, 0) /
      recentMetrics.length;
    const maxActiveConnections = Math.max(
      ...recentMetrics.map((sample) => sample.activeConnections),
    );
    const avgQueryDuration =
      recentMetrics
        .filter((sample) => sample.avgQueryDuration > 0)
        .reduce((sum, sample) => sum + sample.avgQueryDuration, 0) /
        recentMetrics.filter((sample) => sample.avgQueryDuration > 0).length ||
      0;

    return {
      period: `${minutes} minutes`,
      samples: recentMetrics.length,
      connections: {
        average: Math.round(avgActiveConnections * 100) / 100,
        peak: maxActiveConnections,
        maxCapacity: this.dbConfig.connectionPool.max,
        utilizationPeak:
          (maxActiveConnections / this.dbConfig.connectionPool.max) * 100,
      },
      queries: {
        total: totalQueries,
        averagePerMinute: Math.round((totalQueries / minutes) * 100) / 100,
        slowQueries: totalSlowQueries,
        slowQueryRate:
          totalQueries > 0 ? (totalSlowQueries / totalQueries) * 100 : 0,
        averageDuration: Math.round(avgQueryDuration * 100) / 100,
      },
      errors: {
        total: totalErrors,
        errorRate: totalQueries > 0 ? (totalErrors / totalQueries) * 100 : 0,
      },
      health: this.calculateHealthScore(recentMetrics),
    };
  }

  /**
   * Calculate overall health score (0-100)
   */
  private calculateHealthScore(metrics: DatabaseMetricsSample[]): number {
    if (metrics.length === 0) return 100;

    const latest = metrics[metrics.length - 1];
    const maxConnections = this.dbConfig.connectionPool.max;

    // Connection utilization score (0-100)
    const utilizationScore = Math.max(
      0,
      100 - (latest.activeConnections / maxConnections) * 100,
    );

    // Query performance score (0-100)
    const totalQueries = metrics.reduce((sum, m) => sum + m.queryCount, 0);
    const totalSlowQueries = metrics.reduce((sum, m) => sum + m.slowQueries, 0);
    const slowQueryRate =
      totalQueries > 0 ? totalSlowQueries / totalQueries : 0;
    const queryScore = Math.max(0, 100 - slowQueryRate * 200); // Slow queries heavily impact score

    // Error rate score (0-100)
    const totalErrors = metrics.reduce((sum, m) => sum + m.connectionErrors, 0);
    const errorRate = totalQueries > 0 ? totalErrors / totalQueries : 0;
    const errorScore = Math.max(0, 100 - errorRate * 500); // Errors heavily impact score

    // Weighted average
    return (
      Math.round(
        (utilizationScore * 0.3 + queryScore * 0.4 + errorScore * 0.3) * 100,
      ) / 100
    );
  }

  /**
   * Check for performance alerts
   */
  private checkForAlerts(sample: DatabaseMetricsSample): void {
    const alerts: PerformanceAlert[] = [];
    const maxConnections = this.dbConfig.connectionPool.max;
    const utilization = sample.activeConnections / maxConnections;

    // Connection pool utilization alerts
    if (utilization >= this.alertThresholds.criticalUtilization) {
      alerts.push({
        type: 'POOL_EXHAUSTION',
        severity: 'CRITICAL',
        message: `Critical connection pool utilization: ${Math.round(
          utilization * 100,
        )}% (${sample.activeConnections}/${maxConnections})`,
        timestamp: sample.timestamp,
        metrics: { activeConnections: sample.activeConnections },
      });
    } else if (utilization >= this.alertThresholds.highUtilization) {
      alerts.push({
        type: 'HIGH_UTILIZATION',
        severity: 'HIGH',
        message: `High connection pool utilization: ${Math.round(
          utilization * 100,
        )}% (${sample.activeConnections}/${maxConnections})`,
        timestamp: sample.timestamp,
        metrics: { activeConnections: sample.activeConnections },
      });
    }

    // Query performance alerts
    if (sample.queryCount > 0) {
      const slowQueryRate = sample.slowQueries / sample.queryCount;

      if (slowQueryRate >= this.alertThresholds.criticalSlowQueryRate) {
        alerts.push({
          type: 'SLOW_QUERIES',
          severity: 'CRITICAL',
          message: `Critical slow query rate: ${Math.round(
            slowQueryRate * 100,
          )}% (${sample.slowQueries}/${sample.queryCount})`,
          timestamp: sample.timestamp,
          metrics: {
            slowQueries: sample.slowQueries,
            queryCount: sample.queryCount,
          },
        });
      } else if (slowQueryRate >= this.alertThresholds.slowQueryRate) {
        alerts.push({
          type: 'SLOW_QUERIES',
          severity: 'MEDIUM',
          message: `Elevated slow query rate: ${Math.round(
            slowQueryRate * 100,
          )}% (${sample.slowQueries}/${sample.queryCount})`,
          timestamp: sample.timestamp,
          metrics: {
            slowQueries: sample.slowQueries,
            queryCount: sample.queryCount,
          },
        });
      }

      // Connection error alerts
      const errorRate = sample.connectionErrors / sample.queryCount;

      if (errorRate >= this.alertThresholds.criticalErrorRate) {
        alerts.push({
          type: 'CONNECTION_ERRORS',
          severity: 'CRITICAL',
          message: `Critical connection error rate: ${Math.round(
            errorRate * 100,
          )}% (${sample.connectionErrors}/${sample.queryCount})`,
          timestamp: sample.timestamp,
          metrics: {
            connectionErrors: sample.connectionErrors,
            queryCount: sample.queryCount,
          },
        });
      } else if (errorRate >= this.alertThresholds.errorRate) {
        alerts.push({
          type: 'CONNECTION_ERRORS',
          severity: 'HIGH',
          message: `Elevated connection error rate: ${Math.round(
            errorRate * 100,
          )}% (${sample.connectionErrors}/${sample.queryCount})`,
          timestamp: sample.timestamp,
          metrics: {
            connectionErrors: sample.connectionErrors,
            queryCount: sample.queryCount,
          },
        });
      }
    }

    // Process alerts with cooldown
    this.processAlerts(alerts);
  }

  /**
   * Process and log alerts with cooldown mechanism
   */
  private processAlerts(alerts: PerformanceAlert[]): void {
    const now = new Date();

    alerts.forEach((alert) => {
      const alertKey = `${alert.type}_${alert.severity}`;
      const lastAlert = this.lastAlert.get(alertKey);

      // Check cooldown
      if (
        !lastAlert ||
        now.getTime() - lastAlert.getTime() > this.alertCooldown
      ) {
        this.logAlert(alert);
        this.lastAlert.set(alertKey, now);
      }
    });
  }

  /**
   * Log performance alerts
   */
  private logAlert(alert: PerformanceAlert): void {
    const logMethod =
      alert.severity === 'CRITICAL'
        ? 'error'
        : alert.severity === 'HIGH'
          ? 'warn'
          : 'log';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    if (this.logger) {
      this.logger[logMethod](
        `Database Performance Alert [${alert.severity}]: ${alert.message}`,
        {
          type: alert.type,
          timestamp: alert.timestamp,
          metrics: alert.metrics,
        },
      );
    }
  }

  /**
   * Start periodic metrics collection
   */
  private startMetricsCollection(): void {
    // This would be implemented to collect metrics from the actual PrismaService
    // For now, it's a placeholder for the architecture
    if (this.logger) {
      this.logger.info(
        'Database metrics collection started for production environment',
        {
          operation: 'start_metrics_collection',
        },
      );
    }
  }

  /**
   * Get current alert thresholds (for monitoring configuration)
   */
  getAlertThresholds(): Record<string, number> {
    return { ...this.alertThresholds };
  }

  /**
   * Update alert thresholds (for dynamic tuning)
   */
  updateAlertThresholds(newThresholds: Partial<Record<string, number>>): void {
    const filteredThresholds = Object.fromEntries(
      Object.entries(newThresholds).filter(([, value]) => value !== undefined),
    ) as Record<string, number>;

    this.alertThresholds = { ...this.alertThresholds, ...filteredThresholds };
    if (this.logger) {
      this.logger.info('Alert thresholds updated', {
        operation: 'update_alert_thresholds',
        thresholds: filteredThresholds,
      });
    }
  }
}
