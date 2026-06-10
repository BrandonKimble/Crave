import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { LLMModule } from '../external-integrations/llm/llm.module';
import { AttributeOntologyService } from './attribute-ontology.service';

@Module({
  imports: [SharedModule, PrismaModule, LLMModule],
  providers: [AttributeOntologyService],
  exports: [AttributeOntologyService],
})
export class AttributeOntologyModule {}
