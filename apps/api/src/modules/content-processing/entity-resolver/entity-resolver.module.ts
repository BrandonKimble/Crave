import { Module } from '@nestjs/common';
import { EntityResolutionService } from './entity-resolution.service';
import { FoodDedupeMergeService } from './food-dedupe-merge.service';
import { AliasManagementService } from './alias-management.service';
import { RepositoryModule } from '../../../repositories/repository.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../../shared/shared.module';
import { LLMModule } from '../../external-integrations/llm/llm.module';
import { EntityTextSearchModule } from '../../entity-text-search/entity-text-search.module';

/**
 * Entity Resolver Module
 *
 * Provides three-tier entity resolution system with alias management for content processing domain
 * Implements PRD Section 5.2.1 - Database Entity Resolution w/ Batching
 * Implements PRD Section 9.2.1 - Alias management: Automatic alias creation, duplicate prevention, scope-aware resolution
 */
@Module({
  imports: [
    RepositoryModule,
    PrismaModule,
    SharedModule,
    LLMModule,
    EntityTextSearchModule,
  ],
  providers: [
    EntityResolutionService,
    FoodDedupeMergeService,
    AliasManagementService,
  ],
  exports: [EntityResolutionService, AliasManagementService],
})
export class EntityResolverModule {}
