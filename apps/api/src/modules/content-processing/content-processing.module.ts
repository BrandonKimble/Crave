import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { ExternalIntegrationsModule } from '../external-integrations/external-integrations.module';
import { RedditCollectorModule } from './reddit-collector/reddit-collector.module';

/**
 * Content Processing Module
 *
 * Provides async LLM content processing capabilities:
 * - Queue-based processing with Bull Redis queues
 * - Async API endpoints for job submission and status tracking
 * - Integration with LLM processing pipeline
 * - Queue health monitoring and performance metrics
 *
 * This module serves as the main entry point for Phase 1 and 2
 * LLM processing scaling implementation.
 */
@Module({
  imports: [
    SharedModule, // Provides LoggerService
    ExternalIntegrationsModule, // Provides LLM services
    RedditCollectorModule, // Provides LLM processing queue and related services (including ContentProcessingController)
  ],
})
export class ContentProcessingModule {}
