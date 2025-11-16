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
    const normalizedCity =
      typeof dto.city === 'string' && dto.city.trim().length
        ? dto.city.trim()
        : null;
    await this.prisma.notificationDevice.upsert({
      where: { expoPushToken: normalizedToken },
      create: {
        expoPushToken: normalizedToken,
        userId: dto.userId ?? null,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        locale: dto.locale ?? null,
        city: normalizedCity,
      },
      update: {
        userId: dto.userId ?? null,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        locale: dto.locale ?? null,
        city: normalizedCity,
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

  async unregisterDevice(token: string): Promise<void> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return;
    }
    await this.prisma.notificationDevice.deleteMany({
      where: { expoPushToken: normalizedToken },
    });

    this.logger.debug('Unregistered notification device', {
      hasToken: Boolean(normalizedToken),
    });
  }
}
