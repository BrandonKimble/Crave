import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SharedModule } from '../shared/shared.module';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { CategoryAggregateRepository } from './category-aggregate.repository';

/**
 * Repository module providing data access layer
 * EntityRepository: Used by EntityResolutionService
 * ConnectionRepository: Used by QualityScoreService
 * CategoryAggregateRepository: Used by QualityScoreService for category fallbacks
 */
@Module({
  imports: [PrismaModule, SharedModule],
  providers: [
    EntityRepository,
    ConnectionRepository,
    CategoryAggregateRepository,
  ],
  exports: [
    EntityRepository,
    ConnectionRepository,
    CategoryAggregateRepository,
  ],
})
export class RepositoryModule {}
