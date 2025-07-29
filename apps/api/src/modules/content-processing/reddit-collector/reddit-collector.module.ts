import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { StreamProcessorService } from './stream-processor.service';
import { PushshiftProcessorService } from './pushshift-processor.service';
import { ProcessingMetricsService } from './processing-metrics.service';
import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';
import { BatchProcessingCoordinatorService } from './batch-processing-coordinator.service';
import { ResourceMonitoringService } from './resource-monitoring.service';
import { ProcessingCheckpointService } from './processing-checkpoint.service';

/**
 * Reddit Collector Module
 *
 * Implements PRD Section 5.1.1: Initial Historical Load (Primary Foundation)
 * Provides stream processing capabilities for zstd-compressed ndjson archive files
 * with memory-efficient handling of large Pushshift datasets.
 *
 * Enhanced with batch processing coordination system for realistic archive file sizes:
 * - BatchProcessingCoordinatorService: Orchestrates processing pipeline
 * - ResourceMonitoringService: Monitors memory usage and system performance
 * - ProcessingCheckpointService: Enables resumption from interrupted processing
 */
@Module({
  imports: [
    ConfigModule,
    SharedModule, // Provides LoggerService
  ],
  providers: [
    StreamProcessorService,
    PushshiftProcessorService,
    ProcessingMetricsService,
    RedditDataExtractorService,
    HistoricalContentPipelineService,
    BatchProcessingCoordinatorService,
    ResourceMonitoringService,
    ProcessingCheckpointService,
  ],
  exports: [
    StreamProcessorService,
    PushshiftProcessorService,
    ProcessingMetricsService,
    RedditDataExtractorService,
    HistoricalContentPipelineService,
    BatchProcessingCoordinatorService,
    ResourceMonitoringService,
    ProcessingCheckpointService,
  ],
})
export class RedditCollectorModule {}
