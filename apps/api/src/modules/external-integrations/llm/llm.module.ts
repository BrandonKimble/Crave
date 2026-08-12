import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { GeminiContextCacheRegistry } from './gemini-context-cache.registry';
import { LLMService } from './llm.service';
import { PromptRegistryService } from './prompt-registry.service';
import { GeminiBatchService } from './gemini-batch.service';
import { PooledBatchRunner } from './pooled-batch-runner';
import { EmbeddingService } from './embedding.service';
import { LLMChunkingService } from './llm-chunking.service';
import { LLMConcurrentProcessingService } from './llm-concurrent-processing.service';
import { SmartLLMProcessor } from './rate-limiting/smart-llm-processor.service';
import { CentralizedRateLimiter } from './rate-limiting/centralized-rate-limiter.service';
import { SharedModule } from '../../../shared/shared.module';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    SharedModule,
    PrismaModule, // For LoggerService
  ],
  providers: [
    GeminiContextCacheRegistry,
    LLMService,
    PromptRegistryService,
    GeminiBatchService,
    PooledBatchRunner,
    EmbeddingService,
    LLMChunkingService,
    LLMConcurrentProcessingService,
    CentralizedRateLimiter,
    SmartLLMProcessor,
  ],
  exports: [
    LLMService,
    PromptRegistryService,
    GeminiBatchService,
    PooledBatchRunner,
    EmbeddingService,
    LLMChunkingService,
    LLMConcurrentProcessingService,
    CentralizedRateLimiter,
    SmartLLMProcessor,
  ],
})
export class LLMModule {}
