import { Module } from '@nestjs/common';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { EntityResolutionService } from './entity-resolution.service';
import { AliasManagementService } from './alias-management.service';
import { RepositoryModule } from '../../../repositories/repository.module';
import { PrismaModule } from '../../../prisma/prisma.module';
import { SharedModule } from '../../../shared/shared.module';

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
    RedisModule.forRoot({
      config: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0', 10),
      },
    }),
  ],
  providers: [EntityResolutionService, AliasManagementService],
  exports: [EntityResolutionService, AliasManagementService],
})
export class EntityResolverModule {}
