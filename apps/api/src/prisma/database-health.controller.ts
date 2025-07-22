import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Controller('health')
export class DatabaseHealthController {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Basic database health check endpoint
   * Returns 200 if database is accessible, 503 if not
   */
  @Get('database')
  async checkDatabaseHealth() {
    try {
      const isHealthy = await this.prismaService.performHealthCheck();

      if (!isHealthy) {
        throw new HttpException(
          {
            status: 'unhealthy',
            message: 'Database health check failed',
            timestamp: new Date().toISOString(),
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      return {
        status: 'healthy',
        message: 'Database is accessible',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'unhealthy',
          message: 'Database connection failed',
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Detailed database metrics endpoint for monitoring
   * Returns connection pool metrics and performance data
   */
  @Get('database/metrics')
  getDatabaseMetrics() {
    try {
      const metrics = this.prismaService.getConnectionMetrics();

      return {
        status: 'success',
        timestamp: new Date().toISOString(),
        metrics: {
          connection: {
            totalConnections: metrics.totalConnections,
            activeConnections: metrics.activeConnections,
            connectionErrors: metrics.connectionErrors,
            lastHealthCheck: metrics.lastHealthCheck,
          },
          queries: {
            totalQueries: metrics.totalQueries,
            slowQueries: metrics.slowQueries,
            slowQueryRate:
              metrics.totalQueries > 0
                ? (metrics.slowQueries / metrics.totalQueries) * 100
                : 0,
          },
          pool: {
            maxConnections: metrics.poolConfig.maxConnections,
            minConnections: metrics.poolConfig.minConnections,
            acquireTimeout: metrics.poolConfig.acquireTimeout,
            idleTimeout: metrics.poolConfig.idleTimeout,
            utilization:
              metrics.activeConnections > 0
                ? (metrics.activeConnections /
                    metrics.poolConfig.maxConnections) *
                  100
                : 0,
          },
        },
      };
    } catch (error) {
      throw new HttpException(
        {
          status: 'error',
          message: 'Failed to retrieve database metrics',
          error: (error as Error).message,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Comprehensive health check including connection pool status
   * Used by external monitoring systems
   */
  @Get('database/detailed')
  async getDetailedHealth() {
    try {
      const [healthCheck, metrics] = await Promise.all([
        this.prismaService.performHealthCheck(),
        this.prismaService.getConnectionMetrics(),
      ]);

      const overallStatus = this.determineOverallStatus(healthCheck, metrics);

      return {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checks: {
          connectivity: healthCheck ? 'healthy' : 'unhealthy',
          connectionPool: this.assessConnectionPoolHealth(metrics),
          queryPerformance: this.assessQueryPerformance(metrics),
        },
        metrics: {
          totalConnections: metrics.totalConnections,
          activeConnections: metrics.activeConnections,
          connectionErrors: metrics.connectionErrors,
          totalQueries: metrics.totalQueries,
          slowQueries: metrics.slowQueries,
          poolUtilization:
            metrics.activeConnections > 0
              ? (metrics.activeConnections /
                  metrics.poolConfig.maxConnections) *
                100
              : 0,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: (error as Error).message,
        checks: {
          connectivity: 'unhealthy',
          connectionPool: 'unknown',
          queryPerformance: 'unknown',
        },
      };
    }
  }

  /**
   * Determine overall system health status
   */
  private determineOverallStatus(healthCheck: boolean, metrics: any): string {
    if (!healthCheck) return 'unhealthy';

    const poolUtilization =
      metrics.activeConnections / metrics.poolConfig.maxConnections;
    const errorRate =
      metrics.totalQueries > 0
        ? metrics.connectionErrors / metrics.totalQueries
        : 0;
    const slowQueryRate =
      metrics.totalQueries > 0 ? metrics.slowQueries / metrics.totalQueries : 0;

    if (poolUtilization > 0.9 || errorRate > 0.1 || slowQueryRate > 0.2) {
      return 'degraded';
    }

    return 'healthy';
  }

  /**
   * Assess connection pool health
   */
  private assessConnectionPoolHealth(metrics: any): string {
    const utilization =
      metrics.activeConnections / metrics.poolConfig.maxConnections;

    if (utilization > 0.9) return 'warning'; // High utilization
    if (metrics.connectionErrors > metrics.totalConnections * 0.1)
      return 'warning'; // High error rate

    return 'healthy';
  }

  /**
   * Assess query performance health
   */
  private assessQueryPerformance(metrics: any): string {
    if (metrics.totalQueries === 0) return 'healthy'; // No queries yet

    const slowQueryRate = metrics.slowQueries / metrics.totalQueries;

    if (slowQueryRate > 0.2) return 'warning'; // More than 20% slow queries
    if (slowQueryRate > 0.1) return 'degraded'; // More than 10% slow queries

    return 'healthy';
  }
}
