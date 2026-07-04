import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { EntityTextSearchService } from './entity-text-search.service';
import { EntityEmbeddingReconcilerService } from './entity-embedding-reconciler.service';

@Module({
  imports: [SharedModule, PrismaModule, LLMModule],
  providers: [EntityTextSearchService, EntityEmbeddingReconcilerService],
  exports: [EntityTextSearchService, EntityEmbeddingReconcilerService],
})
export class EntityTextSearchModule {}
