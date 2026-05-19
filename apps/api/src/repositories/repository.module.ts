import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SharedModule } from '../shared/shared.module';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';

/**
 * Repository module providing data access layer
 * EntityRepository: Used by EntityResolutionService
 * ConnectionRepository: Used by QualityScoreService
 */
@Module({
  imports: [PrismaModule, SharedModule],
  providers: [EntityRepository, ConnectionRepository],
  exports: [EntityRepository, ConnectionRepository],
})
export class RepositoryModule {}
