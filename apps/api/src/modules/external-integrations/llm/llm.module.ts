import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { LLMService } from './llm.service';
import { LLMHealthController } from './llm-health.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
    ConfigModule,
  ],
  providers: [LLMService],
  controllers: [LLMHealthController],
  exports: [LLMService],
})
export class LLMModule {}
