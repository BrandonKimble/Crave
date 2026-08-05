import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { EntityDisplayService } from './entity-display.service';
import { LabelSweepService } from './label-sweep.service';
import { VocabularyGenerator } from './vocabulary-generator';

/**
 * N10 — the display boundary as a module.
 *
 * @Global because "how a concept is rendered to a human" is a cross-cutting
 * property of the product, not a feature of one module: search, autocomplete,
 * home and polls all render concepts, and making each one import a display
 * module is exactly the friction that produces a 38th call site rendering
 * `.name` directly.
 */
@Global()
@Module({
  imports: [PrismaModule, LLMModule],
  providers: [EntityDisplayService, LabelSweepService, VocabularyGenerator],
  exports: [EntityDisplayService, LabelSweepService, VocabularyGenerator],
})
export class EntityDisplayModule {}
