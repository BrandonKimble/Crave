import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import { ProcessingMetrics } from './stream-processor.service';

/**
 * Performance metrics tracking interface
 */
export interface StreamProcessingMetrics extends ProcessingMetrics {
  filePath: string;
  fileType: 'comments' | 'submissions';
  subreddit: string;
  startTime: Date;
  endTime: Date;
}

export interface AggregatedMetrics {
  totalFiles: number;
  totalLines: number;
  totalValidLines: number;
  totalErrorLines: number;
  totalProcessingTime: number;
  averageProcessingSpeed: number; // lines per second
  memoryEfficiency: number; // percentage
  errorRate: number; // percentage
  subredditBreakdown: Record<
    string,
    {
      files: number;
      lines: number;
      validLines: number;
      processingTime: number;
    }
  >;
}

/**
 * Processing Metrics Service
 *
 * Implements PRD requirement: "Basic performance metrics are captured (processing speed, memory usage)"
 * Provides comprehensive performance monitoring for stream processing operations
 */
@Injectable()
export class ProcessingMetricsService {
  private readonly logger: LoggerService;
  private readonly metrics: StreamProcessingMetrics[] = [];

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.setContext('ProcessingMetrics');
  }

  /**
   * Record processing metrics for a completed file
   */
  recordFileMetrics(
    filePath: string,
    fileType: 'comments' | 'submissions',
    subreddit: string,
    startTime: Date,
    endTime: Date,
    processingMetrics: ProcessingMetrics,
  ): void {
    const fileMetrics: StreamProcessingMetrics = {
      ...processingMetrics,
      filePath,
      fileType,
      subreddit,
      startTime,
      endTime,
    };

    this.metrics.push(fileMetrics);

    // Log individual file metrics
    this.logger.info('File processing metrics recorded', {
      subreddit,
      fileType,
      totalLines: processingMetrics.totalLines,
      validLines: processingMetrics.validLines,
      errorLines: processingMetrics.errorLines,
      processingTimeMs: processingMetrics.processingTime,
      processingSpeed: this.calculateProcessingSpeed(processingMetrics),
      memoryUsageMB: {
        initial: Math.round(
          processingMetrics.memoryUsage.initial / 1024 / 1024,
        ),
        peak: Math.round(processingMetrics.memoryUsage.peak / 1024 / 1024),
        final: Math.round(processingMetrics.memoryUsage.final / 1024 / 1024),
      },
      avgLineTimeMs:
        Math.round(processingMetrics.averageLineProcessingTime * 100) / 100,
    });

    // Performance analysis
    this.analyzePerformance(fileMetrics);
  }

  /**
   * Get aggregated metrics across all processed files
   */
  getAggregatedMetrics(): AggregatedMetrics {
    if (this.metrics.length === 0) {
      return {
        totalFiles: 0,
        totalLines: 0,
        totalValidLines: 0,
        totalErrorLines: 0,
        totalProcessingTime: 0,
        averageProcessingSpeed: 0,
        memoryEfficiency: 0,
        errorRate: 0,
        subredditBreakdown: {},
      };
    }

    const totalLines = this.metrics.reduce((sum, m) => sum + m.totalLines, 0);
    const totalValidLines = this.metrics.reduce(
      (sum, m) => sum + m.validLines,
      0,
    );
    const totalErrorLines = this.metrics.reduce(
      (sum, m) => sum + m.errorLines,
      0,
    );
    const totalProcessingTime = this.metrics.reduce(
      (sum, m) => sum + m.processingTime,
      0,
    );

    // Calculate subreddit breakdown
    const subredditBreakdown: Record<
      string,
      {
        files: number;
        lines: number;
        validLines: number;
        processingTime: number;
      }
    > = {};

    this.metrics.forEach((metric) => {
      if (!subredditBreakdown[metric.subreddit]) {
        subredditBreakdown[metric.subreddit] = {
          files: 0,
          lines: 0,
          validLines: 0,
          processingTime: 0,
        };
      }

      subredditBreakdown[metric.subreddit].files++;
      subredditBreakdown[metric.subreddit].lines += metric.totalLines;
      subredditBreakdown[metric.subreddit].validLines += metric.validLines;
      subredditBreakdown[metric.subreddit].processingTime +=
        metric.processingTime;
    });

    return {
      totalFiles: this.metrics.length,
      totalLines,
      totalValidLines,
      totalErrorLines,
      totalProcessingTime,
      averageProcessingSpeed:
        totalProcessingTime > 0 ? totalLines / (totalProcessingTime / 1000) : 0,
      memoryEfficiency: this.calculateMemoryEfficiency(),
      errorRate: totalLines > 0 ? (totalErrorLines / totalLines) * 100 : 0,
      subredditBreakdown,
    };
  }

  /**
   * Get metrics for a specific subreddit
   */
  getSubredditMetrics(subreddit: string): StreamProcessingMetrics[] {
    return this.metrics.filter((m) => m.subreddit === subreddit);
  }

  /**
   * Get performance summary report
   */
  getPerformanceSummary(): {
    overall: string;
    recommendations: string[];
    warnings: string[];
  } {
    const aggregated = this.getAggregatedMetrics();
    const recommendations: string[] = [];
    const warnings: string[] = [];

    // Analyze processing speed
    if (aggregated.averageProcessingSpeed < 1000) {
      warnings.push(
        `Processing speed is below optimal (${Math.round(aggregated.averageProcessingSpeed)} lines/sec)`,
      );
      recommendations.push(
        'Consider increasing batch size or optimizing processing logic',
      );
    }

    // Analyze error rate
    if (aggregated.errorRate > 5) {
      warnings.push(
        `High error rate detected (${aggregated.errorRate.toFixed(2)}%)`,
      );
      recommendations.push('Review data validation and error handling logic');
    }

    // Analyze memory efficiency
    if (aggregated.memoryEfficiency < 80) {
      warnings.push(
        `Memory efficiency below optimal (${aggregated.memoryEfficiency.toFixed(1)}%)`,
      );
      recommendations.push(
        'Consider optimizing memory usage or reducing batch sizes',
      );
    }

    // Overall assessment
    let overall = 'Good';
    if (warnings.length > 2) {
      overall = 'Needs Improvement';
    } else if (warnings.length > 0) {
      overall = 'Fair';
    } else if (
      aggregated.averageProcessingSpeed > 5000 &&
      aggregated.errorRate < 1
    ) {
      overall = 'Excellent';
    }

    return {
      overall,
      recommendations,
      warnings,
    };
  }

  /**
   * Reset all metrics (useful for testing)
   */
  reset(): void {
    this.metrics.length = 0;
    this.logger.info('Processing metrics reset');
  }

  /**
   * Get raw metrics data
   */
  getRawMetrics(): StreamProcessingMetrics[] {
    return [...this.metrics];
  }

  /**
   * Calculate processing speed (lines per second)
   */
  private calculateProcessingSpeed(metrics: ProcessingMetrics): number {
    if (metrics.processingTime === 0) return 0;
    return (
      Math.round((metrics.totalLines / (metrics.processingTime / 1000)) * 100) /
      100
    );
  }

  /**
   * Calculate memory efficiency percentage
   */
  private calculateMemoryEfficiency(): number {
    if (this.metrics.length === 0) return 0;

    const avgPeakMemory =
      this.metrics.reduce((sum, m) => sum + m.memoryUsage.peak, 0) /
      this.metrics.length;

    const avgInitialMemory =
      this.metrics.reduce((sum, m) => sum + m.memoryUsage.initial, 0) /
      this.metrics.length;

    // Memory efficiency = how close final memory is to initial memory
    // Higher percentage means better cleanup
    const memoryGrowthRatio = avgPeakMemory / avgInitialMemory;
    return Math.max(0, 100 - (memoryGrowthRatio - 1) * 50);
  }

  /**
   * Analyze individual file performance and log insights
   */
  private analyzePerformance(metrics: StreamProcessingMetrics): void {
    const processingSpeed = this.calculateProcessingSpeed(metrics);
    const memoryGrowth =
      (metrics.memoryUsage.peak / metrics.memoryUsage.initial - 1) * 100;
    const errorRate = (metrics.errorLines / metrics.totalLines) * 100;

    // Performance insights
    const insights: string[] = [];

    if (processingSpeed > 10000) {
      insights.push('Excellent processing speed');
    } else if (processingSpeed < 1000) {
      insights.push('Processing speed below optimal');
    }

    if (errorRate < 1) {
      insights.push('Low error rate - good data quality');
    } else if (errorRate > 5) {
      insights.push('High error rate - review validation logic');
    }

    if (memoryGrowth < 50) {
      insights.push('Good memory efficiency');
    } else if (memoryGrowth > 200) {
      insights.push('High memory growth - consider optimizing');
    }

    if (insights.length > 0) {
      this.logger.info('Performance analysis', {
        subreddit: metrics.subreddit,
        fileType: metrics.fileType,
        insights,
        processingSpeed,
        errorRate: Math.round(errorRate * 100) / 100,
        memoryGrowthPercent: Math.round(memoryGrowth * 100) / 100,
      });
    }
  }
}
