import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../../shared/shared.module';
import { ExternalIntegrationsModule } from '../../external-integrations/external-integrations.module';
import { EntityResolverModule } from '../entity-resolver/entity-resolver.module';
import { QualityScoreModule } from '../quality-score/quality-score.module';
import { RepositoryModule } from '../../../repositories/repository.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { ArchiveStreamProcessorService } from './archive-stream-processor.service';
import { ArchiveZstdDecompressor } from './archive-zstd-decompressor.service';
import { ArchiveIngestionService } from './archive-ingestion.service';
import { ArchiveProcessingMetricsService } from './archive-processing-metrics.service';
import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { ChronologicalCollectionWorker } from './chronological-collection.worker';
import { ContentRetrievalMonitoringService } from './content-retrieval-monitoring.service';
import { CollectionJobSchedulerService } from './collection-job-scheduler.service';
import { KeywordSearchSchedulerService } from './keyword-search-scheduler.service';
import { EntityPrioritySelectionService } from './entity-priority-selection.service';
import { KeywordSearchOrchestratorService } from './keyword-search-orchestrator.service';
import { UnifiedProcessingService } from './unified-processing.service';
import { SubredditVolumeTrackingService } from './subreddit-volume-tracking.service';
import { VolumeTrackingProcessor } from './volume-tracking.processor';
import { ChronologicalBatchProcessingWorker } from './chronological-batch.worker';
import { KeywordBatchProcessingWorker } from './keyword-batch-processing.worker';
import { ArchiveBatchProcessingWorker } from './archive-batch.worker';
import { ArchiveCollectionWorker } from './archive-collection.worker';
import { RedditBatchProcessingService } from './reddit-batch-processing.service';

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
 * - CollectionJobSchedulerService: Orchestrates automated job scheduling
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
    QualityScoreModule, // Provides QualityScoreService for PRD Section 5.3 compliance
    RepositoryModule, // Provides repository services for database access
    BullModule.registerQueue({
      name: 'chronological-collection',
    }),
    BullModule.registerQueue({
      name: 'volume-tracking',
    }),
    BullModule.registerQueue({
      name: 'chronological-batch-processing-queue',
    }),
    BullModule.registerQueue({
      name: 'keyword-batch-processing-queue',
    }),
    BullModule.registerQueue({
      name: 'archive-batch-processing-queue',
    }),
    BullModule.registerQueue({
      name: 'archive-collection',
    }),
  ],
  providers: [
    ArchiveZstdDecompressor,
    ArchiveStreamProcessorService,
    ArchiveIngestionService,
    ArchiveProcessingMetricsService,
    RedditDataExtractorService,
    // Chronological Collection components (PRD Section 5.1.2)
    ChronologicalCollectionWorker,
    ChronologicalBatchProcessingWorker,
    RedditBatchProcessingService,
    KeywordBatchProcessingWorker,
    ArchiveBatchProcessingWorker,
    ArchiveCollectionWorker,
    // Content Retrieval Pipeline components (PRD Section 5.1.2 & 6.1)
    ContentRetrievalMonitoringService,
    // Scheduled Collection Jobs components (PRD Section 5.1.2)
    CollectionJobSchedulerService,
    KeywordSearchSchedulerService,
    // Keyword Entity Search components (PRD Section 5.1.2)
    EntityPrioritySelectionService,
    KeywordSearchOrchestratorService,
    // Unified Processing Integration components (PRD Section 5.1.2 & 6.1)
    UnifiedProcessingService,
    // Volume Tracking components (PRD Section 5.1.2)
    SubredditVolumeTrackingService,
    VolumeTrackingProcessor,
  ],
  exports: [
    ArchiveZstdDecompressor,
    ArchiveStreamProcessorService,
    ArchiveIngestionService,
    ArchiveProcessingMetricsService,
    RedditDataExtractorService,
    // Export chronological collection components
    ChronologicalCollectionWorker,
    ChronologicalBatchProcessingWorker,
    RedditBatchProcessingService,
    KeywordBatchProcessingWorker,
    ArchiveBatchProcessingWorker,
    ArchiveCollectionWorker,
    // Export content retrieval pipeline components
    ContentRetrievalMonitoringService,
    // Export scheduled collection jobs components
    CollectionJobSchedulerService,
    KeywordSearchSchedulerService,
    // Export keyword entity search components
    EntityPrioritySelectionService,
    KeywordSearchOrchestratorService,
    // Export unified processing integration components
    UnifiedProcessingService,
    // Export volume tracking components
    SubredditVolumeTrackingService,
    VolumeTrackingProcessor,
  ],
})
export class RedditCollectorModule {}
