import { Module } from '@nestjs/common';
import { EntityResolutionService } from './entity-resolution.service';
import { RepositoryModule } from '../../../repositories/repository.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../../shared/shared.module';

/**
 * Entity Resolver Module
 *
 * Provides three-tier entity resolution system for content processing domain
 * Implements PRD Section 5.2.1 - Database Entity Resolution w/ Batching
 */
@Module({
  imports: [RepositoryModule, PrismaModule, SharedModule],
  providers: [EntityResolutionService],
  exports: [EntityResolutionService],
})
export class EntityResolverModule {}
