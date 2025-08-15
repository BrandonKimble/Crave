import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LLMService } from './llm.service';
import { LLMHealthController } from './llm-health.controller';
import { LLMChunkingService } from './llm-chunking.service';
import { LLMConcurrentProcessingService } from './llm-concurrent-processing.service';
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
  providers: [LLMService, LLMChunkingService, LLMConcurrentProcessingService],
  controllers: [LLMHealthController],
  exports: [LLMService, LLMChunkingService, LLMConcurrentProcessingService],
})
export class LLMModule {}
