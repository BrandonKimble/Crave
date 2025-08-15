/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-unsafe-call, @typescript-eslint/require-await, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-member-access */
// Reason: Service integration with OS monitoring, Promise callbacks, and dynamic imports

import { Injectable, OnModuleInit } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import {
  ResourceMonitoringConfig,
  ResourceUsageStats,
} from './batch-processing.types';
import { BatchProcessingExceptionFactory } from './batch-processing.exceptions';

/**
 * Resource Monitoring Service
 *
 * Implements PRD Section 5.1.1 requirement for resource monitoring and automatic memory management
 * to prevent memory overload and maintain system stability during large dataset processing.
 *
 * Key responsibilities:
 * - Monitor memory usage and system performance
 * - Detect memory pressure and trigger warnings
 * - Provide resource usage statistics for optimization
 * - Enable automatic resource management during batch processing
 */
@Injectable()
export class ResourceMonitoringService implements OnModuleInit {
  private logger!: LoggerService;
  private activeMonitors = new Map<string, NodeJS.Timeout>();
  private monitoringConfigs = new Map<string, ResourceMonitoringConfig>();
  private resourceStats = new Map<string, ResourceUsageStats>();

  constructor(
    private readonly loggerService: LoggerService
  ) {} 

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ResourceMonitoring');
  }

  /**
   * Start resource monitoring for a processing job
   * Implements PRD requirement: Resource monitoring prevents memory overload
   *
   * @param jobId Unique job identifier
   * @param config Monitoring configuration
   */
  async startMonitoring(
    jobId: string,
    config: ResourceMonitoringConfig,
  ): Promise<void> {
    this.logger.info('Starting resource monitoring', {
      jobId,
      config: {
        memoryThreshold: Math.round(config.memoryThreshold / 1024 / 1024),
        checkInterval: config.checkInterval,
        enableCpuMonitoring: config.enableCpuMonitoring,
      },
    });

    try {
      // Validate configuration
      this.validateMonitoringConfig(config);

      // Store configuration
      this.monitoringConfigs.set(jobId, config);

      // Initialize baseline stats
      const initialStats = await this.collectResourceStats(jobId);
      this.resourceStats.set(jobId, initialStats);

      // Start monitoring timer
      const monitorTimer = setInterval(async () => {
        try {
          await this.performResourceCheck(jobId);
        } catch (error) {
          this.logger.error('Resource monitoring check failed', {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });

          // Don't throw here to avoid breaking the monitoring loop
          // The error will be handled by the calling code
        }
      }, config.checkInterval);

      this.activeMonitors.set(jobId, monitorTimer);

      this.logger.debug('Resource monitoring started successfully', {
        jobId,
        initialMemoryUsage: Math.round(initialStats.memoryUsage / 1024 / 1024),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw BatchProcessingExceptionFactory.resourceMonitoringStartFailed(
        jobId,
        errorMessage,
      );
    }
  }

  /**
   * Stop resource monitoring for a job
   *
   * @param jobId Unique job identifier
   */
  async stopMonitoring(jobId: string): Promise<void> {
    this.logger.debug('Stopping resource monitoring', { jobId });

    const timer = this.activeMonitors.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.activeMonitors.delete(jobId);
    }

    // Clean up stored data
    this.monitoringConfigs.delete(jobId);
    this.resourceStats.delete(jobId);

    this.logger.debug('Resource monitoring stopped', { jobId });
  }

  /**
   * Get current resource statistics for a job
   *
   * @param jobId Unique job identifier
   * @returns Current resource usage stats or null if not monitoring
   */
  async getCurrentStats(jobId: string): Promise<ResourceUsageStats | null> {
    const stats = this.resourceStats.get(jobId);
    if (!stats) {
      return null;
    }

    // Update with latest data
    const updatedStats = await this.collectResourceStats(jobId);
    this.resourceStats.set(jobId, updatedStats);

    return updatedStats;
  }

  /**
   * Force a resource check for a specific job
   *
   * @param jobId Unique job identifier
   */
  async forceResourceCheck(jobId: string): Promise<ResourceUsageStats> {
    this.logger.debug('Forcing resource check', { jobId });

    const stats = await this.collectResourceStats(jobId);
    this.resourceStats.set(jobId, stats);

    // Check thresholds and trigger callbacks if needed
    await this.checkThresholds(jobId, stats);

    return stats;
  }

  /**
   * Check if memory usage is within safe limits
   *
   * @param jobId Unique job identifier
   * @returns True if memory usage is safe
   */
  async isMemoryUsageSafe(jobId: string): Promise<boolean> {
    const stats = await this.getCurrentStats(jobId);
    const config = this.monitoringConfigs.get(jobId);

    if (!stats || !config) {
      return true; // Default to safe if no monitoring
    }

    return stats.memoryUsage < config.memoryThreshold;
  }

  /**
   * Get memory usage percentage relative to threshold
   *
   * @param jobId Unique job identifier
   * @returns Memory usage percentage (0-100+)
   */
  async getMemoryUsagePercentage(jobId: string): Promise<number> {
    const stats = await this.getCurrentStats(jobId);
    const config = this.monitoringConfigs.get(jobId);

    if (!stats || !config) {
      return 0;
    }

    return (stats.memoryUsage / config.memoryThreshold) * 100;
  }

  /**
   * Perform resource check for a specific job
   */
  private async performResourceCheck(jobId: string): Promise<void> {
    const config = this.monitoringConfigs.get(jobId);
    if (!config) {
      return;
    }

    try {
      const stats = await this.collectResourceStats(jobId);
      this.resourceStats.set(jobId, stats);

      // Check thresholds and trigger callbacks
      await this.checkThresholds(jobId, stats);

      // Log periodic resource status
      this.logger.debug('Resource check completed', {
        jobId,
        memoryUsageMB: Math.round(stats.memoryUsage / 1024 / 1024),
        memoryUsagePercentage: stats.memoryUsagePercentage,
        processingRate: stats.processingRate,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw BatchProcessingExceptionFactory.resourceMonitoringCheckFailed(
        jobId,
        errorMessage,
      );
    }
  }

  /**
   * Collect current resource usage statistics
   */
  private async collectResourceStats(
    jobId: string,
  ): Promise<ResourceUsageStats> {
    const config = this.monitoringConfigs.get(jobId);
    const previousStats = this.resourceStats.get(jobId);

    // Collect memory statistics
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed;

    // Calculate memory usage percentage
    const memoryThreshold = config?.memoryThreshold || 512 * 1024 * 1024; // Default 512MB
    const memoryUsagePercentage = (heapUsed / memoryThreshold) * 100;

    // Calculate processing rate (if previous stats available)
    let processingRate = 0;
    let averageBatchTime = 0;

    if (previousStats) {
      processingRate = previousStats.processingRate; // Inherit from previous
      averageBatchTime = previousStats.averageBatchTime; // Inherit from previous
    }

    // Collect CPU usage if enabled
    let cpuUsagePercentage: number | undefined;
    if (config?.enableCpuMonitoring) {
      cpuUsagePercentage = await this.getCpuUsage();
    }

    // Get file handle count
    const fileHandles = this.getFileHandleCount();

    const stats: ResourceUsageStats = {
      memoryUsage: heapUsed,
      memoryUsagePercentage,
      cpuUsagePercentage,
      fileHandles,
      processingRate,
      averageBatchTime,
    };

    return stats;
  }

  /**
   * Check resource thresholds and trigger callbacks
   */
  private async checkThresholds(
    jobId: string,
    stats: ResourceUsageStats,
  ): Promise<void> {
    const config = this.monitoringConfigs.get(jobId);
    if (!config) {
      return;
    }

    // Check memory thresholds
    const memoryUsagePercentage = stats.memoryUsagePercentage;

    if (memoryUsagePercentage >= 95 && config.onMemoryExhaustion) {
      this.logger.warn('Memory exhaustion threshold reached', {
        jobId,
        memoryUsagePercentage,
        memoryUsageMB: Math.round(stats.memoryUsage / 1024 / 1024),
      });

      await config.onMemoryExhaustion(stats.memoryUsage);
    } else if (memoryUsagePercentage >= 80 && config.onMemoryWarning) {
      this.logger.warn('Memory warning threshold reached', {
        jobId,
        memoryUsagePercentage,
        memoryUsageMB: Math.round(stats.memoryUsage / 1024 / 1024),
      });

      await config.onMemoryWarning(stats.memoryUsage);
    }

    // Check CPU thresholds if enabled
    if (
      config.enableCpuMonitoring &&
      config.cpuThreshold &&
      stats.cpuUsagePercentage
    ) {
      if (stats.cpuUsagePercentage > config.cpuThreshold) {
        this.logger.warn('High CPU usage detected', {
          jobId,
          cpuUsagePercentage: stats.cpuUsagePercentage,
          threshold: config.cpuThreshold,
        });
      }
    }
  }

  /**
   * Get CPU usage percentage (simplified implementation)
   */
  private async getCpuUsage(): Promise<number> {
    // This is a simplified implementation
    // In production, you might want to use a more sophisticated CPU monitoring approach
    const startUsage = process.cpuUsage();

    // Wait a small amount to measure CPU usage
    await new Promise((resolve) => setTimeout(resolve, 100));

    const endUsage = process.cpuUsage(startUsage);
    const totalUsage = endUsage.user + endUsage.system;

    // Convert microseconds to percentage (rough approximation)
    const cpuPercentage = (totalUsage / 100000) * 100;

    return Math.min(100, Math.max(0, cpuPercentage));
  }

  /**
   * Get approximate file handle count
   */
  private getFileHandleCount(): number {
    // This is a simplified implementation
    // In production, you might want to check actual file descriptor count
    // For now, return a placeholder value
    return 0;
  }

  /**
   * Validate monitoring configuration
   */
  private validateMonitoringConfig(config: ResourceMonitoringConfig): void {
    if (config.memoryThreshold <= 0) {
      throw new Error('Memory threshold must be greater than 0');
    }

    if (config.checkInterval <= 0) {
      throw new Error('Check interval must be greater than 0');
    }

    if (
      config.enableCpuMonitoring &&
      config.cpuThreshold &&
      config.cpuThreshold <= 0
    ) {
      throw new Error(
        'CPU threshold must be greater than 0 when CPU monitoring is enabled',
      );
    }
  }

  /**
   * Get monitoring status for all active jobs
   */
  getMonitoringStatus(): Array<{
    jobId: string;
    config: ResourceMonitoringConfig;
    stats: ResourceUsageStats;
  }> {
    const status: Array<{
      jobId: string;
      config: ResourceMonitoringConfig;
      stats: ResourceUsageStats;
    }> = [];

    for (const [jobId, config] of this.monitoringConfigs.entries()) {
      const stats = this.resourceStats.get(jobId);
      if (stats) {
        status.push({ jobId, config, stats });
      }
    }

    return status;
  }

  /**
   * Force garbage collection if available
   */
  forceGarbageCollection(): boolean {
    if (global.gc) {
      this.logger.debug('Triggering garbage collection');
      global.gc();
      return true;
    }

    this.logger.debug('Garbage collection not available');
    return false;
  }

  /**
   * Get system-wide resource usage
   */
  getSystemResourceUsage(): {
    memory: NodeJS.MemoryUsage;
    uptime: number;
    loadAverage?: number[];
  } {
    return {
      memory: process.memoryUsage(),
      uptime: process.uptime(),
      loadAverage:
        process.platform !== 'win32' ? require('os').loadavg() : undefined,
    };
  }
}
