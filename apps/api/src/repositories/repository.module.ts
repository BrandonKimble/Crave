import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SharedModule } from '../shared/shared.module';
import { EntityRepository } from './entity.repository';
import { ConnectionRepository } from './connection.repository';
import { MentionRepository } from './mention.repository';
import { UserRepository } from './user.repository';
import { SubscriptionRepository } from './subscription.repository';
import { UserEventRepository } from './user-event.repository';

/**
 * Repository module providing data access layer
 * Exports all repository classes for dependency injection
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
  ],
  exports: [
    EntityRepository,
    ConnectionRepository,
    MentionRepository,
    UserRepository,
    SubscriptionRepository,
    UserEventRepository,
  ],
})
export class RepositoryModule {}
