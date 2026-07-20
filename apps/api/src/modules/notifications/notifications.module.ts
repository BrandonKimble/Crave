import { forwardRef, Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { IdentityModule } from '../identity/identity.module';
import { PlacesModule } from '../places/places.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDeviceService } from './notification-device.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';
import { UserNotificationFeedService } from './user-notification-feed.service';

@Module({
  // forwardRef: identity imports THIS module for the follow→feed producer; this module
  // imports identity for ClerkAuthGuard on the feed endpoints. Same pattern as favorites.
  // PlacesModule: registration resolves placeAt(home location) →
  // homePlaceId via PlacesCatalogService.smallestContaining (§4 home-place
  // registration).
  imports: [
    SharedModule,
    PrismaModule,
    PlacesModule,
    forwardRef(() => IdentityModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeviceService,
    NotificationDispatcherService,
    UserNotificationFeedService,
  ],
  exports: [
    NotificationsService,
    NotificationDeviceService,
    UserNotificationFeedService,
  ],
})
export class NotificationsModule {}
