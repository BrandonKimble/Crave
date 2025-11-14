import { Module } from '@nestjs/common';
import { SharedModule } from '../../shared/shared.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationDeviceService } from './notification-device.service';
import { NotificationDispatcherService } from './notification-dispatcher.service';

@Module({
  imports: [SharedModule, PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeviceService,
    NotificationDispatcherService,
  ],
  exports: [NotificationsService, NotificationDeviceService],
})
export class NotificationsModule {}
