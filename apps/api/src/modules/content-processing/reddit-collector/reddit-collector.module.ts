import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../../shared/shared.module';
import { ExternalIntegrationsModule } from '../../external-integrations/external-integrations.module';
import { EntityResolverModule } from '../entity-resolver/entity-resolver.module';
import { RepositoryModule } from '../../../repositories/repository.module';
import { StreamProcessorService } from './stream-processor.service';
import { SystemZstdDecompressor } from './system-zstd-decompressor.service';
import { PushshiftProcessorService } from './pushshift-processor.service';
import { ProcessingMetricsService } from './processing-metrics.service';
import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { BatchProcessingCoordinatorService } from './batch-processing-coordinator.service';
import { ResourceMonitoringService } from './resource-monitoring.service';
import { ProcessingCheckpointService } from './processing-checkpoint.service';
import { HistoricalLlmIntegrationAdapter } from './historical-llm-integration.adapter';
import { HistoricalLlmIntegrationConfigService } from './historical-llm-integration.config';
import { HistoricalLlmIntegrationValidator } from './historical-llm-integration.validator';
import { DualCollectionStrategyService } from './dual-collection-strategy.service';
import { ChronologicalCollectionService } from './chronological-collection.service';
import { CollectionSchedulingService } from './collection-scheduling.service';
import { ChronologicalCollectionProcessor } from './chronological-collection.processor';
import { ChronologicalLlmIntegrationService } from './chronological-llm-integration.service';
import { ContentRetrievalPipelineService } from './content-retrieval-pipeline.service';
import { ContentRetrievalMonitoringService } from './content-retrieval-monitoring.service';
import { CollectionJobSchedulerService } from './collection-job-scheduler.service';
import { CollectionJobMonitoringService } from './collection-job-monitoring.service';
import { CollectionJobStateService } from './collection-job-state.service';
import { KeywordSearchSchedulerService } from './keyword-search-scheduler.service';
import { EntityPrioritySelectionService } from './entity-priority-selection.service';
import { KeywordSearchOrchestratorService } from './keyword-search-orchestrator.service';
import { DataMergeService } from './data-merge.service';
import { DuplicateDetectionService } from './duplicate-detection.service';
import { UnifiedProcessingService } from './unified-processing.service';

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
 * - Dual collection strategy with chronological cycles
 * - Dynamic scheduling with safety buffer equation
 * - Integration with existing M02 LLM processing pipeline
 * - Error handling and retry logic for reliable collection
 *
 * Scheduled Collection Jobs (Section 5.1.2):
 * - Automated job scheduling using Bull queues
 * - Comprehensive error handling and retry logic
 * - Job monitoring, alerting, and performance tracking
 *
 * Data Merge Logic (Section 5.1.2 & 6.1):
 * - Temporal merging of historical archives and real-time API data
 * - Source attribution tracking and gap minimization
 * - Quality validation and comprehensive merge statistics
 * - Job state persistence and resume capability
 * - Monthly keyword entity search scheduling
 *
 * Duplicate Detection (Section 5.1.2 & 6.1):
 * - Comprehensive duplicate detection between Pushshift archives and Reddit API
 * - Exact ID-based matching to prevent duplicate processing
 * - Performance optimization for large datasets
 * - Overlap pattern analysis and statistics tracking
 *
 * Unified Processing Integration (Section 5.1.2 & 6.1):
 * - Integration of Reddit API data with existing M02 LLM processing pipeline
 * - Unified entity extraction for both historical and real-time data sources
 * - Six-step processing pipeline from data retrieval to quality score updates
 * - Maintains consistency with existing processing standards
 *
 * Key Services:
 * - DualCollectionStrategyService: Orchestrates both collection strategies
 * - ChronologicalCollectionService: Handles /r/subreddit/new collection
 * - CollectionSchedulingService: Implements safety buffer calculations
 * - ChronologicalCollectionProcessor: Bull queue processor for scheduled jobs
 * - ChronologicalLlmIntegrationService: Bridges with M02 LLM pipeline
 * - CollectionJobSchedulerService: Orchestrates automated job scheduling
 * - CollectionJobMonitoringService: Tracks job performance and health
 * - CollectionJobStateService: Handles job state persistence and resume
 * - KeywordSearchSchedulerService: Manages monthly keyword search cycles
 * - DuplicateDetectionService: Comprehensive duplicate detection and filtering
 * - UnifiedProcessingService: Main orchestrator for LLM processing integration
 */
@Module({
  imports: [
    ConfigModule,
    SharedModule, // Provides LoggerService
    ExternalIntegrationsModule, // Provides LLMService for integration
    EntityResolverModule, // Provides EntityResolutionService for unified processing
    RepositoryModule, // Provides BulkOperationsService for database operations
    BullModule.registerQueue({
      name: 'chronological-collection',
    }),
  ],
  providers: [
    SystemZstdDecompressor,
    StreamProcessorService,
    PushshiftProcessorService,
    ProcessingMetricsService,
    RedditDataExtractorService,
    HistoricalContentPipelineService,
    BatchProcessingCoordinatorService,
    ResourceMonitoringService,
    ProcessingCheckpointService,
    // LLM Integration components
    HistoricalLlmIntegrationAdapter,
    HistoricalLlmIntegrationConfigService,
    HistoricalLlmIntegrationValidator,
    // Dual Collection Strategy components (PRD Section 5.1.2)
    DualCollectionStrategyService,
    ChronologicalCollectionService,
    CollectionSchedulingService,
    ChronologicalCollectionProcessor,
    ChronologicalLlmIntegrationService,
    // Content Retrieval Pipeline components (PRD Section 5.1.2 & 6.1)
    ContentRetrievalPipelineService,
    ContentRetrievalMonitoringService,
    // Scheduled Collection Jobs components (PRD Section 5.1.2)
    CollectionJobSchedulerService,
    CollectionJobMonitoringService,
    CollectionJobStateService,
    KeywordSearchSchedulerService,
    // Keyword Entity Search components (PRD Section 5.1.2)
    EntityPrioritySelectionService,
    KeywordSearchOrchestratorService,
    // Data Merge components (PRD Section 5.1.2 & 6.1)
    DataMergeService,
    // Duplicate Detection components (PRD Section 5.1.2 & 6.1)
    DuplicateDetectionService,
    // Unified Processing Integration components (PRD Section 5.1.2 & 6.1)
    UnifiedProcessingService,
  ],
  exports: [
    SystemZstdDecompressor,
    StreamProcessorService,
    PushshiftProcessorService,
    ProcessingMetricsService,
    RedditDataExtractorService,
    HistoricalContentPipelineService,
    BatchProcessingCoordinatorService,
    ResourceMonitoringService,
    ProcessingCheckpointService,
    // Export integration components for use in other modules
    HistoricalLlmIntegrationAdapter,
    HistoricalLlmIntegrationConfigService,
    HistoricalLlmIntegrationValidator,
    // Export dual collection strategy components
    DualCollectionStrategyService,
    ChronologicalCollectionService,
    CollectionSchedulingService,
    ChronologicalLlmIntegrationService,
    // Export content retrieval pipeline components
    ContentRetrievalPipelineService,
    ContentRetrievalMonitoringService,
    // Export scheduled collection jobs components
    CollectionJobSchedulerService,
    CollectionJobMonitoringService,
    CollectionJobStateService,
    KeywordSearchSchedulerService,
    // Export keyword entity search components
    EntityPrioritySelectionService,
    KeywordSearchOrchestratorService,
    // Export data merge components
    DataMergeService,
    // Export duplicate detection components
    DuplicateDetectionService,
    // Export unified processing integration components
    UnifiedProcessingService,
  ],
})
export class RedditCollectorModule {}
