import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../../shared/shared.module';
import { ExternalIntegrationsModule } from '../../external-integrations/external-integrations.module';
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
 * Key Services:
 * - DualCollectionStrategyService: Orchestrates both collection strategies
 * - ChronologicalCollectionService: Handles /r/subreddit/new collection
 * - CollectionSchedulingService: Implements safety buffer calculations
 * - ChronologicalCollectionProcessor: Bull queue processor for scheduled jobs
 * - ChronologicalLlmIntegrationService: Bridges with M02 LLM pipeline
 */
@Module({
  imports: [
    ConfigModule,
    SharedModule, // Provides LoggerService
    ExternalIntegrationsModule, // Provides LLMService for integration
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
  ],
})
export class RedditCollectorModule {}
