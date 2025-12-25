import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LLMService } from './llm.service';
import { LLMChunkingService } from './llm-chunking.service';
import { LLMConcurrentProcessingService } from './llm-concurrent-processing.service';
import { SmartLLMProcessor } from './rate-limiting/smart-llm-processor.service';
import { CentralizedRateLimiter } from './rate-limiting/centralized-rate-limiter.service';
import { LlmRateLimiterMetricsService } from './rate-limiting/llm-rate-limiter-metrics.service';
import { SharedModule } from '../../../shared/shared.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    SharedModule, // For LoggerService
  ],
  providers: [
    LLMService,
    LLMChunkingService,
    LLMConcurrentProcessingService,
    CentralizedRateLimiter,
    SmartLLMProcessor,
    LlmRateLimiterMetricsService,
  ],
  exports: [
    LLMService,
    LLMChunkingService,
    LLMConcurrentProcessingService,
    CentralizedRateLimiter,
    SmartLLMProcessor,
    LlmRateLimiterMetricsService,
  ],
})
export class LLMModule {}
