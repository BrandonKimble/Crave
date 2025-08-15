import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService, CorrelationUtils } from '../../../shared';

/**
 * Content Retrieval Performance Metrics
 */
export interface ContentRetrievalMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  averagePostsPerRequest: number;
  averageCommentsPerPost: number;
  averageThreadDepth: number;
  totalApiCalls: number;
  rateLimitHits: number;
  lastResetTime: Date;
}

/**
 * Content Retrieval Success Rates
 */
export interface ContentRetrievalSuccessRates {
  overallSuccessRate: number;
  postRetrievalSuccessRate: number;
  commentRetrievalSuccessRate: number;
  validationSuccessRate: number;
  transformationSuccessRate: number;
}

/**
 * Performance Tracking Data Point
 */
export interface PerformanceDataPoint {
  timestamp: Date;
  operationType: 'single_post' | 'batch_posts';
  responseTime: number;
  postsRequested: number;
  postsRetrieved: number;
  totalComments: number;
  apiCallsUsed: number;
  rateLimitHit: boolean;
  success: boolean;
  error?: string;
}

/**
 * Content Retrieval Monitoring Service
 *
 * Monitors and tracks performance metrics for the content retrieval pipeline.
 * Provides insights into success rates, performance trends, and API efficiency.
 */
@Injectable()
export class ContentRetrievalMonitoringService implements OnModuleInit {
  private logger!: LoggerService;
  private metrics: ContentRetrievalMetrics;
  private performanceHistory: PerformanceDataPoint[] = [];
  private readonly maxHistorySize = 1000;

  constructor(
    private readonly loggerService: LoggerService
  ) {} 

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ContentRetrievalMonitoring');
    this.resetMetrics();
  }

  /**
   * Record a content retrieval operation
   */
  recordOperation(
    operationType: 'single_post' | 'batch_posts',
    result: {
      success: boolean;
      responseTime: number;
      postsRequested: number;
      postsRetrieved: number;
      totalComments: number;
      apiCallsUsed: number;
      rateLimitHit: boolean;
      error?: string;
    },
  ): void {
    const dataPoint: PerformanceDataPoint = {
      timestamp: new Date(),
      operationType,
      responseTime: result.responseTime,
      postsRequested: result.postsRequested,
      postsRetrieved: result.postsRetrieved,
      totalComments: result.totalComments,
      apiCallsUsed: result.apiCallsUsed,
      rateLimitHit: result.rateLimitHit,
      success: result.success,
      error: result.error,
    };

    // Add to performance history
    this.performanceHistory.push(dataPoint);

    // Maintain history size limit
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory.shift();
    }

    // Update metrics
    this.updateMetrics(dataPoint);

    // Log performance data
    this.logger.info('Content retrieval operation recorded', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'record_operation',
      operationType,
      success: result.success,
      responseTime: result.responseTime,
      postsRequested: result.postsRequested,
      postsRetrieved: result.postsRetrieved,
      totalComments: result.totalComments,
      apiCallsUsed: result.apiCallsUsed,
      rateLimitHit: result.rateLimitHit,
    });
  }

  /**
   * Update internal metrics based on operation data
   */
  private updateMetrics(dataPoint: PerformanceDataPoint): void {
    this.metrics.totalRequests++;

    if (dataPoint.success) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Update response time average
    const totalResponseTime =
      this.metrics.averageResponseTime * (this.metrics.totalRequests - 1) +
      dataPoint.responseTime;
    this.metrics.averageResponseTime =
      totalResponseTime / this.metrics.totalRequests;

    // Update posts per request average
    const totalPosts =
      this.metrics.averagePostsPerRequest * (this.metrics.totalRequests - 1) +
      dataPoint.postsRetrieved;
    this.metrics.averagePostsPerRequest =
      totalPosts / this.metrics.totalRequests;

    // Update comments per post average (only for successful operations with posts)
    if (dataPoint.success && dataPoint.postsRetrieved > 0) {
      const commentsPerPost =
        dataPoint.totalComments / dataPoint.postsRetrieved;
      const successfulOps = this.metrics.successfulRequests;
      const totalCommentsPerPost =
        this.metrics.averageCommentsPerPost * (successfulOps - 1) +
        commentsPerPost;
      this.metrics.averageCommentsPerPost =
        totalCommentsPerPost / successfulOps;
    }

    this.metrics.totalApiCalls += dataPoint.apiCallsUsed;

    if (dataPoint.rateLimitHit) {
      this.metrics.rateLimitHits++;
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): ContentRetrievalMetrics {
    return { ...this.metrics };
  }

  /**
   * Get success rates analysis
   */
  getSuccessRates(): ContentRetrievalSuccessRates {
    const totalRequests = this.metrics.totalRequests;

    if (totalRequests === 0) {
      return {
        overallSuccessRate: 100,
        postRetrievalSuccessRate: 100,
        commentRetrievalSuccessRate: 100,
        validationSuccessRate: 100,
        transformationSuccessRate: 100,
      };
    }

    const overallSuccessRate =
      (this.metrics.successfulRequests / totalRequests) * 100;

    // Calculate specific success rates from performance history
    const successfulOps = this.performanceHistory.filter((op) => op.success);
    const opsWithPosts = successfulOps.filter((op) => op.postsRetrieved > 0);
    const opsWithComments = successfulOps.filter((op) => op.totalComments > 0);

    const postRetrievalSuccessRate =
      totalRequests > 0 ? (opsWithPosts.length / totalRequests) * 100 : 100;

    const commentRetrievalSuccessRate =
      opsWithPosts.length > 0
        ? (opsWithComments.length / opsWithPosts.length) * 100
        : 100;

    return {
      overallSuccessRate,
      postRetrievalSuccessRate,
      commentRetrievalSuccessRate,
      validationSuccessRate: overallSuccessRate, // Simplified for now
      transformationSuccessRate: overallSuccessRate, // Simplified for now
    };
  }

  /**
   * Get performance trends over time
   */
  getPerformanceTrends(timeWindowMinutes = 60): {
    averageResponseTime: number;
    successRate: number;
    apiCallsPerMinute: number;
    rateLimitHitRate: number;
    dataPoints: number;
  } {
    const cutoffTime = new Date(Date.now() - timeWindowMinutes * 60 * 1000);
    const recentOps = this.performanceHistory.filter(
      (op) => op.timestamp >= cutoffTime,
    );

    if (recentOps.length === 0) {
      return {
        averageResponseTime: 0,
        successRate: 100,
        apiCallsPerMinute: 0,
        rateLimitHitRate: 0,
        dataPoints: 0,
      };
    }

    const successfulOps = recentOps.filter((op) => op.success);
    const rateLimitHits = recentOps.filter((op) => op.rateLimitHit);
    const totalApiCalls = recentOps.reduce(
      (sum, op) => sum + op.apiCallsUsed,
      0,
    );
    const totalResponseTime = recentOps.reduce(
      (sum, op) => sum + op.responseTime,
      0,
    );

    return {
      averageResponseTime: totalResponseTime / recentOps.length,
      successRate: (successfulOps.length / recentOps.length) * 100,
      apiCallsPerMinute: totalApiCalls / timeWindowMinutes,
      rateLimitHitRate: (rateLimitHits.length / recentOps.length) * 100,
      dataPoints: recentOps.length,
    };
  }

  /**
   * Get detailed performance statistics
   */
  getDetailedStats(): {
    metrics: ContentRetrievalMetrics;
    successRates: ContentRetrievalSuccessRates;
    trends: ReturnType<typeof this.getPerformanceTrends>;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
    recommendations: string[];
  } {
    const metrics = this.getMetrics();
    const successRates = this.getSuccessRates();
    const trends = this.getPerformanceTrends();

    // Determine health status
    let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const recommendations: string[] = [];

    if (successRates.overallSuccessRate < 80) {
      healthStatus = 'unhealthy';
      recommendations.push(
        'Overall success rate is below 80% - investigate error patterns',
      );
    } else if (successRates.overallSuccessRate < 95) {
      healthStatus = 'degraded';
      recommendations.push(
        'Success rate could be improved - review failed operations',
      );
    }

    if (trends.rateLimitHitRate > 10) {
      healthStatus = healthStatus === 'healthy' ? 'degraded' : 'unhealthy';
      recommendations.push(
        'High rate limit hit rate - consider increasing delays between requests',
      );
    }

    if (trends.averageResponseTime > 5000) {
      healthStatus = healthStatus === 'healthy' ? 'degraded' : 'unhealthy';
      recommendations.push(
        'High average response time - monitor API performance',
      );
    }

    if (metrics.averageCommentsPerPost < 1) {
      recommendations.push(
        'Low comment retrieval - verify comment fetching is working correctly',
      );
    }

    return {
      metrics,
      successRates,
      trends,
      healthStatus,
      recommendations,
    };
  }

  /**
   * Reset metrics (useful for testing or periodic resets)
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      averagePostsPerRequest: 0,
      averageCommentsPerPost: 0,
      averageThreadDepth: 0,
      totalApiCalls: 0,
      rateLimitHits: 0,
      lastResetTime: new Date(),
    };

    this.logger.info('Content retrieval metrics reset', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'reset_metrics',
      resetTime: this.metrics.lastResetTime.toISOString(),
    });
  }

  /**
   * Export performance history for analysis
   */
  exportPerformanceHistory(limit?: number): PerformanceDataPoint[] {
    const data = limit
      ? this.performanceHistory.slice(-limit)
      : [...this.performanceHistory];

    this.logger.info('Performance history exported', {
      correlationId: CorrelationUtils.getCorrelationId(),
      operation: 'export_performance_history',
      dataPoints: data.length,
      limit,
    });

    return data;
  }
}
