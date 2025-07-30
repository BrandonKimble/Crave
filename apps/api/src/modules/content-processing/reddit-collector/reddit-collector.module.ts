import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

/**
 * Reddit Collector Module
 *
 * Implements PRD Section 5.1.1: Initial Historical Load (Primary Foundation)
 * Provides stream processing capabilities for zstd-compressed ndjson archive files
 * with memory-efficient handling of large Pushshift datasets.
 *
 * Enhanced with batch processing coordination system and LLM integration:
 * - BatchProcessingCoordinatorService: Orchestrates processing pipeline
 * - ResourceMonitoringService: Monitors memory usage and system performance
 * - ProcessingCheckpointService: Enables resumption from interrupted processing
 * - HistoricalLlmIntegrationAdapter: Bridges historical data with M02 LLM pipeline
 * - HistoricalLlmIntegrationValidator: Validates data structure compatibility
 * - HistoricalLlmIntegrationConfigService: Centralizes integration configuration
 */
@Module({
  imports: [
    ConfigModule,
    SharedModule, // Provides LoggerService
    ExternalIntegrationsModule, // Provides LLMService for integration
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
  ],
})
export class RedditCollectorModule {}
