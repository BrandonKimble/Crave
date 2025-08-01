/**
 * Duplicate Detection Service
 *
 * Comprehensive duplicate detection for Reddit content across Pushshift archives
 * and Reddit API sources as specified in PRD sections 5.1.2 and 6.1.
 *
 * Prevents duplicate processing of overlapping content between data sources
 * while providing visibility into overlap patterns and performance optimization.
 */

import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../shared';
import {
  ContentIdentifier,
  DuplicateDetectionResult,
  BatchDuplicateAnalysis,
  DuplicateDetectionConfig,
  DuplicateTrackingEntry,
  DuplicateDetectionStats,
  SourceOverlapAnalysis,
  DuplicateDetectionPerformance,
  EdgeCaseHandling,
} from './duplicate-detection.types';
import {
  DuplicateDetectionException,
  DuplicateValidationException,
  DuplicatePerformanceException,
  DuplicateDetectionExceptionFactory,
} from './duplicate-detection.exceptions';
import { DataSourceType, MergedContentItem } from './data-merge.types';
import {
  CraveRedditSubmission,
  CraveRedditComment,
} from './historical-content-pipeline.types';

@Injectable()
export class DuplicateDetectionService {
  private readonly logger: LoggerService;
  private readonly defaultConfig: DuplicateDetectionConfig;
  private readonly edgeCaseHandling: EdgeCaseHandling;
  private readonly seenItems: Map<string, DuplicateTrackingEntry>;
  private readonly stats: DuplicateDetectionStats;

  constructor(loggerService: LoggerService) {
    this.logger = loggerService.setContext('DuplicateDetection');
    this.defaultConfig = this.getDefaultConfig();
    this.edgeCaseHandling = this.getDefaultEdgeCaseHandling();
    this.seenItems = new Map();
    this.stats = this.initializeStats();
  }

  /**
   * Detect and filter duplicates from merged content items
   * Primary method implementing PRD Section 5.1.2 duplicate prevention
   *
   * @param items Array of merged content items to process
   * @param config Optional configuration overrides
   * @returns Filtered items with duplicates removed and analysis results
   */
  detectAndFilterDuplicates(
    items: MergedContentItem[],
    config?: Partial<DuplicateDetectionConfig>,
  ): {
    filteredItems: MergedContentItem[];
    analysis: BatchDuplicateAnalysis;
  } {
    const finalConfig = { ...this.defaultConfig, ...config };
    const startTime = new Date();

    this.logger.info('Starting duplicate detection and filtering', {
      totalItems: items.length,
      config: finalConfig,
    });

    try {
      // Validate input and configuration
      this.validateInput(items, finalConfig);

      // Initialize performance tracking (currently disabled for simplicity)
      // const performanceTracker = finalConfig.enablePerformanceTracking
      //   ? this.initializePerformanceTracking()
      //   : null;

      // Process items for duplicate detection
      const detectionResults: DuplicateDetectionResult[] = [];
      const filteredItems: MergedContentItem[] = [];

      for (const item of items) {
        try {
          const identifier = this.createContentIdentifier(item);
          const detectionResult = this.detectDuplicate(
            identifier,
            item,
            finalConfig,
          );

          detectionResults.push(detectionResult);

          // Only include non-duplicates in filtered results
          if (!detectionResult.isDuplicate) {
            filteredItems.push(item);
            this.trackSeenItem(identifier, item);
          } else {
            this.logger.debug('Duplicate detected and filtered', {
              itemId: identifier.id,
              type: identifier.type,
              originalSource: detectionResult.originalSource?.sourceType,
              currentSource: detectionResult.currentSource.sourceType,
              timeDiff: detectionResult.timeDiffSeconds,
            });
          }
        } catch (error: unknown) {
          this.handleItemProcessingError(item, error as Error);
        }
      }

      // Generate comprehensive analysis
      const analysis = this.generateBatchAnalysis(
        detectionResults,
        items.length,
        startTime,
        finalConfig,
      );

      // Update service statistics
      this.updateStats(analysis);

      this.logger.info('Duplicate detection and filtering completed', {
        originalItems: items.length,
        filteredItems: filteredItems.length,
        duplicatesFound: analysis.duplicatesFound,
        duplicateRate: analysis.duplicateRate,
        processingTimeMs: analysis.performanceMetrics.durationMs,
      });

      return {
        filteredItems,
        analysis,
      };
    } catch (error) {
      this.logger.error('Duplicate detection and filtering failed', {
        totalItems: items.length,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      if (
        error instanceof DuplicateDetectionException ||
        error instanceof DuplicateValidationException ||
        error instanceof DuplicatePerformanceException
      ) {
        throw error;
      }

      throw DuplicateDetectionExceptionFactory.batchAnalysisFailed(
        'batch_processing',
        items.length,
        'duplicate_detection_failed',
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Check if a single item is a duplicate and track it
   * Lightweight method for individual item checking
   *
   * @param item Content item to check
   * @returns Detection result with duplicate status
   */
  checkSingleItem(item: MergedContentItem): DuplicateDetectionResult {
    try {
      const identifier = this.createContentIdentifier(item);
      const detectionResult = this.detectDuplicate(
        identifier,
        item,
        this.defaultConfig,
      );

      // Track the item if it's not a duplicate
      if (!detectionResult.isDuplicate) {
        this.trackSeenItem(identifier, item);
      }

      return detectionResult;
    } catch (error) {
      throw DuplicateDetectionExceptionFactory.identifierGenerationFailed(
        this.extractItemId(item),
        this.extractItemType(item),
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Get current duplicate detection statistics
   * Provides runtime insights into detection patterns
   *
   * @returns Current service statistics
   */
  getStats(): DuplicateDetectionStats {
    return { ...this.stats };
  }

  /**
   * Clear tracking cache and reset statistics
   * Useful for memory management and fresh starts
   */
  clearCache(): void {
    this.seenItems.clear();
    this.resetStats();
    this.logger.info('Duplicate detection cache and statistics cleared');
  }

  /**
   * Create content identifier from merged content item
   * Generates normalized key for efficient duplicate detection
   */
  private createContentIdentifier(item: MergedContentItem): ContentIdentifier {
    try {
      const id = this.extractItemId(item);
      const type = this.extractItemType(item);

      if (!id) {
        throw DuplicateDetectionException.contentIdentifierGeneration(
          'unknown',
          type,
          'Missing item ID',
        );
      }

      // Normalize ID by removing Reddit prefixes if present (t3_, t1_, etc.)
      const normalizedId = id.replace(/^t[0-9]_/, '');
      const normalizedKey = `${type}:${normalizedId}`;

      return {
        id: normalizedId,
        type: type as 'post' | 'comment',
        normalizedKey,
      };
    } catch (error) {
      throw DuplicateDetectionExceptionFactory.identifierGenerationFailed(
        this.extractItemId(item),
        this.extractItemType(item),
        error instanceof Error ? error : undefined,
      );
    }
  }

  /**
   * Detect if item is duplicate based on identifier
   * Core duplicate detection logic using exact ID matching
   */
  private detectDuplicate(
    identifier: ContentIdentifier,
    item: MergedContentItem,
    config: DuplicateDetectionConfig,
  ): DuplicateDetectionResult {
    const currentSource = {
      sourceType: item.sourceMetadata.sourceType,
      firstSeen: new Date(),
      batchId: item.sourceMetadata.processingBatch,
      sourceMetadata: item.sourceMetadata,
    };

    const existingEntry = this.seenItems.get(identifier.normalizedKey);

    if (!existingEntry) {
      // Not a duplicate - first occurrence
      return {
        identifier,
        isDuplicate: false,
        currentSource,
      };
    }

    // Check time difference to handle edge cases
    // Use normalized timestamps for accurate comparison
    const currentTimestamp = item.normalizedTimestamp;
    const existingTimestamp: number =
      (existingEntry.sourceInfo.sourceMetadata
        ?.normalizedTimestamp as number) ||
      existingEntry.sourceInfo.firstSeen.getTime() / 1000;

    const timeDiffSeconds = Math.abs(currentTimestamp - existingTimestamp);

    // Consider as duplicate if within configured time difference
    const isDuplicate = timeDiffSeconds <= config.maxTimeDifferenceSeconds;

    if (isDuplicate) {
      return {
        identifier,
        isDuplicate: true,
        originalSource: existingEntry.sourceInfo,
        currentSource,
        timeDiffSeconds,
        metadata: {
          originalBatch: existingEntry.sourceInfo.batchId,
          currentBatch: currentSource.batchId,
        },
      };
    }

    // Not considered duplicate due to time difference
    return {
      identifier,
      isDuplicate: false,
      currentSource,
      metadata: {
        note: 'Similar ID found but time difference exceeds threshold',
        timeDiffSeconds,
      },
    };
  }

  /**
   * Track seen item for future duplicate detection
   * Maintains efficient in-memory cache of processed items
   */
  private trackSeenItem(
    identifier: ContentIdentifier,
    item: MergedContentItem,
  ): void {
    const trackingEntry: DuplicateTrackingEntry = {
      identifier,
      sourceInfo: {
        sourceType: item.sourceMetadata.sourceType,
        firstSeen: new Date(),
        batchId: item.sourceMetadata.processingBatch,
        sourceMetadata: {
          ...item.sourceMetadata,
          normalizedTimestamp: item.normalizedTimestamp,
        },
      },
      lastAccessed: new Date(),
    };

    this.seenItems.set(identifier.normalizedKey, trackingEntry);

    // Manage cache size if configured
    if (
      this.defaultConfig.cacheSize &&
      this.seenItems.size > this.defaultConfig.cacheSize
    ) {
      this.evictOldestCacheEntries();
    }
  }

  /**
   * Generate comprehensive batch analysis
   * Creates detailed analysis of duplicate detection results
   */
  private generateBatchAnalysis(
    detectionResults: DuplicateDetectionResult[],
    totalItems: number,
    startTime: Date,
    config: DuplicateDetectionConfig,
  ): BatchDuplicateAnalysis {
    const endTime = new Date();
    const duplicatesFound = detectionResults.filter(
      (r) => r.isDuplicate,
    ).length;
    const uniqueItems = totalItems - duplicatesFound;

    const durationMs = Math.max(1, endTime.getTime() - startTime.getTime()); // Ensure non-zero duration
    const performanceMetrics: DuplicateDetectionPerformance = {
      startTime,
      endTime,
      durationMs,
      throughputPerSecond: totalItems / (durationMs / 1000),
      memoryUsage: {
        peakMemoryMB: 0,
        memoryPerItemKB: 0,
      },
      lookupPerformance: {
        avgLookupTimeMs: 0,
        cacheHitRate: config.enableLookupCache
          ? this.calculateCacheHitRate()
          : undefined,
      },
    };

    const sourceOverlapAnalysis = config.enableSourceOverlapAnalysis
      ? this.generateSourceOverlapAnalysis(detectionResults)
      : this.getEmptySourceOverlapAnalysis();

    return {
      detectionResults,
      totalItems,
      duplicatesFound,
      uniqueItems,
      duplicateRate: totalItems > 0 ? (duplicatesFound / totalItems) * 100 : 0,
      sourceOverlapAnalysis,
      performanceMetrics,
    };
  }

  /**
   * Generate source overlap analysis
   * Analyzes patterns in duplicate sources and timing
   */
  private generateSourceOverlapAnalysis(
    results: DuplicateDetectionResult[],
  ): SourceOverlapAnalysis {
    const sourceBreakdown: Record<DataSourceType, number> = {
      [DataSourceType.PUSHSHIFT_ARCHIVE]: 0,
      [DataSourceType.REDDIT_API_CHRONOLOGICAL]: 0,
      [DataSourceType.REDDIT_API_KEYWORD_SEARCH]: 0,
      [DataSourceType.REDDIT_API_ON_DEMAND]: 0,
    };

    const overlapMatrix: Record<string, number> = {};
    const timeDiffs: number[] = [];

    for (const result of results) {
      sourceBreakdown[result.currentSource.sourceType]++;

      if (
        result.isDuplicate &&
        result.originalSource &&
        result.timeDiffSeconds !== undefined
      ) {
        const overlapKey = `${result.originalSource.sourceType.toUpperCase()}→${result.currentSource.sourceType.toUpperCase()}`;
        overlapMatrix[overlapKey] = (overlapMatrix[overlapKey] || 0) + 1;
        timeDiffs.push(result.timeDiffSeconds / 3600); // Convert to hours
      }
    }

    // Generate common overlap patterns
    const commonOverlapPatterns = Object.entries(overlapMatrix)
      .map(([key, count]) => ({
        sources: key.split('→') as DataSourceType[],
        count,
        percentage: (count / results.length) * 100,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 patterns

    // Generate time difference distribution
    const timeDiffDistribution = this.generateTimeDiffDistribution(timeDiffs);

    return {
      sourceBreakdown,
      overlapMatrix,
      commonOverlapPatterns,
      temporalOverlapAnalysis: {
        avgTimeDiffHours:
          timeDiffs.length > 0
            ? timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length
            : 0,
        maxTimeDiffHours: timeDiffs.length > 0 ? Math.max(...timeDiffs) : 0,
        timeDiffDistribution,
      },
    };
  }

  /**
   * Extract item ID from merged content item
   * Handles both submission and comment formats
   */
  private extractItemId(item: MergedContentItem): string {
    try {
      if (item.type === 'submission') {
        return (item.data as CraveRedditSubmission).id;
      } else if (item.type === 'comment') {
        return (item.data as CraveRedditComment).id;
      }
      // Return source metadata ID as fallback for unknown types
      return item.sourceMetadata.originalId || 'unknown';
    } catch {
      // Return source metadata ID as fallback
      return item.sourceMetadata?.originalId || 'unknown';
    }
  }

  /**
   * Extract item type from merged content item
   * Normalizes to 'post' or 'comment' for identifier
   */
  private extractItemType(item: MergedContentItem): string {
    return item.type === 'submission' ? 'post' : 'comment';
  }

  /**
   * Validate input parameters and configuration
   * Ensures proper format and constraints for processing
   */
  private validateInput(
    items: MergedContentItem[],
    config: DuplicateDetectionConfig,
  ): void {
    if (!Array.isArray(items)) {
      throw DuplicateValidationException.invalidItemFormat(
        'batch',
        'Array<MergedContentItem>',
        typeof items,
      );
    }

    if (items.length > config.maxBatchSize) {
      throw DuplicateValidationException.invalidBatchSize(
        items.length,
        config.maxBatchSize,
      );
    }

    if (config.maxTimeDifferenceSeconds < 0) {
      throw DuplicateValidationException.invalidConfiguration(
        'maxTimeDifferenceSeconds',
        config.maxTimeDifferenceSeconds,
        'positive number',
      );
    }
  }

  /**
   * Handle processing errors for individual items
   * Implements edge case handling strategies
   */
  private handleItemProcessingError(item: MergedContentItem, error: any): void {
    const itemId = this.extractItemId(item);

    switch (this.edgeCaseHandling.missingIdStrategy) {
      case 'skip':
        this.logger.warn('Skipping item due to processing error', {
          itemId,
          error:
            error instanceof Error
              ? { message: error.message, stack: error.stack, name: error.name }
              : { message: 'Unknown error' },
        });
        break;
      case 'error':
        throw error;
      default:
        this.logger.warn('Using fallback handling for item error', { itemId });
    }
  }

  /**
   * Initialize performance tracking
   * Sets up monitoring for optimization purposes
   */
  private initializePerformanceTracking(): any {
    return {
      getMemoryUsage: () => ({
        peakMemoryMB: process.memoryUsage().heapUsed / 1024 / 1024,
        memoryPerItemKB: 0,
      }),
      getAvgLookupTime: () => 0,
    };
  }

  /**
   * Calculate cache hit rate for performance metrics
   */
  private calculateCacheHitRate(): number {
    // Simple approximation based on cache size vs total processed
    return (
      Math.min(
        this.seenItems.size / Math.max(this.stats.totalItemsProcessed, 1),
        1,
      ) * 100
    );
  }

  /**
   * Generate time difference distribution buckets
   */
  private generateTimeDiffDistribution(
    timeDiffs: number[],
  ): Array<{ rangeHours: string; count: number }> {
    const buckets = [
      { range: '0-1h', min: 0, max: 1 },
      { range: '1-6h', min: 1, max: 6 },
      { range: '6-24h', min: 6, max: 24 },
      { range: '1-7d', min: 24, max: 168 },
      { range: '>7d', min: 168, max: Infinity },
    ];

    return buckets.map((bucket) => ({
      rangeHours: bucket.range,
      count: timeDiffs.filter((t) => t >= bucket.min && t < bucket.max).length,
    }));
  }

  /**
   * Evict oldest cache entries to manage memory
   */
  private evictOldestCacheEntries(): void {
    const entries = Array.from(this.seenItems.entries());
    entries.sort(
      (a, b) =>
        (a[1].lastAccessed?.getTime() || 0) -
        (b[1].lastAccessed?.getTime() || 0),
    );

    // Remove oldest 10% of entries
    const toRemove = Math.ceil(entries.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.seenItems.delete(entries[i][0]);
    }
  }

  /**
   * Update service statistics
   */
  private updateStats(analysis: BatchDuplicateAnalysis): void {
    this.stats.totalItemsProcessed += analysis.totalItems;
    this.stats.totalDuplicatesDetected += analysis.duplicatesFound;
    this.stats.overallDuplicateRate =
      (this.stats.totalDuplicatesDetected / this.stats.totalItemsProcessed) *
      100;
    this.stats.sessionsCompleted++;
    this.stats.avgSessionSize =
      this.stats.totalItemsProcessed / this.stats.sessionsCompleted;
    this.stats.lastSessionMetrics = analysis;
  }

  /**
   * Initialize service statistics
   */
  private initializeStats(): DuplicateDetectionStats {
    return {
      totalItemsProcessed: 0,
      totalDuplicatesDetected: 0,
      overallDuplicateRate: 0,
      sessionsCompleted: 0,
      avgSessionSize: 0,
    };
  }

  /**
   * Reset service statistics
   */
  private resetStats(): void {
    Object.assign(this.stats, this.initializeStats());
  }

  /**
   * Get empty source overlap analysis
   */
  private getEmptySourceOverlapAnalysis(): SourceOverlapAnalysis {
    return {
      sourceBreakdown: {
        [DataSourceType.PUSHSHIFT_ARCHIVE]: 0,
        [DataSourceType.REDDIT_API_CHRONOLOGICAL]: 0,
        [DataSourceType.REDDIT_API_KEYWORD_SEARCH]: 0,
        [DataSourceType.REDDIT_API_ON_DEMAND]: 0,
      },
      overlapMatrix: {},
      commonOverlapPatterns: [],
      temporalOverlapAnalysis: {
        avgTimeDiffHours: 0,
        maxTimeDiffHours: 0,
        timeDiffDistribution: [],
      },
    };
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): DuplicateDetectionConfig {
    return {
      enablePerformanceTracking: true,
      enableSourceOverlapAnalysis: true,
      maxTimeDifferenceSeconds: 3600, // 1 hour tolerance
      enableMemoryMonitoring: true,
      maxBatchSize: 10000,
      enableLookupCache: true,
      cacheSize: 50000,
    };
  }

  /**
   * Get default edge case handling
   */
  private getDefaultEdgeCaseHandling(): EdgeCaseHandling {
    return {
      missingIdStrategy: 'skip',
      malformedTimestampStrategy: 'use_current',
      conflictingSourceStrategy: 'first_wins',
      maxRetries: 3,
    };
  }
}
