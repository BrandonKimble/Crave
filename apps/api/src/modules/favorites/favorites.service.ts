import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityType, FavoriteEventKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { SignalsService } from '../signals/signals.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Injectable()
export class FavoritesService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly signals: SignalsService,
  ) {
    this.logger = loggerService.setContext('FavoritesService');
  }

  listForUser(userId: string) {
    return this.prisma.userFavorite.findMany({
      where: { userId },
      include: {
        entity: {
          select: {
            entityId: true,
            name: true,
            type: true,
            city: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFavorite(userId: string, dto: CreateFavoriteDto) {
    const entity = await this.prisma.entity.findUnique({
      where: { entityId: dto.entityId },
      select: { entityId: true, type: true },
    });

    if (!entity) {
      // Keep this one strict so clients can surface a real error for missing entities.
      throw new NotFoundException('Entity not found');
    }

    if (dto.entityType && dto.entityType !== entity.type) {
      throw new BadRequestException('Entity type mismatch for favorite');
    }

    // Location-centric saves (master plan §7): a supplied locationId must be a
    // real location OF this restaurant; silently dropping a mismatch would
    // mis-pin the save, so it's a loud 400.
    let validatedLocationId: string | null = null;
    let validatedLocationPoint: { lat: number; lng: number } | null = null;
    if (dto.locationId) {
      const location = await this.prisma.restaurantLocation.findUnique({
        where: { locationId: dto.locationId },
        select: {
          locationId: true,
          restaurantId: true,
          latitude: true,
          longitude: true,
        },
      });
      if (!location || location.restaurantId !== entity.entityId) {
        throw new BadRequestException(
          'locationId does not belong to the favorited restaurant',
        );
      }
      validatedLocationId = location.locationId;
      if (location.latitude != null && location.longitude != null) {
        validatedLocationPoint = {
          lat: Number(location.latitude),
          lng: Number(location.longitude),
        };
      }
    }

    let createdNew = false;
    const favorite = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.userFavorite.findUnique({
        where: {
          userId_entityId: {
            userId,
            entityId: entity.entityId,
          },
        },
        select: { favoriteId: true },
      });

      if (existing) {
        return tx.userFavorite.update({
          where: { favoriteId: existing.favoriteId },
          data: {
            entityType: entity.type,
            ...(validatedLocationId ? { locationId: validatedLocationId } : {}),
          },
          include: {
            entity: {
              select: {
                entityId: true,
                name: true,
                type: true,
                city: true,
              },
            },
          },
        });
      }

      const created = await tx.userFavorite.create({
        data: {
          userId,
          entityId: entity.entityId,
          entityType: entity.type,
          locationId: validatedLocationId,
        },
        include: {
          entity: {
            select: {
              entityId: true,
              name: true,
              type: true,
              city: true,
            },
          },
        },
      });

      await tx.userFavoriteEvent.create({
        data: {
          userId,
          entityId: entity.entityId,
          entityType: entity.type,
          eventKind: FavoriteEventKind.added,
          occurredAt: created.createdAt,
          metadata: this.buildFavoriteEventMetadata('favorite_action'),
        },
      });

      createdNew = true;
      return created;
    });

    if (createdNew) {
      // DUAL-WRITE (delete with old logging — master plan §22, one-milestone hard deletion)
      // §3 signals: the favorite_added act beside userFavoriteEvent above.
      // Geo = the saved location's point, else the entity's primary
      // restaurant location (a FOOD favorite resolves its restaurant via the
      // food's most-evidenced connection — a food entityId is not a
      // restaurantId, and the ledger is append-only: a favorite written
      // without geo can never be backfilled).
      this.signals.record({
        kind: 'favorite_added',
        userId,
        subject: { entityId: entity.entityId },
        geo: validatedLocationPoint
          ? this.signals.bboxFromPoint(
              validatedLocationPoint.lat,
              validatedLocationPoint.lng,
            )
          : entity.type === EntityType.food
            ? this.signals.bboxFromFoodLocation(entity.entityId)
            : this.signals.bboxFromRestaurantLocation({
                restaurantId: entity.entityId,
              }),
        meta: { locationId: validatedLocationId ?? undefined },
      });
    }

    this.logger.debug('Added user favorite', {
      userId,
      entityId: favorite.entityId,
    });

    return favorite;
  }

  async removeFavorite(userId: string, favoriteId: string): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const favorite = await tx.userFavorite.findFirst({
        where: { favoriteId, userId },
        select: {
          favoriteId: true,
          entityId: true,
          entityType: true,
        },
      });

      if (!favorite) {
        return false;
      }

      await tx.userFavorite.delete({
        where: { favoriteId: favorite.favoriteId },
      });

      await tx.userFavoriteEvent.create({
        data: {
          userId,
          entityId: favorite.entityId,
          entityType: favorite.entityType,
          eventKind: FavoriteEventKind.removed,
          occurredAt: new Date(),
          metadata: this.buildFavoriteEventMetadata('favorite_action'),
        },
      });

      return true;
    });

    if (!removed) {
      this.logger.debug('Favorite already removed', { userId, favoriteId });
      return;
    }

    this.logger.debug('Removed user favorite', {
      userId,
      favoriteId,
    });
  }

  async removeFavoriteByEntityId(
    userId: string,
    entityId: string,
  ): Promise<void> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const favorite = await tx.userFavorite.findFirst({
        where: { userId, entityId },
        select: {
          favoriteId: true,
          entityId: true,
          entityType: true,
        },
      });

      if (!favorite) {
        return false;
      }

      await tx.userFavorite.delete({
        where: { favoriteId: favorite.favoriteId },
      });

      await tx.userFavoriteEvent.create({
        data: {
          userId,
          entityId: favorite.entityId,
          entityType: favorite.entityType,
          eventKind: FavoriteEventKind.removed,
          occurredAt: new Date(),
          metadata: this.buildFavoriteEventMetadata('favorite_action'),
        },
      });

      return true;
    });

    if (!removed) {
      this.logger.debug('Favorite already removed', { userId, entityId });
      return;
    }

    this.logger.debug('Removed user favorite', {
      userId,
      entityId,
    });
  }

  private buildFavoriteEventMetadata(source: string): Prisma.JsonObject {
    return { source };
  }
}
