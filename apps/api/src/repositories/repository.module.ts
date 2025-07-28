import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SharedModule } from '../shared/shared.module';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { MentionRepository } from './mention.repository';
import { UserRepository } from './user.repository';
import { SubscriptionRepository } from './subscription.repository';
import { UserEventRepository } from './user-event.repository';
import { EntityContextService } from './entity-context.service';
import { BulkOperationsService } from './bulk-operations.service';

/**
 * Repository module providing data access layer
 * Exports all repository classes and services for dependency injection
 */
@Module({
  imports: [PrismaModule, SharedModule],
  providers: [
    EntityRepository,
    ConnectionRepository,
    MentionRepository,
    UserRepository,
    SubscriptionRepository,
    UserEventRepository,
    EntityContextService,
    BulkOperationsService,
  ],
  exports: [
    EntityRepository,
    ConnectionRepository,
    MentionRepository,
    UserRepository,
    SubscriptionRepository,
    UserEventRepository,
    EntityContextService,
    BulkOperationsService,
  ],
})
export class RepositoryModule {}
