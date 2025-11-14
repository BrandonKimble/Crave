import { Body, Controller, Post } from '@nestjs/common';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { NotificationDeviceService } from './notification-device.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly deviceService: NotificationDeviceService) {}

  @Post('devices/register')
  async registerDevice(@Body() dto: RegisterDeviceDto) {
    await this.deviceService.registerDevice(dto);
    return { status: 'ok' };
  }
}
