import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

    const favorite = await this.prisma.userFavorite.upsert({
      where: {
        userId_entityId: {
          userId,
          entityId: entity.entityId,
        },
      },
      update: {
        entityType: entity.type,
      },
      create: {
        userId,
        entityId: entity.entityId,
        entityType: entity.type,
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

    this.logger.debug('Added user favorite', {
      userId,
      entityId: favorite.entityId,
    });

    return favorite;
  }

  async removeFavorite(userId: string, favoriteId: string): Promise<void> {
    const result = await this.prisma.userFavorite.deleteMany({
      where: { favoriteId, userId },
    });

    if (result.count === 0) {
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
    const result = await this.prisma.userFavorite.deleteMany({
      where: { userId, entityId },
    });

    if (result.count === 0) {
      this.logger.debug('Favorite already removed', { userId, entityId });
      return;
    }

    this.logger.debug('Removed user favorite', {
      userId,
      entityId,
    });
  }
}
