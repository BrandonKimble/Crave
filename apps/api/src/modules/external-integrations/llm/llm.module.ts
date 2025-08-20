import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { LLMService } from './llm.service';
import { LLMHealthController } from './llm-health.controller';
import { LLMChunkingService } from './llm-chunking.service';
import { LLMConcurrentProcessingService } from './llm-concurrent-processing.service';
import { SmartLLMProcessor } from './rate-limiting/smart-llm-processor.service';
import { CentralizedRateLimiter } from './rate-limiting/centralized-rate-limiter.service';
import { SharedModule } from '../../../shared/shared.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
    RedisModule.forRoot({
      config: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
      }
    }),
    SharedModule, // For LoggerService
  ],
  providers: [
    LLMService, 
    LLMChunkingService, 
    LLMConcurrentProcessingService, 
    CentralizedRateLimiter,
    SmartLLMProcessor
  ],
  controllers: [LLMHealthController],
  exports: [
    LLMService, 
    LLMChunkingService, 
    LLMConcurrentProcessingService, 
    CentralizedRateLimiter,
    SmartLLMProcessor
  ],
})
export class LLMModule {}
