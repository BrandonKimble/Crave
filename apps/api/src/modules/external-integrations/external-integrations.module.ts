import { Module } from '@nestjs/common';
import { RedditModule } from './reddit/reddit.module';
import { LLMModule } from './llm/llm.module';
import { GooglePlacesModule } from './google-places/google-places.module';

/**
 * External Integrations Module
 *
 * Implements PRD Section 9.2.1: "External integrations module: Centralized API management,
 * basic rate limiting for google-places, reddit-api, llm-api"
 *
 * Centralizes all external API integrations providing unified access to:
 * - Reddit API for community data collection
 * - Google Gemini LLM API for content analysis and entity extraction
 * - Google Places API for restaurant data enrichment and location services
 */
@Module({
  imports: [RedditModule, LLMModule, GooglePlacesModule],
  exports: [RedditModule, LLMModule, GooglePlacesModule],
})
export class ExternalIntegrationsModule {}
