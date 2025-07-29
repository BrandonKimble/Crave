import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../shared';
import {
  StreamProcessorService,
  ProcessingResult,
} from './stream-processor.service';
import { StreamProcessorException } from './stream-processor.exceptions';
import {
  RedditComment,
  RedditSubmission,
  isRedditComment,
  isRedditSubmission,
} from './reddit-data.types';

// Re-export types for test files
export { RedditComment, RedditSubmission };
import * as path from 'path';
import * as fs from 'fs/promises';

export interface PushshiftProcessingConfig {
  baseDirectory: string;
  targetSubreddits: string[];
  fileTypes: string[];
  storage: {
    local: {
      basePath: string;
      archivePath: string;
    };
  };
}

export interface SubredditProcessingResult {
  subreddit: string;
  fileType: 'comments' | 'submissions';
  result: ProcessingResult;
  filePath: string;
}

/**
 * Pushshift Processor Service
 *
 * Implements PRD Section 5.1.1: Initial Historical Load (Primary Foundation)
 * Specialized service for processing Pushshift archive files with Reddit-specific data structures
 */
@Injectable()
export class PushshiftProcessorService {
  private readonly logger: LoggerService;
  private readonly config: PushshiftProcessingConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly streamProcessor: StreamProcessorService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('PushshiftProcessor');
    this.config = {
      baseDirectory: this.configService.get(
        'pushshift.baseDirectory',
        'data/pushshift/archives',
      ),
      targetSubreddits: this.configService.get('pushshift.targetSubreddits', [
        'austinfood',
        'FoodNYC',
      ]),
      fileTypes: this.configService.get('pushshift.fileTypes', [
        'comments',
        'submissions',
      ]),
      storage: {
        local: {
          basePath: this.configService.get(
            'pushshift.storage.local.basePath',
            'data/pushshift',
          ),
          archivePath: this.configService.get(
            'pushshift.storage.local.archivePath',
            'data/pushshift/archives',
          ),
        },
      },
    };
  }

  /**
   * Process all Pushshift archive files for configured subreddits
   * Implements PRD requirement: "Target Subreddits: r/austinfood (primary), r/FoodNYC"
   */
  async processAllArchives(
    processor: (
      item: RedditComment | RedditSubmission,
      lineNumber: number,
      fileType: 'comments' | 'submissions',
    ) => Promise<void>,
  ): Promise<SubredditProcessingResult[]> {
    this.logger.info('Starting comprehensive Pushshift archive processing', {
      subreddits: this.config.targetSubreddits,
      fileTypes: this.config.fileTypes,
      baseDirectory: this.config.baseDirectory,
    });

    const results: SubredditProcessingResult[] = [];

    try {
      // Process each subreddit
      for (const subreddit of this.config.targetSubreddits) {
        this.logger.info(`Processing subreddit: ${subreddit}`);

        // Process each file type (comments, submissions)
        for (const fileType of this.config.fileTypes) {
          const result = await this.processSubredditFile(
            subreddit,
            fileType as 'comments' | 'submissions',
            processor,
          );
          results.push(result);
        }
      }

      this.logger.info('All archives processed successfully', {
        totalFiles: results.length,
        successfulFiles: results.filter((r) => r.result.success).length,
        totalLines: results.reduce(
          (sum, r) => sum + r.result.metrics.totalLines,
          0,
        ),
        totalValidLines: results.reduce(
          (sum, r) => sum + r.result.metrics.validLines,
          0,
        ),
      });

      return results;
    } catch (error) {
      this.logger.error('Archive processing failed', error, {
        processedFiles: results.length,
        subreddits: this.config.targetSubreddits,
      });
      throw error;
    }
  }

  /**
   * Process a specific subreddit archive file
   */
  async processSubredditFile(
    subreddit: string,
    fileType: 'comments' | 'submissions',
    processor: (
      item: RedditComment | RedditSubmission,
      lineNumber: number,
      fileType: 'comments' | 'submissions',
    ) => Promise<void>,
  ): Promise<SubredditProcessingResult> {
    const fileName = `${subreddit}_${fileType}.zst`;
    const filePath = path.resolve(
      this.config.baseDirectory,
      subreddit,
      fileName,
    );

    this.logger.info(`Processing ${fileType} file for ${subreddit}`, {
      filePath,
      fileType,
      subreddit,
    });

    try {
      // Validate file exists and is accessible
      await this.validateFileAccess(filePath);

      // Create type-specific validator and processor wrapper
      const validator = this.createRedditDataValidator(fileType);
      const processorWrapper = async (
        item: RedditComment | RedditSubmission,
        lineNumber: number,
      ) => {
        await processor(item, lineNumber, fileType);
      };

      // Process the file using stream processor
      const result = await this.streamProcessor.processZstdNdjsonFile(
        filePath,
        processorWrapper,
        validator,
      );

      this.logger.info(`Successfully processed ${fileName}`, {
        subreddit,
        fileType,
        metrics: result.metrics,
        errorsCount: result.errors.length,
      });

      return {
        subreddit,
        fileType,
        result,
        filePath,
      };
    } catch (error) {
      this.logger.error(`Failed to process ${fileName}`, error, {
        subreddit,
        fileType,
        filePath,
      });

      throw new StreamProcessorException(
        'PUSHSHIFT_PROCESSING_FAILED',
        `Failed to process ${fileName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { subreddit, fileType, filePath, originalError: error },
      );
    }
  }

  /**
   * Process a single subreddit (both comments and submissions)
   */
  async processSingleSubreddit(
    subreddit: string,
    processor: (
      item: RedditComment | RedditSubmission,
      lineNumber: number,
      fileType: 'comments' | 'submissions',
    ) => Promise<void>,
  ): Promise<SubredditProcessingResult[]> {
    this.logger.info(`Processing single subreddit: ${subreddit}`);

    const results: SubredditProcessingResult[] = [];

    for (const fileType of this.config.fileTypes) {
      const result = await this.processSubredditFile(
        subreddit,
        fileType as 'comments' | 'submissions',
        processor,
      );
      results.push(result);
    }

    return results;
  }

  /**
   * Get list of available archive files
   */
  async getAvailableArchives(): Promise<
    Array<{
      subreddit: string;
      fileType: string;
      filePath: string;
      exists: boolean;
      size?: number;
    }>
  > {
    const archives: Array<{
      subreddit: string;
      fileType: string;
      filePath: string;
      exists: boolean;
      size?: number;
    }> = [];

    for (const subreddit of this.config.targetSubreddits) {
      for (const fileType of this.config.fileTypes) {
        const fileName = `${subreddit}_${fileType}.zst`;
        const filePath = path.resolve(
          this.config.baseDirectory,
          subreddit,
          fileName,
        );

        try {
          const stats = await fs.stat(filePath);
          archives.push({
            subreddit,
            fileType,
            filePath,
            exists: true,
            size: stats.size,
          });
        } catch {
          archives.push({
            subreddit,
            fileType,
            filePath,
            exists: false,
          });
        }
      }
    }

    return archives;
  }

  /**
   * Validate archive file accessibility
   */
  private async validateFileAccess(filePath: string): Promise<void> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
      const stats = await fs.stat(filePath);

      if (!stats.isFile()) {
        throw new Error('Path is not a file');
      }

      if (stats.size === 0) {
        throw new Error('File is empty');
      }

      this.logger.debug('File validation passed', {
        filePath,
        sizeBytes: stats.size,
        sizeMB: Math.round((stats.size / 1024 / 1024) * 100) / 100,
      });
    } catch (error) {
      throw StreamProcessorException.fileAccess(
        filePath,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Create Reddit data validator for specific file type
   */
  private createRedditDataValidator(fileType: 'comments' | 'submissions') {
    if (fileType === 'comments') {
      return isRedditComment;
    } else {
      return isRedditSubmission;
    }
  }

  /**
   * Get processing configuration
   */
  getConfig(): PushshiftProcessingConfig {
    return { ...this.config };
  }

  /**
   * Validate Pushshift processing setup
   */
  async validateSetup(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check base directory exists
    try {
      await fs.access(this.config.baseDirectory);
    } catch {
      issues.push(
        `Base directory does not exist: ${this.config.baseDirectory}`,
      );
    }

    // Check for archive files
    const archives = await this.getAvailableArchives();
    const missingFiles = archives.filter((a) => !a.exists);

    if (missingFiles.length > 0) {
      issues.push(
        `Missing archive files: ${missingFiles
          .map((f) => f.filePath)
          .join(', ')}`,
      );
    }

    // Check stream processor setup
    const streamSetup = await this.streamProcessor.validateSetup();
    if (!streamSetup.valid) {
      issues.push(...streamSetup.issues);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
