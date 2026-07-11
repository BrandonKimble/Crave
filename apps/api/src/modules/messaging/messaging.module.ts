import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedModule } from '../../shared';
import { IdentityModule } from '../identity/identity.module';
import { MessagingController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { SharePackageResolverService } from './share-package-resolver.service';

/** W3 messaging (plans/w3-messaging-design.md). REST + polling v1; the
 *  realtime seam is client-side (useConversationSync) — no gateway here. */
@Module({
  imports: [PrismaModule, SharedModule, IdentityModule],
  controllers: [MessagingController],
  providers: [MessagingService, SharePackageResolverService],
  exports: [MessagingService, SharePackageResolverService],
})
export class MessagingModule {}
