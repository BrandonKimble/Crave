import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import { LoggerService } from '../../../shared';
import { StreamProcessorException } from './stream-processor.exceptions';
import { SystemZstdDecompressor } from './system-zstd-decompressor.service';
import { ProcessingResult } from './stream-processor.service';

/**
 * Production stream processor using system-based zstd decompression
 * Optimized for Reddit Pushshift archives with unlimited file size support
 */
@Injectable()
export class EnhancedStreamProcessorService {
  private readonly logger: LoggerService;

  constructor(
    private readonly configService: ConfigService,
    private readonly systemZstdDecompressor: SystemZstdDecompressor,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('EnhancedStreamProcessor');
  }

  /**
   * Process zstd ndjson file using optimized system streaming
   */
  async processZstdNdjsonFile<T>(
    filePath: string,
    processor: (item: T, lineNumber: number) => Promise<void> | void,
    validator?: (data: unknown) => data is T,
  ): Promise<ProcessingResult> {
    this.logger.info('Starting system-based zstd streaming processing', { filePath });

    try {
      // Get file size for logging
      const stats = await fs.stat(filePath);
      const fileSizeBytes = stats.size;
      const fileSizeMB = fileSizeBytes / (1024 * 1024);

      this.logger.info('Processing zstd file with system streaming', {
        filePath,
        sizeBytes: fileSizeBytes,
        sizeMB: Math.round(fileSizeMB * 100) / 100,
      });

      return await this.processWithSystemZstd(filePath, processor, validator);
    } catch (error) {
      this.logger.error('System zstd stream processing failed', error, { filePath });
      throw error;
    }
  }

  /**
   * Process using system zstd with compatibility wrapper
   */
  private async processWithSystemZstd<T>(
    filePath: string,
    processor: (item: T, lineNumber: number) => Promise<void> | void,
    validator?: (data: unknown) => data is T,
  ): Promise<ProcessingResult> {
    // First validate system zstd is available
    const systemValidation = await this.systemZstdDecompressor.validateSystemZstd();
    if (!systemValidation.available) {
      throw new StreamProcessorException(
        'SYSTEM_ZSTD_UNAVAILABLE',
        `System zstd not available: ${systemValidation.error}`,
        { filePath, error: systemValidation.error },
      );
    }

    this.logger.info('System zstd validated', {
      version: systemValidation.version,
      filePath,
    });

    const errors: Array<{ line: number; error: string; content?: string }> = [];
    let processedItems = 0;

    // Wrap processor to count processed items and collect errors
    const wrappedProcessor = async (item: T, lineNumber: number) => {
      try {
        await processor(item, lineNumber);
        processedItems++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push({
          line: lineNumber,
          error: errorMessage,
        });
        this.logger.debug('Processing error for line', {
          lineNumber,
          error: {
            message: errorMessage,
            ...(error instanceof Error && { stack: error.stack, name: error.name }),
          },
        });
      }
    };

    // Use system decompressor
    const result = await this.systemZstdDecompressor.streamDecompressFile(
      filePath,
      wrappedProcessor,
      {
        validator,
        timeout: 300000, // 5 minutes timeout for large files
      },
    );

    // Convert to ProcessingResult format
    const processingResult: ProcessingResult = {
      success: true,
      metrics: {
        totalLines: result.totalLines,
        validLines: result.validLines,
        errorLines: result.errorLines,
        processingTime: result.processingTime,
        memoryUsage: result.memoryUsage,
        averageLineProcessingTime: result.totalLines > 0 
          ? result.processingTime / result.totalLines 
          : 0,
      },
      errors,
    };

    this.logger.info('System zstd processing completed', {
      filePath,
      totalLines: result.totalLines,
      validLines: result.validLines,
      errorLines: result.errorLines,
      processingTime: result.processingTime,
      throughputLinesPerSecond: Math.round(result.totalLines / (result.processingTime / 1000)),
      memoryEfficiency: `${Math.round(result.memoryUsage.peak / 1024 / 1024)}MB peak`,
    });

    return processingResult;
  }

  /**
   * Validate setup and system requirements
   */
  async validateSetup(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check system zstd availability
    const systemValidation = await this.systemZstdDecompressor.validateSystemZstd();
    if (!systemValidation.available) {
      issues.push(`System zstd not available: ${systemValidation.error}`);
    } else {
      this.logger.info('System zstd validation successful', {
        version: systemValidation.version,
      });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get file processing information
   */
  async getFileInfo(filePath: string): Promise<{
    fileSize: { bytes: number; mb: number };
    systemZstdAvailable: boolean;
    ready: boolean;
  }> {
    const stats = await fs.stat(filePath);
    const fileSizeBytes = stats.size;
    const fileSizeMB = fileSizeBytes / (1024 * 1024);
    const systemValidation = await this.systemZstdDecompressor.validateSystemZstd();

    return {
      fileSize: { bytes: fileSizeBytes, mb: fileSizeMB },
      systemZstdAvailable: systemValidation.available,
      ready: systemValidation.available,
    };
  }
}