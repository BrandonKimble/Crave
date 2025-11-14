import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class NotificationDeviceService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('NotificationDeviceService');
  }

  async registerDevice(dto: RegisterDeviceDto): Promise<void> {
    const normalizedToken = dto.token.trim();
    await this.prisma.notificationDevice.upsert({
      where: { expoPushToken: normalizedToken },
      create: {
        expoPushToken: normalizedToken,
        userId: dto.userId ?? null,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        locale: dto.locale ?? null,
        city: dto.city ?? null,
      },
      update: {
        userId: dto.userId ?? null,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        locale: dto.locale ?? null,
        city: dto.city ?? null,
        updatedAt: new Date(),
      },
    });

    this.logger.debug('Registered notification device', {
      hasUser: Boolean(dto.userId),
      platform: dto.platform,
      city: dto.city,
    });
  }

  async findDevices(filter?: { city?: string | null }) {
    return this.prisma.notificationDevice.findMany({
      where: {
        city: filter?.city
          ? { equals: filter.city, mode: 'insensitive' }
          : undefined,
      },
    });
  }
}
