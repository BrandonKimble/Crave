import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { EntityResolverModule } from '../content-processing/entity-resolver/entity-resolver.module';
import { AttributeOntologyService } from './attribute-ontology.service';
import { AttributeDedupeMergeService } from './attribute-dedupe-merge.service';
import {
  AttributeOntologyQueueService,
  ATTRIBUTE_ONTOLOGY_QUEUE,
} from './attribute-ontology-queue.service';
import { AttributeOntologyWorker } from './attribute-ontology.worker';

@Module({
  imports: [
    SharedModule,
    PrismaModule,
    LLMModule,
    // Hearing ledger + user-anchor rehome for the active-vocabulary
    // dedupe-merge lane (one implementation each; never re-provided here).
    EntityResolverModule,
    BullModule.registerQueue({ name: ATTRIBUTE_ONTOLOGY_QUEUE }),
  ],
  providers: [
    AttributeOntologyService,
    AttributeDedupeMergeService,
    AttributeOntologyQueueService,
    AttributeOntologyWorker,
  ],
  exports: [
    AttributeOntologyService,
    AttributeDedupeMergeService,
    AttributeOntologyQueueService,
  ],
})
export class AttributeOntologyModule {}
