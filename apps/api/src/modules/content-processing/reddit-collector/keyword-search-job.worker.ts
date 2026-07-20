import { Injectable, Inject } from '@nestjs/common';
import { Processor, Process } from '@nestjs/bull';
import { Job } from 'bull';
import { LoggerService, CorrelationUtils } from '../../../shared';
import {
  KeywordSearchOrchestratorService,
  KeywordSearchJobData,
} from './keyword-search-orchestrator.service';
import { KeywordSearchMetricsService } from './keyword-search-metrics.service';
import { CollectorSourceRegistryService } from './collector-source-registry.service';
import { GovernanceService } from '../../external-integrations/governance/governance.service';
import { RedditGovernanceDenialError } from '../../external-integrations/reddit/reddit.exceptions';
import { REDDIT_POOL_NAME } from './reddit-collection-adapter';

@Processor('keyword-search-execution')
@Injectable()
export class KeywordSearchJobWorker {
  private readonly logger: LoggerService;

  constructor(
    @Inject(LoggerService) loggerService: LoggerService,
    private readonly orchestrator: KeywordSearchOrchestratorService,
    private readonly sourceRegistry: CollectorSourceRegistryService,
    private readonly governance: GovernanceService,
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
      engineId,
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
          engineId,
          source,
          termCount: terms.length,
          sortsPlanned: sortPlan?.map((entry) => entry.sort) ?? undefined,
        });

        try {
          const result = await this.orchestrator.executeKeywordSearchCycle(
            subreddit,
            terms,
            {
              source,
              collectableMarketKey,
              engineId,
              safeIntervalDays,
              sortPlan,
            },
          );

          const sourceId =
            job.data.sourceId ??
            (await this.sourceRegistry.findRedditSourceByHandle(subreddit))
              ?.sourceId;
          if (sourceId) {
            // Cadence advances in CollectorPacerService at dispatch time.
            // lastTopRelevanceRunAt is stamped HERE on the lane row,
            // post-success, as the SINGLE writer — recording it at enqueue
            // would record intent as outcome (a failed job would suppress
            // heavy sorts for the full 60d window).
            const ranHeavySorts =
              sortPlan?.some(
                (entry) => entry.sort === 'top' || entry.sort === 'relevance',
              ) ?? false;
            if (ranHeavySorts) {
              await this.sourceRegistry.recordTopRelevanceRun(
                sourceId,
                result.metadata.executionStartTime,
              );
            }
            // §12.4 output-derived heartbeat (documents produced this tick)
            // + the §14.2 declared-vs-actual pair against the pacer's
            // reserved estimate.
            await this.sourceRegistry.recordLaneOutput(
              sourceId,
              'keyword',
              result.metadata.totalItems,
            );
            if (typeof job.data.declaredRequests === 'number') {
              this.governance.pools.recordActualPair(
                REDDIT_POOL_NAME,
                'collector.keyword',
                job.data.declaredRequests,
                result.performance.totalApiCalls,
              );
            }
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
          if (error instanceof RedditGovernanceDenialError) {
            // §12.3 typed not-now mid-dispatch: abort cleanly, re-arm the
            // keyword lane as due (the pacer advanced it at dispatch) — no
            // failure metric, no error branding, no attempt records (terms
            // simply stay due in selection).
            const sourceId =
              job.data.sourceId ??
              (await this.sourceRegistry.findRedditSourceByHandle(subreddit))
                ?.sourceId;
            if (sourceId) {
              await this.sourceRegistry
                .markLaneDue(sourceId, 'keyword')
                .catch(() => undefined);
            }
            this.logger.info(
              'Keyword dispatch deferred by governance (lane re-armed due)',
              {
                cycleId,
                correlationId: cycleId,
                jobId: job.id,
                subreddit,
                retryAfterMs: error.retryAfterMs,
              },
            );
            return;
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
