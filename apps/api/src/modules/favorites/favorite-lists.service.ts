import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FavoriteListType,
  FavoriteListVisibility,
  CraveScoreSubjectType,
  type FavoriteList,
  type FavoriteListItem,
  type PublicEntityScore,
  Prisma,
  type RestaurantLocation,
} from '@prisma/client';
import type {
  FoodResult,
  RestaurantFoodSnippet,
  RestaurantLocationResult,
  RestaurantResult,
} from '@crave-search/shared';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { UserStatsService } from '../identity/user-stats.service';
import { CreateFavoriteListDto } from './dto/create-favorite-list.dto';
import { UpdateFavoriteListDto } from './dto/update-favorite-list.dto';
import { AddFavoriteListItemDto } from './dto/add-favorite-list-item.dto';
import { ShareFavoriteListDto } from './dto/share-favorite-list.dto';
import { ListFavoriteListsDto } from './dto/list-favorite-lists.dto';

type FavoriteListSummary = {
  listId: string;
  name: string;
  description?: string | null;
  listType: FavoriteListType;
  visibility: FavoriteListVisibility;
  itemCount: number;
  position: number;
  shareEnabled: boolean;
  shareSlug?: string | null;
  updatedAt: Date;
	  previewItems: Array<{
	    itemId: string;
	    label: string;
	    subLabel?: string | null;
	    craveScore: number;
	  }>;
};

type FavoritePublicScore = Pick<
  PublicEntityScore,
  'subjectId' | 'displayScore' | 'scoreDelta7d'
>;

type FavoriteListItemPreview = Prisma.FavoriteListItemGetPayload<{
  include: {
    restaurant: {
      select: {
        entityId: true;
        name: true;
        city: true;
      };
    };
    connection: {
      select: {
        connectionId: true;
        food: {
          select: {
            entityId: true;
            name: true;
          };
        };
        restaurant: {
          select: {
            entityId: true;
            name: true;
          };
        };
      };
    };
  };
}>;

type FavoriteListItemDetail = Prisma.FavoriteListItemGetPayload<{
  include: {
    restaurant: { include: { primaryLocation: true } };
    connection: {
      include: {
        food: true;
        restaurant: { include: { primaryLocation: true } };
      };
    };
  };
}>;

type FavoriteListWithPreviewItems = FavoriteList & {
  items: FavoriteListItemPreview[];
};

type FavoriteListWithDetailItems = FavoriteList & {
  items: FavoriteListItemDetail[];
};

type FavoriteListScoreSubjectSource = {
  items: Array<{
    restaurantId?: string | null;
    connectionId?: string | null;
  }>;
};

type FavoriteListSummarySource = FavoriteList & {
  items: Array<{
    itemId: string;
    restaurantId?: string | null;
    connectionId?: string | null;
    restaurant?: {
      name: string;
      city?: string | null;
    } | null;
    connection?: {
      connectionId: string;
      food?: {
        name: string;
      } | null;
      restaurant?: {
        name: string;
      } | null;
    } | null;
  }>;
};

@Injectable()
export class FavoriteListsService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
    private readonly userStats: UserStatsService,
  ) {
    this.logger = loggerService.setContext('FavoriteListsService');
  }

  async listForUser(userId: string, query: ListFavoriteListsDto) {
    const lists = await this.prisma.favoriteList.findMany({
      where: {
        ownerUserId: userId,
        listType: query.listType,
        visibility: query.visibility,
      },
      orderBy: { position: 'asc' },
      include: {
        items: {
          orderBy: { position: 'asc' },
          take: 5,
          include: {
            restaurant: {
              select: {
                entityId: true,
                name: true,
                city: true,
              },
            },
            connection: {
              select: {
                connectionId: true,
                food: {
                  select: {
                    entityId: true,
                    name: true,
                  },
                },
                restaurant: {
                  select: {
                    entityId: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const previewScores = await this.loadPreviewScoreMaps(lists);
    return lists.map((list) => this.buildListSummary(list, previewScores));
  }

  async listPublicForUser(userId: string, query: ListFavoriteListsDto) {
    return this.listForUser(userId, {
      ...query,
      visibility: FavoriteListVisibility.public,
    });
  }

  async getListForUser(userId: string, listId: string) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            restaurant: {
              include: { primaryLocation: true },
            },
            connection: {
              include: {
                food: true,
                restaurant: {
                  include: { primaryLocation: true },
                },
              },
            },
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }

    return this.buildListDetail(list);
  }

  async getSharedList(shareSlug: string) {
    const list = await this.prisma.favoriteList.findFirst({
      where: {
        shareSlug,
        shareEnabled: true,
      },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            restaurant: {
              include: { primaryLocation: true },
            },
            connection: {
              include: {
                food: true,
                restaurant: {
                  include: { primaryLocation: true },
                },
              },
            },
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('Shared list not found');
    }

    await this.prisma.favoriteListShareEvent.create({
      data: {
        listId: list.listId,
        shareSlug: list.shareSlug ?? undefined,
        eventType: 'opened',
      },
    });

    return this.buildListDetail(list);
  }

  async createList(userId: string, dto: CreateFavoriteListDto) {
    const maxPosition = await this.prisma.favoriteList.aggregate({
      where: { ownerUserId: userId },
      _max: { position: true },
    });

    let list: FavoriteList;
    try {
      list = await this.prisma.favoriteList.create({
        data: {
          ownerUserId: userId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          listType: dto.listType,
          visibility: dto.visibility ?? FavoriteListVisibility.private,
          position: (maxPosition._max.position ?? 0) + 1,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('List name already exists');
      }
      throw error;
    }

    await this.userStats.applyDelta(userId, { favoriteListsCount: 1 });
    return list;
  }

  async updateList(userId: string, listId: string, dto: UpdateFavoriteListDto) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }

    return this.prisma.favoriteList.update({
      where: { listId },
      data: {
        name: dto.name?.trim() ?? undefined,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : undefined,
        visibility: dto.visibility ?? undefined,
        shareEnabled:
          dto.visibility === FavoriteListVisibility.private ? false : undefined,
      },
    });
  }

  async updateListPosition(userId: string, listId: string, position: number) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
      select: { listId: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    return this.prisma.favoriteList.update({
      where: { listId },
      data: { position },
    });
  }

  async deleteList(userId: string, listId: string) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
      select: { listId: true, itemCount: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }

    await this.prisma.favoriteList.delete({
      where: { listId },
    });

    await this.userStats.applyDelta(userId, {
      favoriteListsCount: -1,
      favoritesTotalCount: -list.itemCount,
    });
  }

  async addItem(userId: string, listId: string, dto: AddFavoriteListItemDto) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
      select: { listId: true, listType: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }

    if (!dto.restaurantId && !dto.connectionId) {
      throw new BadRequestException('Missing list item target');
    }
    if (dto.restaurantId && dto.connectionId) {
      throw new BadRequestException('Only one list item target is allowed');
    }
    if (list.listType === FavoriteListType.restaurant && !dto.restaurantId) {
      throw new BadRequestException(
        'Restaurant list items require a restaurant',
      );
    }
    if (list.listType === FavoriteListType.dish && !dto.connectionId) {
      throw new BadRequestException('Dish list items require a connection');
    }

    if (dto.restaurantId) {
      const exists = await this.prisma.entity.findUnique({
        where: { entityId: dto.restaurantId },
        select: { entityId: true },
      });
      if (!exists) {
        throw new NotFoundException('Restaurant not found');
      }
    }

    if (dto.connectionId) {
      const exists = await this.prisma.connection.findUnique({
        where: { connectionId: dto.connectionId },
        select: { connectionId: true },
      });
      if (!exists) {
        throw new NotFoundException('Connection not found');
      }
    }

    const maxPosition = await this.prisma.favoriteListItem.aggregate({
      where: { listId },
      _max: { position: true },
    });

    let item: FavoriteListItem;
    try {
      item = await this.prisma.favoriteListItem.create({
        data: {
          listId,
          addedByUserId: userId,
          restaurantId: dto.restaurantId ?? null,
          connectionId: dto.connectionId ?? null,
          position: dto.position ?? (maxPosition._max.position ?? 0) + 1,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Item already exists in list');
      }
      throw error;
    }

    await this.prisma.favoriteList.update({
      where: { listId },
      data: { itemCount: { increment: 1 } },
    });
    await this.userStats.applyDelta(userId, { favoritesTotalCount: 1 });

    return item;
  }

  async updateItemPosition(
    userId: string,
    listId: string,
    itemId: string,
    position: number,
  ) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
      select: { listId: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }

    const result = await this.prisma.favoriteListItem.updateMany({
      where: { itemId, listId },
      data: { position },
    });
    if (result.count === 0) {
      throw new NotFoundException('Favorite list item not found');
    }
    return { itemId, position };
  }

  async removeItem(userId: string, listId: string, itemId: string) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
      select: { listId: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    const result = await this.prisma.favoriteListItem.deleteMany({
      where: { itemId, listId },
    });
    if (result.count === 0) {
      return;
    }

    await this.prisma.favoriteList.update({
      where: { listId },
      data: { itemCount: { decrement: 1 } },
    });
    await this.userStats.applyDelta(userId, { favoritesTotalCount: -1 });
  }

  async enableShare(userId: string, listId: string, dto: ShareFavoriteListDto) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }

    let shareSlug = list.shareSlug;
    if (!shareSlug || dto?.rotate) {
      shareSlug = await this.generateUniqueShareSlug();
    }

    const updated = await this.prisma.favoriteList.update({
      where: { listId },
      data: {
        shareSlug,
        shareEnabled: true,
        visibility:
          list.visibility === FavoriteListVisibility.private
            ? FavoriteListVisibility.public
            : list.visibility,
      },
    });

    await this.prisma.favoriteListShareEvent.create({
      data: {
        listId,
        shareSlug,
        eventType: 'created',
      },
    });

    return {
      listId: updated.listId,
      shareSlug,
      shareEnabled: updated.shareEnabled,
    };
  }

  async disableShare(userId: string, listId: string) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }

    const updated = await this.prisma.favoriteList.update({
      where: { listId },
      data: {
        shareEnabled: false,
      },
    });

    await this.prisma.favoriteListShareEvent.create({
      data: {
        listId,
        shareSlug: updated.shareSlug ?? undefined,
        eventType: 'revoked',
      },
    });
  }

  private buildListSummary(
    list: FavoriteListSummarySource,
    scores: {
      restaurantScores: Map<string, FavoritePublicScore>;
      connectionScores: Map<string, FavoritePublicScore>;
    },
  ): FavoriteListSummary {
    const previewItems = list.items
      .map((item) => {
        if (
          list.listType === FavoriteListType.restaurant &&
          item.restaurantId &&
          item.restaurant
        ) {
          return {
            itemId: item.itemId,
            label: item.restaurant.name,
            subLabel: item.restaurant.city,
	            craveScore: this.toPublicScoreValue(
              scores.restaurantScores.get(item.restaurantId),
              CraveScoreSubjectType.restaurant,
              item.restaurantId,
            ),
          };
        }
        if (
          list.listType === FavoriteListType.dish &&
          item.connectionId &&
          item.connection
        ) {
          return {
            itemId: item.itemId,
            label: item.connection.food?.name ?? 'Dish',
            subLabel: item.connection.restaurant?.name ?? null,
	            craveScore: this.toPublicScoreValue(
              scores.connectionScores.get(item.connectionId),
              CraveScoreSubjectType.connection,
              item.connectionId,
            ),
          };
        }
        return null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    return {
      listId: list.listId,
      name: list.name,
      description: list.description,
      listType: list.listType,
      visibility: list.visibility,
      itemCount: list.itemCount,
      position: list.position,
      shareEnabled: list.shareEnabled,
      shareSlug: list.shareSlug,
      updatedAt: list.updatedAt,
      previewItems,
    };
  }

  private async buildListDetail(list: FavoriteListWithDetailItems) {
    const summary = await this.buildListSummary(
      list,
      await this.loadPreviewScoreMaps([list]),
    );
    if (list.listType === FavoriteListType.restaurant) {
      const restaurantItems = list.items.filter((item) => item.restaurant);
      const results = await this.mapRestaurantResults(restaurantItems);
      return { list: summary, restaurants: results };
    }
    const connectionItems = list.items.filter((item) => item.connection);
    const results = await this.mapFoodResults(connectionItems);
    return { list: summary, dishes: results };
  }

  private async loadPreviewScoreMaps(
    lists: FavoriteListScoreSubjectSource[],
  ): Promise<{
    restaurantScores: Map<string, FavoritePublicScore>;
    connectionScores: Map<string, FavoritePublicScore>;
  }> {
    const restaurantIds = new Set<string>();
    const connectionIds = new Set<string>();
    lists.forEach((list) => {
      list.items.forEach((item) => {
        if (item.restaurantId) {
          restaurantIds.add(item.restaurantId);
        }
        if (item.connectionId) {
          connectionIds.add(item.connectionId);
        }
      });
    });
    const [restaurantScores, connectionScores] = await Promise.all([
      this.loadPublicScores(CraveScoreSubjectType.restaurant, [...restaurantIds]),
      this.loadPublicScores(CraveScoreSubjectType.connection, [...connectionIds]),
    ]);
    return { restaurantScores, connectionScores };
  }

  private async loadPublicScores(
    subjectType: CraveScoreSubjectType,
    subjectIds: string[],
  ): Promise<Map<string, FavoritePublicScore>> {
    if (!subjectIds.length) {
      return new Map();
    }
    const scores = await this.prisma.publicEntityScore.findMany({
      where: {
        subjectType,
        subjectId: { in: subjectIds },
      },
      select: {
        subjectId: true,
        displayScore: true,
        scoreDelta7d: true,
      },
    });
    return new Map(scores.map((score) => [score.subjectId, score]));
  }

  private toPublicScoreValue(
    score: FavoritePublicScore | undefined,
    subjectType: CraveScoreSubjectType,
    subjectId: string,
  ): number {
    if (!score) {
      throw new InternalServerErrorException(
        `Missing public Crave Score for ${subjectType}:${subjectId}`,
      );
    }
    return Number(score.displayScore);
  }

  private toPublicScoreDelta(score: FavoritePublicScore | undefined): number | null {
    return score?.scoreDelta7d == null ? null : Number(score.scoreDelta7d);
  }

  private async mapRestaurantResults(
    items: FavoriteListItemDetail[],
  ): Promise<RestaurantResult[]> {
    const results: RestaurantResult[] = [];
    const restaurantScores = await this.loadPublicScores(
      CraveScoreSubjectType.restaurant,
      items
        .map((item) => item.restaurant?.entityId)
        .filter((id): id is string => typeof id === 'string'),
    );
    for (const item of items) {
      const restaurant = item.restaurant;
      if (!restaurant) {
        continue;
      }
      const topFoods = await this.prisma.connection.findMany({
        where: { restaurantId: restaurant.entityId },
        include: {
          food: { select: { entityId: true, name: true } },
        },
      });

      const topFoodScores = await this.loadPublicScores(
        CraveScoreSubjectType.connection,
        topFoods.map((food) => food.connectionId),
      );
      const topFoodSnippets: RestaurantFoodSnippet[] = topFoods
        .map((food) => ({
          connectionId: food.connectionId,
          foodId: food.foodId,
          foodName: food.food?.name ?? 'Dish',
          scoreSubjectType: 'connection' as const,
          scoreSubjectId: food.connectionId,
          craveScore: this.toPublicScoreValue(
            topFoodScores.get(food.connectionId),
            CraveScoreSubjectType.connection,
            food.connectionId,
          ),
          scoreDelta7d: this.toPublicScoreDelta(topFoodScores.get(food.connectionId)),
          activityLevel: food.activityLevel,
          totalUpvotes: food.totalUpvotes ?? 0,
        }))
        .sort((left, right) => {
          const scoreDiff = right.craveScore - left.craveScore;
          if (scoreDiff !== 0) {
            return scoreDiff;
          }
          return right.totalUpvotes - left.totalUpvotes;
        })
        .slice(0, 3)
        .map(({ totalUpvotes: _totalUpvotes, ...food }) => food);

      const primaryLocation = restaurant.primaryLocation;
      const locationResult = primaryLocation
        ? this.mapLocation(primaryLocation)
        : null;
      const restaurantScore = restaurantScores.get(restaurant.entityId);

      results.push({
        restaurantId: restaurant.entityId,
        restaurantName: restaurant.name,
        restaurantAliases: restaurant.aliases ?? [],
        scoreSubjectType: 'restaurant',
        scoreSubjectId: restaurant.entityId,
        craveScore: this.toPublicScoreValue(
          restaurantScore,
          CraveScoreSubjectType.restaurant,
          restaurant.entityId,
        ),
        scoreDelta7d: this.toPublicScoreDelta(restaurantScore),
        marketKey: undefined,
        mentionCount: undefined,
        totalUpvotes: restaurant.generalPraiseUpvotes ?? undefined,
        latitude: primaryLocation?.latitude
          ? Number(primaryLocation.latitude)
          : null,
        longitude: primaryLocation?.longitude
          ? Number(primaryLocation.longitude)
          : null,
        address: primaryLocation?.address ?? restaurant.address ?? null,
        restaurantLocationId: primaryLocation?.locationId ?? null,
        priceLevel: restaurant.priceLevel ?? null,
        priceSymbol: null,
        priceText: null,
        priceLevelUpdatedAt:
          restaurant.priceLevelUpdatedAt?.toISOString() ?? null,
        topFood: topFoodSnippets,
        totalDishCount: topFoodSnippets.length,
        operatingStatus: null,
        distanceMiles: null,
        displayLocation: locationResult,
        locations: locationResult ? [locationResult] : [],
        locationCount: locationResult ? 1 : 0,
      });
    }

    return results;
  }

  private async mapFoodResults(items: FavoriteListItemDetail[]): Promise<FoodResult[]> {
    const results: FoodResult[] = [];
    const connectionScores = await this.loadPublicScores(
      CraveScoreSubjectType.connection,
      items
        .map((item) => item.connection?.connectionId)
        .filter((id): id is string => typeof id === 'string'),
    );
    const restaurantScores = await this.loadPublicScores(
      CraveScoreSubjectType.restaurant,
      items
        .map((item) => item.connection?.restaurantId)
        .filter((id): id is string => typeof id === 'string'),
    );
    items.forEach((item) => {
      const connection = item.connection;
      if (!connection || !connection.food || !connection.restaurant) {
        return;
      }
      const primaryLocation = connection.restaurant.primaryLocation;
      const connectionScore = connectionScores.get(connection.connectionId);
      const restaurantScore = restaurantScores.get(connection.restaurantId);
      results.push({
        connectionId: connection.connectionId,
        foodId: connection.foodId,
        foodName: connection.food.name,
        foodAliases: connection.food.aliases ?? [],
        restaurantId: connection.restaurantId,
        restaurantName: connection.restaurant.name,
        restaurantAliases: connection.restaurant.aliases ?? [],
        restaurantLocationId: primaryLocation?.locationId ?? undefined,
        scoreSubjectType: 'connection',
        scoreSubjectId: connection.connectionId,
        craveScore: this.toPublicScoreValue(
          connectionScore,
          CraveScoreSubjectType.connection,
          connection.connectionId,
        ),
        scoreDelta7d: this.toPublicScoreDelta(connectionScore),
        marketKey: undefined,
        activityLevel: connection.activityLevel,
        mentionCount: connection.mentionCount ?? 0,
        totalUpvotes: connection.totalUpvotes ?? 0,
        recentMentionCount: connection.recentMentionCount ?? 0,
        lastMentionedAt: connection.lastMentionedAt?.toISOString() ?? null,
        categories: connection.categories ?? [],
        foodAttributes: connection.foodAttributes ?? [],
        restaurantPriceLevel: connection.restaurant.priceLevel ?? null,
        restaurantPriceSymbol: null,
        restaurantDistanceMiles: null,
        restaurantOperatingStatus: null,
        restaurantCraveScore: this.toPublicScoreValue(
          restaurantScore,
          CraveScoreSubjectType.restaurant,
          connection.restaurantId,
        ),
      });
    });

    return results;
  }

  private mapLocation(location: RestaurantLocation): RestaurantLocationResult {
    const hours =
      location.hours &&
      typeof location.hours === 'object' &&
      !Array.isArray(location.hours)
        ? (location.hours as Record<string, unknown>)
        : null;
    return {
      locationId: location.locationId,
      googlePlaceId: location.googlePlaceId ?? null,
      latitude: location.latitude ? Number(location.latitude) : null,
      longitude: location.longitude ? Number(location.longitude) : null,
      address: location.address ?? null,
      city: location.city ?? null,
      region: location.region ?? null,
      country: location.country ?? null,
      postalCode: location.postalCode ?? null,
      phoneNumber: location.phoneNumber ?? null,
      websiteUrl: location.websiteUrl ?? null,
      hours,
      utcOffsetMinutes: location.utcOffsetMinutes ?? null,
      timeZone: location.timeZone ?? null,
      operatingStatus: null,
      isPrimary: Boolean(location.isPrimary),
      lastPolledAt: location.lastPolledAt?.toISOString() ?? null,
      createdAt: location.createdAt?.toISOString() ?? null,
      updatedAt: location.updatedAt?.toISOString() ?? null,
    };
  }

  private async generateUniqueShareSlug(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = this.generateShareSlug();
      const existing = await this.prisma.favoriteList.findFirst({
        where: { shareSlug: slug },
        select: { listId: true },
      });
      if (!existing) {
        return slug;
      }
    }
    throw new BadRequestException('Unable to generate share link');
  }

  private generateShareSlug(): string {
    return randomBytes(9).toString('base64url');
  }
}
