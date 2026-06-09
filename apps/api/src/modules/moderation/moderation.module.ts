import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { ModerationService } from './moderation.service';

@Module({
  imports: [SharedModule, LLMModule],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
