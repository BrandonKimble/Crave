import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../../shared';
import {
  ArchiveStreamProcessorService,
  ProcessingResult,
} from './archive-stream-processor.service';
import {
  RedditComment,
  RedditSubmission,
  isRedditComment,
  isRedditSubmission,
} from '../reddit-data.types';

// Re-export types for test files
export { RedditComment, RedditSubmission };
import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import type {
  LLMPost,
  LLMComment,
} from '../../../external-integrations/llm/llm.types';
import { ArchiveProcessingMetricsService } from './archive-processing-metrics.service';
import { BatchJob } from '../batch-processing-queue.types';

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

export interface ArchiveEnqueueOptions {
  batchSize?: number;
  maxPosts?: number;
}

export interface ArchiveProcessedFileSummary {
  fileType: 'comments' | 'submissions';
  filePath: string;
  metrics: ProcessingResult['metrics'];
  errorCount: number;
}

export interface ArchiveEnqueueResult {
  batchesEnqueued: number;
  postsQueued: number;
  parentJobId: string;
  filesProcessed: ArchiveProcessedFileSummary[];
}

/**
 * Archive Ingestion Service
 *
 * Implements PRD Section 5.1.1: Initial Historical Load (Primary Foundation)
 * Specialized service for processing Pushshift archive files and enqueuing
 * batches into the shared Reddit batch processing pipeline.
 */
@Injectable()
export class ArchiveIngestionService implements OnModuleInit {
  private logger!: LoggerService;
  private config!: PushshiftProcessingConfig;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
    private readonly streamProcessor: ArchiveStreamProcessorService,
    @Inject(LoggerService) private readonly loggerService: LoggerService,
    @InjectQueue('archive-batch-processing-queue')
    private readonly archiveBatchQueue: Queue<BatchJob>,
    private readonly metricsService: ArchiveProcessingMetricsService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ArchiveIngestionService');
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

      throw new Error(
        `Failed to process ${fileName}: ${
          error instanceof Error ? error.message : String(error)
        }`,
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
   * Enqueue archive batches for asynchronous processing using Bull.
   */
  async enqueueArchiveBatches(
    subreddit: string,
    options: ArchiveEnqueueOptions = {},
  ): Promise<ArchiveEnqueueResult> {
    const correlationId = CorrelationUtils.generateCorrelationId();

    this.logger.info('Preparing archive batches for queueing', {
      correlationId,
      subreddit,
      batchSize: options.batchSize,
    });

    const { posts: loadedPosts, filesProcessed } = await this.loadArchivePosts(
      subreddit,
      correlationId,
    );

    const envMaxPosts =
      process.env.TEST_ARCHIVE_MAX_POSTS &&
      !Number.isNaN(Number(process.env.TEST_ARCHIVE_MAX_POSTS))
        ? Math.max(
            0,
            Number.parseInt(process.env.TEST_ARCHIVE_MAX_POSTS, 10),
          )
        : null;
    const effectiveMaxPosts =
      typeof options.maxPosts === 'number'
        ? options.maxPosts
        : envMaxPosts ?? null;

    const posts =
      typeof effectiveMaxPosts === 'number' && effectiveMaxPosts > 0
        ? loadedPosts.slice(0, effectiveMaxPosts)
        : loadedPosts;

    const parentJobId = `archive-${subreddit}-${Date.now()}`;

    const fileSummaries = filesProcessed.map((file) => ({
      fileType: file.fileType,
      filePath: file.filePath,
      metrics: file.result.metrics,
      errorCount: file.result.errors.length,
    }));

    if (posts.length === 0) {
      this.logger.warn('No archive posts available to queue', {
        correlationId,
        subreddit,
      });
      this.recordProcessingMetrics(filesProcessed, subreddit);
      return {
        batchesEnqueued: 0,
        postsQueued: 0,
        parentJobId,
        filesProcessed: fileSummaries,
      };
    }

    const envBatchSize =
      process.env.TEST_ARCHIVE_BATCH_SIZE &&
      !Number.isNaN(Number(process.env.TEST_ARCHIVE_BATCH_SIZE))
        ? Math.max(
            1,
            Number.parseInt(process.env.TEST_ARCHIVE_BATCH_SIZE, 10),
          )
        : null;
    const batchSize = Math.max(1, options.batchSize ?? envBatchSize ?? 20);
    const chunks = this.chunkPosts(posts, batchSize);

    let enqueuedCount = 0;

    let batchIndex = 0;
    for (const chunk of chunks) {
      batchIndex += 1;
      const batchId = `${parentJobId}-batch-${batchIndex}`;
      const temporalRange = this.computeTemporalRange(chunk);

      const batchJob: BatchJob = {
        batchId,
        parentJobId,
        collectionType: 'archive',
        subreddit,
        batchNumber: batchIndex,
        totalBatches: chunks.length,
        createdAt: new Date(),
        llmPosts: chunk,
        options: {
          depth: 0,
        },
        sourceMetadata: {
          archive: {
            files: [
              { subreddit, fileType: 'comments' as const },
              { subreddit, fileType: 'submissions' as const },
            ],
            temporalRange,
          },
        },
      };

      await this.archiveBatchQueue.add('process-archive-batch', batchJob, {
        priority: 2,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 50,
        removeOnFail: 100,
      });
      enqueuedCount += 1;
    }

    this.logger.info('Archive batches enqueued successfully', {
      correlationId,
      subreddit,
      batchesEnqueued: enqueuedCount,
      postsQueued: posts.length,
    });

    this.recordProcessingMetrics(filesProcessed, subreddit);

    return {
      batchesEnqueued: enqueuedCount,
      postsQueued: posts.length,
      parentJobId,
      filesProcessed: fileSummaries,
    };
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
      throw new Error(
        `Cannot access file: ${filePath} - ${error instanceof Error ? error.message : String(error)}`,
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

  private async loadArchivePosts(
    subreddit: string,
    correlationId: string,
  ): Promise<{
    posts: LLMPost[];
    filesProcessed: Array<{
      fileType: 'comments' | 'submissions';
      result: ProcessingResult;
      filePath: string;
    }>;
  }> {
    const postsById = new Map<string, LLMPost>();
    const filesProcessed: Array<{
      fileType: 'comments' | 'submissions';
      result: ProcessingResult;
      filePath: string;
    }> = [];

    const submissionFilePath = this.buildArchiveFilePath(
      subreddit,
      'submissions',
    );
    const submissionResult =
      await this.streamProcessor.processZstdNdjsonFile<RedditSubmission>(
        submissionFilePath,
        async (submission) => {
          const postId = this.normalizePostId(submission.id);
          const existing = postsById.get(postId);
          const createdAt = this.toIsoTimestamp(submission.created_utc);
          const subredditName = submission.subreddit || subreddit;
          const content =
            submission.selftext && submission.selftext.trim().length > 0
              ? submission.selftext
              : submission.title || '';
          const url = submission.permalink
            ? `https://reddit.com${submission.permalink}`
            : submission.url || '';

          const postRecord: LLMPost = existing ?? {
            id: postId,
            title: submission.title || '(archived post)',
            content,
            subreddit: subredditName,
            author: submission.author || '[deleted]',
            url,
            score:
              typeof submission.score === 'number'
                ? Math.max(0, submission.score)
                : 0,
            created_at: createdAt,
            comments: [],
            extract_from_post: true,
          };

          postRecord.title = submission.title || postRecord.title;
          postRecord.content = content || postRecord.content;
          postRecord.author = submission.author || postRecord.author;
          postRecord.url = url || postRecord.url;
          postRecord.score =
            typeof submission.score === 'number'
              ? Math.max(0, submission.score)
              : postRecord.score;
          postRecord.created_at = createdAt || postRecord.created_at;
          postRecord.subreddit = subredditName || postRecord.subreddit;

          postsById.set(postId, postRecord);
        },
        isRedditSubmission,
      );

    filesProcessed.push({
      fileType: 'submissions',
      result: submissionResult,
      filePath: submissionFilePath,
    });

    const commentFilePath = this.buildArchiveFilePath(subreddit, 'comments');
    const commentResult =
      await this.streamProcessor.processZstdNdjsonFile<RedditComment>(
        commentFilePath,
        async (comment) => {
          if (!comment.body || comment.body === '[deleted]') {
            return;
          }

          const postId = this.normalizePostId(comment.link_id);
          let postRecord = postsById.get(postId);

          if (!postRecord) {
            postRecord = {
              id: postId,
              title: '(archived submission)',
              content: '',
              subreddit: comment.subreddit || subreddit,
              author: comment.author || '[deleted]',
              url: comment.permalink
                ? `https://reddit.com${comment.permalink}`
                : '',
              score:
                typeof comment.score === 'number'
                  ? Math.max(0, comment.score)
                  : 0,
              created_at: this.toIsoTimestamp(comment.created_utc),
              comments: [],
              extract_from_post: true,
            };
            postsById.set(postId, postRecord);
          }

          const commentId = this.ensureCommentId(comment);
          const commentRecord: LLMComment = {
            id: commentId,
            content: comment.body,
            author: comment.author || '[deleted]',
            score:
              typeof comment.score === 'number'
                ? Math.max(0, comment.score)
                : 0,
            created_at: this.toIsoTimestamp(comment.created_utc),
            parent_id: this.normalizeParentId(comment.parent_id, postId),
            url: comment.permalink
              ? `https://reddit.com${comment.permalink}`
              : '',
          };

          postRecord.comments.push(commentRecord);
        },
        isRedditComment,
      );

    filesProcessed.push({
      fileType: 'comments',
      result: commentResult,
      filePath: commentFilePath,
    });

    const posts = Array.from(postsById.values()).map((post) => ({
      ...post,
      comments: post.comments.sort((a, b) => b.score - a.score),
    }));

    posts.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );

    this.logger.info('Archive posts prepared for batch queueing', {
      correlationId,
      subreddit,
      postCount: posts.length,
    });

    return { posts, filesProcessed };
  }

  private recordProcessingMetrics(
    files: Array<{
      fileType: 'comments' | 'submissions';
      result: ProcessingResult;
      filePath: string;
    }>,
    subreddit: string,
  ): void {
    for (const file of files) {
      const endTime = new Date();
      const startTime = new Date(
        endTime.getTime() - file.result.metrics.processingTime,
      );
      this.metricsService.recordFileMetrics(
        file.filePath,
        file.fileType,
        subreddit,
        startTime,
        endTime,
        file.result.metrics,
      );
    }
  }

  private buildArchiveFilePath(
    subreddit: string,
    fileType: 'comments' | 'submissions',
  ): string {
    const fileName = `${subreddit}_${fileType}.zst`;
    return path.resolve(this.config.baseDirectory, subreddit, fileName);
  }

  private normalizePostId(rawId?: string): string {
    if (!rawId) {
      const fallback = createHash('sha1')
        .update(`post-${Date.now()}-${Math.random()}`)
        .digest('hex');
      return `t3_${fallback.slice(0, 10)}`;
    }

    if (rawId.startsWith('t3_')) {
      return rawId;
    }

    return rawId.startsWith('t3_') ? rawId : `t3_${rawId}`;
  }

  private ensureCommentId(comment: RedditComment): string {
    if (comment.id?.startsWith('t1_')) {
      return comment.id;
    }

    if (comment.id) {
      return `t1_${comment.id}`;
    }

    if (comment.parent_id?.startsWith('t1_')) {
      return comment.parent_id;
    }

    const fallback = createHash('sha1')
      .update(
        `${comment.link_id}-${comment.parent_id}-${comment.created_utc}-${Math.random()}`,
      )
      .digest('hex');
    return `t1_${fallback.slice(0, 10)}`;
  }

  private normalizeParentId(
    parentId: string | undefined,
    fallbackPostId: string,
  ): string | null {
    if (!parentId) {
      return fallbackPostId;
    }

    if (parentId.startsWith('t1_') || parentId.startsWith('t3_')) {
      return parentId;
    }

    return fallbackPostId;
  }

  private toIsoTimestamp(value: number | string | undefined): string {
    if (typeof value === 'number') {
      return new Date(value * 1000).toISOString();
    }
    if (typeof value === 'string' && !Number.isNaN(Number(value))) {
      return new Date(Number(value) * 1000).toISOString();
    }
    return new Date().toISOString();
  }

  private chunkPosts(posts: LLMPost[], chunkSize: number): LLMPost[][] {
    const chunks: LLMPost[][] = [];
    for (let i = 0; i < posts.length; i += chunkSize) {
      chunks.push(posts.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private computeTemporalRange(posts: LLMPost[]): {
    earliest: number;
    latest: number;
  } {
    const now = Date.now();

    const timestamps = posts
      .map((post) => {
        const time = Date.parse(post.created_at);
        return Number.isNaN(time) ? undefined : time;
      })
      .filter((value): value is number => typeof value === 'number');

    if (!timestamps.length) {
      return {
        earliest: now,
        latest: now,
      };
    }

    return {
      earliest: Math.min(...timestamps),
      latest: Math.max(...timestamps),
    };
  }
}
