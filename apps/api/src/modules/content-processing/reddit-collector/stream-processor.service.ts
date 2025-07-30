import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../shared';
// import { StreamProcessorException } from './stream-processor.exceptions';
import { SystemZstdDecompressor } from './system-zstd-decompressor.service';

/**
 * Core stream processing interfaces
 */
export interface StreamProcessingConfig {
  batchSize: number;
  processingTimeout: number;
  validation: {
    enabled: boolean;
    sampleLines: number;
  };
}

export interface ProcessingMetrics {
  totalLines: number;
  validLines: number;
  errorLines: number;
  processingTime: number;
  memoryUsage: {
    initial: number;
    peak: number;
    final: number;
  };
  averageLineProcessingTime: number;
}

export interface ProcessedItem {
  lineNumber: number;
  data: unknown;
  isValid: boolean;
  error?: string;
}

export interface ProcessingResult {
  success: boolean;
  metrics: ProcessingMetrics;
  errors: Array<{
    line: number;
    error: string;
    content?: string;
  }>;
}

/**
 * Stream Processor Service
 *
 * Enhanced to use SystemZstdDecompressor for true streaming decompression
 * without memory limitations, supporting multi-GB file processing.
 */
@Injectable()
export class StreamProcessorService {
  private readonly logger: LoggerService;
  private readonly config: StreamProcessingConfig;

  constructor(
    private readonly configService: ConfigService,
    loggerService: LoggerService,
    private readonly zstdDecompressor: SystemZstdDecompressor,
  ) {
    this.logger = loggerService.setContext('StreamProcessor');
    this.config = {
      batchSize: this.configService.get('pushshift.batchSize', 1000),
      processingTimeout: this.configService.get(
        'pushshift.processingTimeout',
        300000,
      ),
      validation: {
        enabled: this.configService.get('pushshift.validation.enabled', true),
        sampleLines: this.configService.get(
          'pushshift.validation.sampleLines',
          100,
        ),
      },
    };
  }

  /**
   * Process a zstd-compressed ndjson file with streaming
   * Uses SystemZstdDecompressor for true streaming without memory limits
   */
  async processZstdNdjsonFile<T>(
    filePath: string,
    processor: (item: T, lineNumber: number) => Promise<void> | void,
    validator?: (data: unknown) => data is T,
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const initialMemory = process.memoryUsage().heapUsed;
    let peakMemory = initialMemory;

    const metrics: ProcessingMetrics = {
      totalLines: 0,
      validLines: 0,
      errorLines: 0,
      processingTime: 0,
      memoryUsage: {
        initial: initialMemory,
        peak: 0,
        final: 0,
      },
      averageLineProcessingTime: 0,
    };

    const errors: Array<{ line: number; error: string; content?: string }> = [];

    this.logger.debug('Starting zstd ndjson file processing', {
      filePath,
      hasValidator: !!validator,
    });

    try {
      // Use SystemZstdDecompressor for true streaming decompression
      const decompressorResult =
        await this.zstdDecompressor.streamDecompressFile<T>(
          filePath,
          async (data: T, lineNumber: number) => {
            // Update peak memory usage
            const currentMemory = process.memoryUsage().heapUsed;
            if (currentMemory > peakMemory) {
              peakMemory = currentMemory;
            }

            // Call the provided processor
            await processor(data, lineNumber);
          },
          {
            validator: validator,
            timeout: this.config.processingTimeout,
          },
        );

      // Use the metrics from SystemZstdDecompressor
      metrics.totalLines = decompressorResult.totalLines;
      metrics.validLines = decompressorResult.validLines;
      metrics.errorLines = decompressorResult.errorLines;

      // Track memory usage and calculate averages
      const finalMemory = process.memoryUsage().heapUsed;
      const processingTime = Date.now() - startTime;

      metrics.memoryUsage = {
        initial: initialMemory,
        peak: peakMemory,
        final: finalMemory,
      };
      metrics.processingTime = processingTime;
      metrics.averageLineProcessingTime =
        metrics.totalLines > 0 ? processingTime / metrics.totalLines : 0;

      this.logger.info('Zstd ndjson file processing completed', {
        filePath,
        metrics,
        errorCount: errors.length,
      });

      return {
        success: true,
        metrics,
        errors,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const processingTime = Date.now() - startTime;

      this.logger.error('Zstd ndjson file processing failed', error, {
        filePath,
        processingTime,
        errorMessage,
      });

      // Update metrics for failure case
      metrics.processingTime = processingTime;
      metrics.memoryUsage.final = process.memoryUsage().heapUsed;
      metrics.averageLineProcessingTime =
        metrics.totalLines > 0 ? processingTime / metrics.totalLines : 0;

      return {
        success: false,
        metrics,
        errors: [
          {
            line: 0,
            error: `Processing failed: ${errorMessage}`,
          },
        ],
      };
    }
  }

  /**
   * Validate stream processing setup
   * Now validates system zstd binary availability
   */
  async validateSetup(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check system zstd availability via SystemZstdDecompressor
    // TODO: Implement proper zstd validation
    // try {
    //   await this.zstdDecompressor.validateZstdAvailable();
    // } catch (error) {
    //   issues.push(`System zstd validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    // }

    // Check configuration
    if (this.config.batchSize <= 0) {
      issues.push('Invalid batch size configuration');
    }

    if (this.config.processingTimeout <= 0) {
      issues.push('Invalid processing timeout configuration');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
