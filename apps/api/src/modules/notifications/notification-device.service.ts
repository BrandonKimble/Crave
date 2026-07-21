import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { PlacesCatalogService } from '../places/places-catalog.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

@Injectable()
export class NotificationDeviceService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly places: PlacesCatalogService,
  ) {
    this.logger = loggerService.setContext('NotificationDeviceService');
  }

  async registerDevice(dto: RegisterDeviceDto): Promise<void> {
    const normalizedToken = dto.token.trim();

    // §4 home-place registration: the client sends ground truth (a coordinate,
    // never a place id); the server judges placeAt = smallestContaining(point).
    // {lat,lng} → resolve (a point outside the catalog honestly resolves to
    // null); explicit null → clear (the user revoked location); absent →
    // leave the stored value untouched (people move — re-registration with a
    // coordinate updates it).
    const homePlaceId =
      dto.homeLocation === undefined
        ? undefined
        : dto.homeLocation === null
          ? null
          : ((
              await this.places.smallestContaining({
                lat: dto.homeLocation.lat,
                lng: dto.homeLocation.lng,
              })
            )?.placeId ?? null);

    await this.prisma.notificationDevice.upsert({
      where: { expoPushToken: normalizedToken },
      create: {
        expoPushToken: normalizedToken,
        userId: dto.userId ?? null,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        locale: dto.locale ?? null,
        homePlaceId: homePlaceId ?? null,
      },
      update: {
        userId: dto.userId ?? null,
        platform: dto.platform ?? null,
        appVersion: dto.appVersion ?? null,
        locale: dto.locale ?? null,
        ...(homePlaceId !== undefined ? { homePlaceId } : {}),
        updatedAt: new Date(),
      },
    });

    this.logger.debug('Registered notification device', {
      hasUser: Boolean(dto.userId),
      platform: dto.platform,
      hasHomeLocation: dto.homeLocation != null,
      homePlaceResolved: typeof homePlaceId === 'string',
    });
  }

  /**
   * §4 targeting read: devices whose home place is one of the given place ids
   * (the caller passes a poll place's subtree). SQL IN semantics exclude
   * NULL homePlaceId by construction — unknown-home devices are never pushed.
   */
  async findDevices(filter: { homePlaceIdIn: string[] }) {
    if (!filter.homePlaceIdIn.length) {
      return [];
    }
    return this.prisma.notificationDevice.findMany({
      where: { homePlaceId: { in: filter.homePlaceIdIn } },
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
