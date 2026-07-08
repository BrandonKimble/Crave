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
      collectableMarketKey,
      safeIntervalDays,
      sortPlan,
    } = job.data;
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
          collectableMarketKey,
          source,
          termCount: terms.length,
          sortsPlanned: sortPlan?.map((entry) => entry.sort) ?? undefined,
        });

        try {
          const result = await this.orchestrator.executeKeywordSearchCycle(
            subreddit,
            terms,
            { source, collectableMarketKey, safeIntervalDays, sortPlan },
          );

          // Cadence advances in CollectionSchedulerService at dispatch time
          // (collection_schedules rows). lastTopRelevanceRunAt is stamped HERE,
          // post-success, as the SINGLE writer — recording it at enqueue would
          // record intent as outcome (a failed job would suppress heavy sorts
          // for the full 60d window).
          const ranHeavySorts =
            sortPlan?.some(
              (entry) => entry.sort === 'top' || entry.sort === 'relevance',
            ) ?? false;

          if (ranHeavySorts) {
            await this.keywordScheduler.recordTopRelevanceRun(
              subreddit,
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
