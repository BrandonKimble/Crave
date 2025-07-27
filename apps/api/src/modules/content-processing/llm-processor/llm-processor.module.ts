import { Module } from '@nestjs/common';
import { ContextDeterminationService } from './context-determination.service';
import { EntityResolverModule } from '../entity-resolver/entity-resolver.module';
import { SharedModule } from '../../../shared/shared.module';

/**
 * LLM Processor Module
 *
 * Processes LLM output for entity extraction and context determination
 * Implements PRD Section 3.1.2 - llm-processor: LLM content analysis and entity extraction
 * Implements PRD Section 4.2.2 - Context-dependent attribute handling
 */
@Module({
  imports: [EntityResolverModule, SharedModule],
  providers: [ContextDeterminationService],
  exports: [ContextDeterminationService],
})
export class LlmProcessorModule {}
