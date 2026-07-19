import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FavoriteEventKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { CreateFavoriteDto } from './dto/create-favorite.dto';

@Injectable()
export class FavoritesService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
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
    if (dto.locationId) {
      const location = await this.prisma.restaurantLocation.findUnique({
        where: { locationId: dto.locationId },
        select: { locationId: true, restaurantId: true },
      });
      if (!location || location.restaurantId !== entity.entityId) {
        throw new BadRequestException(
          'locationId does not belong to the favorited restaurant',
        );
      }
      validatedLocationId = location.locationId;
    }

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

      return created;
    });

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
