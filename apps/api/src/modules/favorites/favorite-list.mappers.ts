import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  CraveScoreSubjectType,
  FavoriteListType,
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
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * DTO mappers + score hydration for favorite lists. Pure projection lives
 * here — access law lives in FavoriteListAccessPolicy, the results/query
 * engine in ListResultsAssembler, orchestration in FavoriteListsService.
 */

/** Which surface the summary is being built for (finding 1: shareSlug is a
 *  CAPABILITY — it must never ride a public-profile read). */
export type FavoriteListSummaryAudience = 'owner' | 'publicProfile';

export type FavoriteListSummary = {
  listId: string;
  name: string;
  description?: string | null;
  listType: FavoriteListType;
  visibility: FavoriteList['visibility'];
  itemCount: number;
  position: number;
  systemKind: string | null;
  /** Profile-gallery pin (§8.12/§8.14) — owner curation, floats first there. */
  pinned: boolean;
  /** Wave-2 §2 "Use your photos": tile gallery renders the owner's own photos. */
  useOwnPhotos: boolean;
  /** Majority market of the list's items (profile city grouping, §8.15).
   *  Only computed on the public profile read; null elsewhere. */
  city?: string | null;
  /** Omitted entirely on the public-profile projection. */
  shareEnabled?: boolean;
  /** The slug IS the join/read capability (RT-18) — owner + slug-granted
   *  surfaces only; NEVER present on the public-profile projection. */
  shareSlug?: string | null;
  updatedAt: Date;
  previewItems: Array<{
    itemId: string;
    label: string;
    subLabel?: string | null;
    craveScore: number;
  }>;
  /** 2x2 home-tile gallery (wave2 §7): top photo of each of the list's
   *  top-4 restaurants, slots TL(0)→TR(1)→BL(2)→BR(3), sparse at the end
   *  (client fills placeholders). On a "Use your photos" list the pool is
   *  the owner's own photos and un-shot restaurants keep their slot EMPTY —
   *  sparse ANYWHERE, so clients must place by `slot`, never array index.
   *  Present on the owner home read. */
  tileImages?: Array<{
    slot: 0 | 1 | 2 | 3;
    restaurantId: string;
    photoId: string;
    thumbUrl: string;
  }>;
};

export type FavoritePublicScore = Pick<
  PublicEntityScore,
  'subjectId' | 'displayScore' | 'percentileRank' | 'rising'
>;

export type FavoriteListScoreMaps = {
  restaurantScores: Map<string, FavoritePublicScore>;
  connectionScores: Map<string, FavoritePublicScore>;
};

export type FavoriteListItemDetail = Prisma.FavoriteListItemGetPayload<{
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

export type FavoriteListWithDetailItems = FavoriteList & {
  items: FavoriteListItemDetail[];
};

export type FavoriteListScoreSubjectSource = {
  items: Array<{
    restaurantId?: string | null;
    connectionId?: string | null;
  }>;
};

export type FavoriteListSummarySource = FavoriteList & {
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

/**
 * 'custom' order exists iff position order diverges from insertion
 * (createdAt) order — positions are assigned append-only (max+1) until a
 * reorder/explicit position write perturbs them.
 */
export function hasCustomOrder(
  items: Array<Pick<FavoriteListItem, 'itemId' | 'position' | 'createdAt'>>,
): boolean {
  const byPosition = [...items].sort(
    (a, b) =>
      a.position - b.position || a.createdAt.valueOf() - b.createdAt.valueOf(),
  );
  const byCreated = [...items].sort(
    (a, b) =>
      a.createdAt.valueOf() - b.createdAt.valueOf() || a.position - b.position,
  );
  return byPosition.some(
    (item, index) => item.itemId !== byCreated[index].itemId,
  );
}

@Injectable()
export class FavoriteListMapper {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('FavoriteListMapper');
  }

  buildListSummary(
    list: FavoriteListSummarySource,
    scores: FavoriteListScoreMaps,
    audience: FavoriteListSummaryAudience,
  ): FavoriteListSummary {
    // Finding 4: one score-less entity must never 500 the whole lists read —
    // the preview item is skipped (loud single-line log) and the summary
    // survives.
    const missingScoreSubjects: string[] = [];
    const previewItems = list.items
      .map((item) => {
        if (
          list.listType === FavoriteListType.restaurant &&
          item.restaurantId &&
          item.restaurant
        ) {
          const score = scores.restaurantScores.get(item.restaurantId);
          if (!score) {
            missingScoreSubjects.push(`restaurant:${item.restaurantId}`);
            return null;
          }
          return {
            itemId: item.itemId,
            label: item.restaurant.name,
            subLabel: item.restaurant.city,
            craveScore: Number(score.displayScore),
          };
        }
        if (
          list.listType === FavoriteListType.dish &&
          item.connectionId &&
          item.connection
        ) {
          const score = scores.connectionScores.get(item.connectionId);
          if (!score) {
            missingScoreSubjects.push(`connection:${item.connectionId}`);
            return null;
          }
          return {
            itemId: item.itemId,
            label: item.connection.food?.name ?? 'Dish',
            subLabel: item.connection.restaurant?.name ?? null,
            craveScore: Number(score.displayScore),
          };
        }
        return null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    if (missingScoreSubjects.length > 0) {
      this.logger.warn(
        `Favorite list ${list.listId}: skipped ${missingScoreSubjects.length} preview item(s) with no public Crave Score [${missingScoreSubjects.join(', ')}]`,
      );
    }

    const summary: FavoriteListSummary = {
      listId: list.listId,
      name: list.name,
      description: list.description,
      listType: list.listType,
      visibility: list.visibility,
      itemCount: list.itemCount,
      position: list.position,
      systemKind: list.systemKind,
      pinned: list.pinned,
      useOwnPhotos: list.useOwnPhotos,
      updatedAt: list.updatedAt,
      previewItems,
    };
    if (audience === 'owner') {
      summary.shareEnabled = list.shareEnabled;
      summary.shareSlug = list.shareSlug;
    }
    return summary;
  }

  async loadPreviewScoreMaps(
    lists: FavoriteListScoreSubjectSource[],
  ): Promise<FavoriteListScoreMaps> {
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
      this.loadPublicScores(CraveScoreSubjectType.restaurant, [
        ...restaurantIds,
      ]),
      this.loadPublicScores(CraveScoreSubjectType.connection, [
        ...connectionIds,
      ]),
    ]);
    return { restaurantScores, connectionScores };
  }

  async loadPublicScores(
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
        percentileRank: true,
        rising: true,
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

  // High-precision percentile_rank for tie-proof map/list ordering; undefined if missing (client falls back).
  private toPublicScoreExact(
    score: FavoritePublicScore | undefined,
  ): number | undefined {
    if (!score || score.percentileRank == null) {
      return undefined;
    }
    return Number(score.percentileRank);
  }

  private toPublicScoreDelta(
    score: FavoritePublicScore | undefined,
  ): number | null {
    return score?.rising == null ? null : Number(score.rising);
  }

  async mapRestaurantResults(
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
      // A connection with no PUBLIC score cannot be a "top food" — it is filtered,
      // never fatal (2026-07-13: one unscored connection 500'd every list containing
      // its restaurant). The SAVED item's own score (below) stays a loud invariant.
      const topFoodSnippets: RestaurantFoodSnippet[] = topFoods
        .filter((food) => topFoodScores.has(food.connectionId))
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
          rising: this.toPublicScoreDelta(topFoodScores.get(food.connectionId)),
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
        .map((food) => ({
          connectionId: food.connectionId,
          foodId: food.foodId,
          foodName: food.foodName,
          scoreSubjectType: food.scoreSubjectType,
          scoreSubjectId: food.scoreSubjectId,
          craveScore: food.craveScore,
          rising: food.rising,
        }));

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
        craveScoreExact: this.toPublicScoreExact(restaurantScore),
        rising: this.toPublicScoreDelta(restaurantScore),
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
        // Detail-path parity with the results path (spec B.1.5): the saver's
        // note + the backing FavoriteListItem id ride every axis row.
        note: item.note ?? null,
        favoriteListItemId: item.itemId,
      });
    }

    return results;
  }

  async mapFoodResults(items: FavoriteListItemDetail[]): Promise<FoodResult[]> {
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
        craveScoreExact: this.toPublicScoreExact(connectionScore),
        rising: this.toPublicScoreDelta(connectionScore),
        marketKey: undefined,
        mentionCount: connection.mentionCount ?? 0,
        totalUpvotes: connection.totalUpvotes ?? 0,
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
        // Detail-path parity with the results path (spec B.1.5).
        note: item.note ?? null,
        favoriteListItemId: item.itemId,
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
}
