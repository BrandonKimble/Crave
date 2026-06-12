import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { AttributeOntologyService } from './attribute-ontology.service';
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
    BullModule.registerQueue({ name: ATTRIBUTE_ONTOLOGY_QUEUE }),
  ],
  providers: [
    AttributeOntologyService,
    AttributeOntologyQueueService,
    AttributeOntologyWorker,
  ],
  exports: [AttributeOntologyService, AttributeOntologyQueueService],
})
export class AttributeOntologyModule {}
