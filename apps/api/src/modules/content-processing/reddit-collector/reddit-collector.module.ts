import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../../shared/shared.module';
import { ExternalIntegrationsModule } from '../../external-integrations/external-integrations.module';
import { EntityResolverModule } from '../entity-resolver/entity-resolver.module';
import { PublicCraveScoreModule } from '../public-crave-score';
import { RepositoryModule } from '../../../repositories/repository.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ArchiveStreamProcessorService } from './archive/archive-stream-processor.service';
import { ArchiveZstdDecompressor } from './archive/archive-zstd-decompressor.service';
import { ArchiveIngestionService } from './archive/archive-ingestion.service';
import { ArchiveProcessingMetricsService } from './archive/archive-processing-metrics.service';
import { ChronologicalCollectionWorker } from './chronological/chronological-collection.worker';
import { CollectionJobSchedulerService } from './chronological/collection-job-scheduler.service';
import { KeywordSliceSelectionService } from './keyword-slice-selection.service';
import { KeywordAttemptHistoryService } from './keyword-attempt-history.service';
import { KeywordSearchOrchestratorService } from './keyword-search-orchestrator.service';
import { UnifiedProcessingService } from './unified-processing.service';
import { ChronologicalBatchProcessingWorker } from './chronological/chronological-batch.worker';
import { KeywordBatchProcessingWorker } from './keyword-batch-processing.worker';
import { KeywordSearchJobWorker } from './keyword-search-job.worker';
import { KeywordSearchMetricsService } from './keyword-search-metrics.service';
import { ArchiveBatchProcessingWorker } from './archive/archive-batch.worker';
import { ArchiveCollectionWorker } from './archive/archive-collection.worker';
import { RedditBatchProcessingService } from './reddit-batch-processing.service';
import { CollectionEvidenceService } from './collection-evidence.service';
import { ExtractionPipelineService } from './extraction-pipeline.service';
import { RelevanceGateService } from './relevance-gate.service';
import { CollectorPacerService } from './collector-pacer.service';
import { CollectorSourceRegistryService } from './collector-source-registry.service';
import { CollectorEstimators } from './collector-estimators';
import { ProjectionRebuildService } from './projection-rebuild.service';
import { ReplayService } from './replay.service';
import { RestaurantEnrichmentModule } from '../../restaurant-enrichment/restaurant-enrichment.module';
import { AnalyticsModule } from '../../analytics/analytics.module';
import { MarketsModule } from '../../markets/markets.module';
import { SignalsModule } from '../../signals/signals.module';
import { AttributeOntologyModule } from '../../attribute-ontology/attribute-ontology.module';
import { BullQueueMetricsService } from './bull-queue-metrics.service';
import { isWorkerRuntime } from '../../../shared/utils/process-role';

const redditCollectorCoreProviders = [
  CollectionEvidenceService,
  ExtractionPipelineService,
  RelevanceGateService,
  ProjectionRebuildService,
  ReplayService,
  UnifiedProcessingService,
];

const redditCollectorWorkerProviders = isWorkerRuntime()
  ? [
      ArchiveZstdDecompressor,
      ArchiveStreamProcessorService,
      ArchiveIngestionService,
      ArchiveProcessingMetricsService,
      // Chronological Collection components
      ChronologicalCollectionWorker,
      ChronologicalBatchProcessingWorker,
      RedditBatchProcessingService,
      KeywordBatchProcessingWorker,
      KeywordSearchJobWorker,
      ArchiveBatchProcessingWorker,
      ArchiveCollectionWorker,
      KeywordSearchMetricsService,
      BullQueueMetricsService,
      // §10 source-centric collector: CollectorPacerService is THE dispatch
      // loop (cron) — worker-only by module composition; the api role must
      // not instantiate any collection scheduling machinery.
      CollectorPacerService,
      CollectorSourceRegistryService,
      CollectorEstimators,
      CollectionJobSchedulerService,
      // Keyword Entity Search components
      KeywordSliceSelectionService,
      KeywordAttemptHistoryService,
      KeywordSearchOrchestratorService,
    ]
  : [];

/**
 * Reddit Collector Module
 *
 * Implements PRD Section 5.1: Data Collection Strategy & Architecture
 * Provides comprehensive Reddit data collection capabilities including:
 *
 * Historical Data Foundation (Section 5.1.1):
 * - Stream processing for zstd-compressed ndjson archive files
 * - Memory-efficient handling of large Pushshift datasets
 * - Batch processing coordination and resource monitoring
 *
 * Real-Time Collection (Section 5.1.2):
 * - Event-driven chronological collection cycles
 * - Dynamic scheduling with safety buffer equation
 * - Integration with existing M02 LLM processing pipeline
 * - Error handling and retry logic for reliable collection
 *
 * Scheduled Collection Jobs (Section 5.1.2):
 * - Automated job scheduling using Bull queues
 * - Comprehensive error handling and retry logic
 * - Job monitoring, alerting, and performance tracking
 *
 * Batch Processing Architecture (Section 5.1.2 & 6.1):
 * - Bull queue-based batch processing for scalable data handling
 * - Small, idempotent batches for reliable processing
 * - Job state persistence and resume capability
 * - Monthly keyword entity search scheduling
 *
 *
 * Unified Processing Integration (Section 5.1.2 & 6.1):
 * - Integration of Reddit API data with existing M02 LLM processing pipeline
 * - Unified entity extraction for both historical and real-time data sources
 * - Six-step processing pipeline from data retrieval to quality score updates
 * - Maintains consistency with existing processing standards
 *
 * Key Services:
 * - ChronologicalCollectionWorker: Handles /r/subreddit/new collection
 * - ChronologicalCollectionWorker: Bull queue processor and Reddit collection service
 * - CollectionJobSchedulerService: chronological dispatch provider (planning lives in CollectionSchedulerService)
 * - KeywordSearchSchedulerService: Manages monthly keyword search cycles
 * - UnifiedProcessingService: Main orchestrator for LLM processing integration
 */
@Module({
  imports: [
    ConfigModule,
    SharedModule, // Provides LoggerService
    PrismaModule, // Provides PrismaService for database access
    ExternalIntegrationsModule, // Provides LLMService for integration
    EntityResolverModule, // Provides EntityResolutionService for unified processing
    AttributeOntologyModule, // Adjudicates pending attributes after collection batches
    PublicCraveScoreModule,
    RepositoryModule, // Provides repository services for database access
    BullModule.registerQueue({
      name: 'chronological-collection',
    }),
    BullModule.registerQueue({
      name: 'chronological-batch-processing-queue',
    }),
    BullModule.registerQueue({
      name: 'keyword-batch-processing-queue',
    }),
    BullModule.registerQueue({
      name: 'keyword-search-execution',
    }),
    BullModule.registerQueue({
      name: 'archive-batch-processing-queue',
    }),
    BullModule.registerQueue({
      name: 'archive-collection',
    }),
    forwardRef(() => RestaurantEnrichmentModule),
    AnalyticsModule,
    MarketsModule,
    SignalsModule, // §11/C3: collector demand reads the signals substrate
  ],
  providers: [
    ...redditCollectorCoreProviders,
    ...redditCollectorWorkerProviders,
  ],
  exports: [...redditCollectorCoreProviders, ...redditCollectorWorkerProviders],
})
export class RedditCollectorModule {}
