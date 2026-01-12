import { Injectable, Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  KeywordSearchOrchestratorService,
  KeywordSearchJobData,
} from './keyword-search-orchestrator.service';
import { KeywordSearchSchedulerService } from './keyword-search-scheduler.service';
import { KeywordSearchMetricsService } from './keyword-search-metrics.service';

@Processor('keyword-search-execution')
@Injectable()
export class KeywordSearchJobWorker {
  private readonly logger: LoggerService;

  constructor(
    @Inject(LoggerService) loggerService: LoggerService,
    private readonly orchestrator: KeywordSearchOrchestratorService,
    private readonly keywordScheduler: KeywordSearchSchedulerService,
    private readonly keywordSearchMetrics: KeywordSearchMetricsService,
  ) {
    this.logger = loggerService.setContext('KeywordSearchJobWorker');
  }

  @Process('run-keyword-search')
  async handle(job: Job<KeywordSearchJobData>): Promise<void> {
    const {
      subreddit,
      terms,
      source,
      collectionCoverageKey,
      safeIntervalDays,
      sortPlan,
    } = job.data;
    const scheduleKey = (collectionCoverageKey ?? subreddit)
      .trim()
      .toLowerCase();
    const cycleId =
      job.data.cycleId ?? CorrelationUtils.generateCorrelationId();

    return CorrelationUtils.runWithContext(
      { correlationId: cycleId, startTime: Date.now() },
      async () => {
        this.logger.info('Executing keyword search job', {
          cycleId,
          correlationId: cycleId,
          jobId: job.id,
          subreddit,
          collectionCoverageKey,
          source,
          termCount: terms.length,
          sortsPlanned: sortPlan?.map((entry) => entry.sort) ?? undefined,
        });

        try {
          const result = await this.orchestrator.executeKeywordSearchCycle(
            subreddit,
            terms,
            { source, collectionCoverageKey, safeIntervalDays, sortPlan },
          );

          if (job.data.trackCompletion) {
            await this.keywordScheduler.markSearchCompleted(
              scheduleKey,
              true,
              result.metadata.processedTerms,
            );
          }

          const ranHeavySorts =
            sortPlan?.some(
              (entry) => entry.sort === 'top' || entry.sort === 'relevance',
            ) ?? false;

          if (source === 'hot_spike' && ranHeavySorts) {
            this.keywordScheduler.recordTopRelevanceRun(
              scheduleKey,
              result.metadata.executionStartTime,
            );
          }

          this.keywordSearchMetrics.recordJobCompletion({
            source,
            subreddit,
            processedTerms: result.metadata.processedTerms,
          });

          this.logger.info('Keyword search job completed', {
            cycleId,
            correlationId: cycleId,
            jobId: job.id,
            subreddit,
            processedTerms: result.metadata.processedTerms,
          });
        } catch (error) {
          if (job.data.trackCompletion) {
            await this.keywordScheduler.markSearchCompleted(
              scheduleKey,
              false,
              0,
            );
          }

          this.keywordSearchMetrics.recordJobFailure({
            source,
            subreddit,
            error: error instanceof Error ? error.message : String(error),
          });

          this.logger.error('Keyword search job failed', {
            cycleId,
            correlationId: cycleId,
            jobId: job.id,
            subreddit,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
    );
  }
}
