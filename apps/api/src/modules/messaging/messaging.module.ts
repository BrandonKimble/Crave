import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared';
import { IdentityModule } from '../identity/identity.module';
import { UserListAccessModule } from '../user-lists/user-list-access.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { SharePackageResolverService } from './share-package-resolver.service';
import { EntityAccessModule } from '../entities/entity-access.module';

/** W3 messaging (plans/w3-messaging-design.md). REST + polling v1; the
 *  realtime seam is client-side (useConversationSync) — no gateway here. */
@Module({
  imports: [
    PrismaModule,
    SharedModule,
    IdentityModule,
    // The share preview asks the ONE list-access law (it used to invent its own).
    UserListAccessModule,
    // The one saveable-entity law (D36).
    EntityAccessModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService, SharePackageResolverService],
  exports: [MessagingService, SharePackageResolverService],
})
export class MessagingModule {}
