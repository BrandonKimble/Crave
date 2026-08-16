import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { SharedServicesModule } from '../external-integrations/shared/shared-services.module';
import { EntityLexiconBuilderService } from './entity-lexicon-builder.service';
import { EntityTextSearchService } from './entity-text-search.service';
import { EntityEmbeddingReconcilerService } from './entity-embedding-reconciler.service';
import { NameContainmentEdgeBuilderService } from './name-containment-edge-builder.service';
import { EntitySiblingEdgeBuilderService } from './entity-sibling-edge-builder.service';
import { SurfaceLocaleIndexService } from './surface-locale-index.service';
import { DeniedNameRegistryService } from './denied-name-registry.service';

@Module({
  imports: [SharedModule, PrismaModule, LLMModule, SharedServicesModule],
  providers: [
    DeniedNameRegistryService,
    EntityTextSearchService,
    EntityEmbeddingReconcilerService,
    EntitySiblingEdgeBuilderService,
    NameContainmentEdgeBuilderService,
    EntityLexiconBuilderService,
    SurfaceLocaleIndexService,
  ],
  exports: [
    DeniedNameRegistryService,
    EntityTextSearchService,
    EntityEmbeddingReconcilerService,
    EntitySiblingEdgeBuilderService,
    NameContainmentEdgeBuilderService,
    SurfaceLocaleIndexService,
  ],
})
export class EntityTextSearchModule {}
