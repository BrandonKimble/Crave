import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from '../../../shared/shared.module';
import { StreamProcessorService } from './stream-processor.service';
import { PushshiftProcessorService } from './pushshift-processor.service';
import { ProcessingMetricsService } from './processing-metrics.service';
import { RedditDataExtractorService } from './reddit-data-extractor.service';
import { HistoricalContentPipelineService } from './historical-content-pipeline.service';

/**
 * Reddit Collector Module
 *
 * Implements PRD Section 5.1.1: Initial Historical Load (Primary Foundation)
 * Provides stream processing capabilities for zstd-compressed ndjson archive files
 * with memory-efficient handling of large Pushshift datasets
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
  ],
  exports: [
    StreamProcessorService,
    PushshiftProcessorService,
    ProcessingMetricsService,
    RedditDataExtractorService,
    HistoricalContentPipelineService,
  ],
})
export class RedditCollectorModule {}
