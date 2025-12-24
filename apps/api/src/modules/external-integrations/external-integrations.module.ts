import { Module } from '@nestjs/common';
import { RedditModule } from './reddit/reddit.module';
import { LLMModule } from './llm/llm.module';
import { SharedServicesModule } from './shared/shared-services.module';
import { SharedModule } from '../../shared/shared.module';
import { GooglePlacesModule } from './google-places/google-places.module';
import { GoogleGeocodingModule } from './google-geocoding/google-geocoding.module';

/**
 * External Integrations Module
 *
 * Implements PRD Section 9.2.1: "External integrations module: Centralized API management,
 * basic rate limiting for reddit-api, llm-api"
 *
 * Centralizes all external API integrations providing unified access to:
 * - Reddit API for community data collection
 * - Google Gemini LLM API for content analysis and entity extraction
 *
 * Enhanced with:
 * - Centralized rate limiting coordination across all APIs
 * - Shared base service patterns for common functionality
 * - Unified error handling patterns
 */
@Module({
  imports: [
    SharedModule, // Import SharedModule for LoggerService
    SharedServicesModule, // Import for RateLimitCoordinatorService
    RedditModule,
    LLMModule,
    GooglePlacesModule,
    GoogleGeocodingModule,
  ],
  providers: [],
  exports: [
    SharedServicesModule, // Export so submodules can access RateLimitCoordinatorService
    RedditModule,
    LLMModule,
    GooglePlacesModule,
    GoogleGeocodingModule,
  ],
})
export class ExternalIntegrationsModule {}
