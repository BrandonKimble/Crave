import { Injectable, Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  KeywordSearchOrchestratorService,
  KeywordSearchJobData,
} from './keyword-search-orchestrator.service';
import { KeywordSearchSchedulerService } from './keyword-search-scheduler.service';

@Processor('keyword-search-execution')
@Injectable()
export class KeywordSearchJobWorker {
  private readonly logger: LoggerService;

  constructor(
    @Inject(LoggerService) loggerService: LoggerService,
    private readonly orchestrator: KeywordSearchOrchestratorService,
    private readonly keywordScheduler: KeywordSearchSchedulerService,
  ) {
    this.logger = loggerService.setContext('KeywordSearchJobWorker');
  }

  @Process('run-keyword-search')
  async handle(job: Job<KeywordSearchJobData>): Promise<void> {
    const correlationId = CorrelationUtils.generateCorrelationId();
    const { subreddit, entities, source } = job.data;

    this.logger.info('Executing keyword search job', {
      correlationId,
      jobId: job.id,
      subreddit,
      source,
      entityCount: entities.length,
    });

    try {
      const result = await this.orchestrator.executeKeywordSearchCycle(
        subreddit,
        entities,
      );

      if (job.data.trackCompletion) {
        await this.keywordScheduler.markSearchCompleted(
          subreddit,
          true,
          result.metadata.processedEntities,
        );
      }

      this.logger.info('Keyword search job completed', {
        correlationId,
        jobId: job.id,
        subreddit,
        processedEntities: result.metadata.processedEntities,
      });
    } catch (error) {
      if (job.data.trackCompletion) {
        await this.keywordScheduler.markSearchCompleted(subreddit, false, 0);
      }

      this.logger.error('Keyword search job failed', {
        correlationId,
        jobId: job.id,
        subreddit,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
