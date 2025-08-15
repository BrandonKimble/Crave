import { Controller, Post, Get, Body, Param, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job } from 'bull';
import { IsString, IsOptional, IsNumber, Min, Max, IsIn } from 'class-validator';
import { LoggerService, CorrelationUtils } from '../../shared';
import { LLMProcessingJobData, LLMProcessingJobResult } from './reddit-collector/llm-processing.processor';

/**
 * DTO for content processing request
 */
export class ProcessContentDto {
  @IsString()
  postId: string;

  @IsString()
  subreddit: string;

  @IsOptional()
  @IsString()
  requestedBy?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  commentLimit?: number;

  @IsOptional()
  @IsIn(['new', 'old', 'top', 'controversial'])
  sort?: 'new' | 'old' | 'top' | 'controversial';
}

/**
 * Response DTO for async job creation
 */
export interface ProcessContentResponse {
  jobId: string;
  status: string;
  position: number;
  estimatedWaitTime?: number;
}

/**
 * Response DTO for job status
 */
export interface JobStatusResponse {
  jobId: string;
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
  progress?: number;
  result?: LLMProcessingJobResult;
  failedReason?: string;
  processedOn?: number;
  finishedOn?: number;
  position?: number;
  estimatedCompletion?: number;
}

/**
 * Content Processing Controller
 * 
 * Provides async endpoints for queue-based LLM content processing:
 * - Submit posts for processing (returns job ID immediately)
 * - Check job status and retrieve results
 * - Queue health monitoring
 */
@Controller('content-processing')
export class ContentProcessingController implements OnModuleInit {
  private logger!: LoggerService;

  constructor(
    @InjectQueue('llm-processing-queue') private readonly llmQueue: Queue,
    private readonly loggerService: LoggerService,
  ) {}

  onModuleInit(): void {
    this.logger = this.loggerService.setContext('ContentProcessing');
  }

  /**
   * Submit a post for async LLM processing
   * Returns immediately with job ID for status tracking
   * 
   * @param dto - Processing request data
   * @returns Job ID and queue status
   */
  @Post('process-async')
  async processAsync(@Body() dto: ProcessContentDto): Promise<ProcessContentResponse> {
    const correlationId = CorrelationUtils.getCorrelationId() || CorrelationUtils.generateCorrelationId();
    
    this.logger.info('Submitting content for async processing', {
      correlationId,
      operation: 'process_async',
      postId: dto.postId,
      subreddit: dto.subreddit,
      requestedBy: dto.requestedBy,
      options: {
        commentLimit: dto.commentLimit,
        sort: dto.sort
      }
    });

    try {
      // Add job to queue
      const jobData: LLMProcessingJobData = {
        postId: dto.postId,
        subreddit: dto.subreddit,
        correlationId,
        requestedBy: dto.requestedBy,
        options: {
          commentLimit: dto.commentLimit,
          sort: dto.sort || 'top'
        }
      };

      // Simple FIFO queue processing
      const job = await this.llmQueue.add('process-content', jobData);
      const position = await this.llmQueue.getWaitingCount();

      // Estimate wait time based on queue position and average processing time
      const estimatedWaitTime = this.estimateWaitTime(position);

      this.logger.info('Job submitted successfully', {
        correlationId,
        jobId: job.id,
        postId: dto.postId,
        position,
        estimatedWaitTime
      });

      return {
        jobId: String(job.id),
        status: 'queued',
        position,
        estimatedWaitTime
      };

    } catch (error) {
      this.logger.error('Failed to submit job for processing', {
        correlationId,
        postId: dto.postId,
        subreddit: dto.subreddit,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Get status of a processing job
   * 
   * @param jobId - Job ID to check
   * @returns Job status and results (if completed)
   */
  @Get('status/:jobId')
  async getStatus(@Param('jobId') jobId: string): Promise<JobStatusResponse> {
    const correlationId = CorrelationUtils.getCorrelationId() || CorrelationUtils.generateCorrelationId();

    this.logger.debug('Checking job status', {
      correlationId,
      operation: 'get_status',
      jobId
    });

    try {
      const job = await this.llmQueue.getJob(jobId);
      
      if (!job) {
        throw new NotFoundException(`Job with ID ${jobId} not found`);
      }

      const state = await job.getState();
      const progress = job.progress();
      
      // Map Bull job states to our response types
      let status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
      if (state === 'stuck') {
        status = 'delayed'; // Map stuck to delayed
      } else {
        status = state as 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'paused';
      }
      
      // Base response
      const response: JobStatusResponse = {
        jobId: String(job.id),
        status,
        progress,
        processedOn: job.processedOn || undefined,
        finishedOn: job.finishedOn || undefined
      };

      // Add specific data based on job state
      if (state === 'completed' && job.returnvalue) {
        response.result = job.returnvalue as LLMProcessingJobResult;
        
        this.logger.info('Job completed successfully', {
          correlationId,
          jobId,
          postId: response.result.postId,
          totalMentions: response.result.totalMentions,
          processingDuration: response.result.processingDuration
        });
      }

      if (state === 'failed' && job.failedReason) {
        response.failedReason = job.failedReason;
        
        this.logger.warn('Job failed', {
          correlationId,
          jobId,
          failedReason: job.failedReason
        });
      }

      if (state === 'waiting') {
        const waiting = await this.llmQueue.getWaitingCount();
        const waitingJobs = await this.llmQueue.getWaiting();
        
        // Find position of this job in the queue
        const position = waitingJobs.findIndex(j => j.id === job.id) + 1;
        response.position = position;
        response.estimatedCompletion = this.estimateCompletionTime(position);
      }

      return response;

    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error('Failed to get job status', {
        correlationId,
        jobId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Get queue health and statistics
   * 
   * @returns Queue health information
   */
  @Get('queue/status')
  async getQueueStatus(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    paused: number;
    health: 'healthy' | 'warning' | 'critical';
    message?: string;
  }> {
    const correlationId = CorrelationUtils.getCorrelationId() || CorrelationUtils.generateCorrelationId();

    try {
      const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
        this.llmQueue.getWaitingCount(),
        this.llmQueue.getActiveCount(),
        this.llmQueue.getCompletedCount(),
        this.llmQueue.getFailedCount(),
        this.llmQueue.getDelayedCount(),
        this.llmQueue.getPausedCount(),
      ]);

      // Determine health status
      let health: 'healthy' | 'warning' | 'critical' = 'healthy';
      let message: string | undefined;

      if (waiting > 100) {
        health = 'warning';
        message = 'Queue backup detected but processing continues normally';
      }

      if (waiting > 500 && active === 0) {
        health = 'critical';
        message = 'Queue may be stuck - no active processing with large backlog';
      }

      if (failed > completed && completed > 0) {
        health = 'warning';
        message = 'High failure rate detected';
      }

      this.logger.info('Queue status requested', {
        correlationId,
        waiting,
        active,
        completed,
        failed,
        health
      });

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused,
        health,
        message
      };

    } catch (error) {
      this.logger.error('Failed to get queue status', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });

      throw error;
    }
  }

  /**
   * Estimate wait time based on queue position
   * 
   * @param position - Position in queue
   * @returns Estimated wait time in seconds
   */
  private estimateWaitTime(position: number): number {
    // Rough estimate: 
    // - 5 concurrent processing slots
    // - Average 60 seconds per job (mix of small and large posts)
    const concurrency = 5;
    const averageJobTime = 60;
    
    return Math.ceil(position / concurrency) * averageJobTime;
  }

  /**
   * Estimate completion time for a job in queue
   * 
   * @param position - Position in queue
   * @returns Estimated completion timestamp
   */
  private estimateCompletionTime(position: number): number {
    const estimatedWait = this.estimateWaitTime(position);
    return Date.now() + (estimatedWait * 1000);
  }
}