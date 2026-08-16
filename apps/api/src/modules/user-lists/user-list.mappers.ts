import { Injectable } from '@nestjs/common';
import {
  CraveScoreSubjectType,
  UserListType,
  type UserList,
  type UserListItem,
  type PublicEntityScore,
  Prisma,
  type PlaceLocation,
} from '@prisma/client';
import type {
  ItemResult,
  PlaceItemSnippet,
  PlaceLocationResult,
  PlaceResult,
} from '@crave-search/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';

/**
 * DTO mappers + score hydration for favorite lists. Pure projection lives
 * here — access law lives in UserListAccessPolicy, the results/query
 * engine in ListResultsAssembler, orchestration in UserListsService.
 */

/** Which surface the summary is being built for (finding 1: shareSlug is a
 *  CAPABILITY — it must never ride a public-profile read). */
export type UserListSummaryAudience = 'owner' | 'publicProfile';

export type UserListSummary = {
  listId: string;
  name: string;
  description?: string | null;
  listType: UserListType;
  visibility: UserList['visibility'];
  itemCount: number;
  position: number;
  /** The kind law (2026-07-26): 'standard' | 'favorites' | the four
   *  signup-default kinds. Favorites is the one heart-target list. */
  kind: string;
  /** @deprecated wire alias for pre-kind mobile clients: kind, with
   *  'standard' spelled null (the old system_kind shape). */
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
    placeId: string;
    photoId: string;
    thumbUrl: string;
  }>;
};

export type FavoritePublicScore = Pick<
  PublicEntityScore,
  'subjectId' | 'displayScore' | 'percentileRank' | 'rising'
>;

export type UserListScoreMaps = {
  placeScores: Map<string, FavoritePublicScore>;
  connectionScores: Map<string, FavoritePublicScore>;
};

export type UserListItemDetail = Prisma.UserListItemGetPayload<{
  include: {
    location: true;
    place: { include: { primaryLocation: true } };
    connection: {
      include: {
        item: true;
        place: { include: { primaryLocation: true } };
      };
    };
  };
}>;

export type UserListWithDetailItems = UserList & {
  /** D36/F600 — see UserListSummarySource. */
  _count: { items: number };
  items: UserListItemDetail[];
};

export type UserListScoreSubjectSource = {
  items: Array<{
    placeId?: string | null;
    connectionId?: string | null;
  }>;
};

export type UserListSummarySource = UserList & {
  /** D36/F600: the count IS the rows. There is no stored item_count anymore,
   *  so every summary read must ask for `_count: { select: { items: true } }`
   *  — a read that forgets it is a COMPILE error, never a wrong number. The
   *  `items` array below is a PREVIEW (take: 5), so it can never stand in. */
  _count: { items: number };
  items: Array<{
    itemId: string;
    placeId?: string | null;
    connectionId?: string | null;
    place?: {
      name: string;
      city?: string | null;
    } | null;
    connection?: {
      connectionId: string;
      item?: {
        name: string;
      } | null;
      place?: {
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
  items: Array<Pick<UserListItem, 'itemId' | 'position' | 'createdAt'>>,
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
export class UserListMapper {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('UserListMapper');
  }

  buildListSummary(
    list: UserListSummarySource,
    scores: UserListScoreMaps,
    audience: UserListSummaryAudience,
  ): UserListSummary {
    // Finding 4: one score-less entity must never 500 the whole lists read —
    // the preview item is skipped (loud single-line log) and the summary
    // survives.
    const missingScoreSubjects: string[] = [];
    const previewItems = list.items
      .map((item) => {
        if (
          list.listType === UserListType.restaurant &&
          item.placeId &&
          item.place
        ) {
          const score = scores.placeScores.get(item.placeId);
          if (!score) {
            missingScoreSubjects.push(`restaurant:${item.placeId}`);
            return null;
          }
          return {
            itemId: item.itemId,
            label: item.place.name,
            subLabel: item.place.city,
            craveScore: Number(score.displayScore),
          };
        }
        if (
          list.listType === UserListType.dish &&
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
            label: item.connection.item?.name ?? 'Dish',
            subLabel: item.connection.place?.name ?? null,
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

    const summary: UserListSummary = {
      listId: list.listId,
      name: list.name,
      description: list.description,
      listType: list.listType,
      visibility: list.visibility,
      // D36/F600: derived from the rows, never a stored counter.
      itemCount: list._count.items,
      position: list.position,
      kind: list.kind,
      systemKind: list.kind === 'standard' ? null : list.kind,
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
    lists: UserListScoreSubjectSource[],
  ): Promise<UserListScoreMaps> {
    const placeIds = new Set<string>();
    const connectionIds = new Set<string>();
    lists.forEach((list) => {
      list.items.forEach((item) => {
        if (item.placeId) {
          placeIds.add(item.placeId);
        }
        if (item.connectionId) {
          connectionIds.add(item.connectionId);
        }
      });
    });
    const [placeScores, connectionScores] = await Promise.all([
      this.loadPublicScores(CraveScoreSubjectType.restaurant, [...placeIds]),
      this.loadPublicScores(CraveScoreSubjectType.connection, [
        ...connectionIds,
      ]),
    ]);
    return { placeScores, connectionScores };
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

  // F604: this used to THROW (InternalServerErrorException), 500-ing the
  // entire list detail on ONE unscored saved item — while the sibling
  // preview path above (buildListSummary) DROPS such rows with a loud log.
  // Two policies for one fact; the drop is the derived-correct one (it is
  // the one that survived a real incident, 2026-07-13, in mapRestaurantResults'
  // topFood snippets). Returns null; callers drop the item and count it.
  private toPublicScoreValue(
    score: FavoritePublicScore | undefined,
  ): number | null {
    if (!score) {
      return null;
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

  async mapPlaceResults(items: UserListItemDetail[]): Promise<PlaceResult[]> {
    const results: PlaceResult[] = [];
    const placeIds = items
      .map((item) => item.place?.entityId)
      .filter((id): id is string => typeof id === 'string');
    const placeScores = await this.loadPublicScores(
      CraveScoreSubjectType.restaurant,
      placeIds,
    );
    // Batched (F1910): one connection.findMany over the UNION of placeIds
    // instead of one per item, mirroring mapFoodResults' shape. Scoping is
    // preserved exactly — each item's topFoods below is still filtered to
    // `restaurantId === restaurant.entityId`, identical to what the per-item
    // `where: { restaurantId: restaurant.entityId }` query returned; only the
    // round trip is collapsed, not the per-item grouping.
    const allTopItems =
      placeIds.length > 0
        ? await this.prisma.connection.findMany({
            where: { placeId: { in: placeIds } },
            include: {
              item: { select: { entityId: true, name: true } },
            },
          })
        : [];
    const topItemsByPlace = new Map<string, typeof allTopItems>();
    for (const item of allTopItems) {
      const list = topItemsByPlace.get(item.placeId);
      if (list) {
        list.push(item);
      } else {
        topItemsByPlace.set(item.placeId, [item]);
      }
    }
    const topItemScores = await this.loadPublicScores(
      CraveScoreSubjectType.connection,
      allTopItems.map((item) => item.connectionId),
    );
    for (const item of items) {
      const place = item.place;
      if (!place) {
        continue;
      }
      const topItems = topItemsByPlace.get(place.entityId) ?? [];
      // A connection with no PUBLIC score cannot be a "top food" — it is filtered,
      // never fatal (2026-07-13: one unscored connection 500'd every list containing
      // its restaurant). The SAVED item's own score (below) stays a loud invariant.
      const topItemSnippets: PlaceItemSnippet[] = topItems
        .filter((item) => topItemScores.has(item.connectionId))
        .map((item) => ({
          connectionId: item.connectionId,
          itemId: item.itemId,
          itemName: item.item?.name ?? 'Dish',
          scoreSubjectType: 'connection' as const,
          scoreSubjectId: item.connectionId,
          // Non-null: the .has() filter above guarantees a score exists.
          craveScore: this.toPublicScoreValue(
            topItemScores.get(item.connectionId),
          ) as number,
          rising: this.toPublicScoreDelta(topItemScores.get(item.connectionId)),
          totalUpvotes: item.totalUpvotes ?? 0,
        }))
        .sort((left, right) => {
          const scoreDiff = right.craveScore - left.craveScore;
          if (scoreDiff !== 0) {
            return scoreDiff;
          }
          return right.totalUpvotes - left.totalUpvotes;
        })
        .slice(0, 3)
        .map((item) => ({
          connectionId: item.connectionId,
          itemId: item.itemId,
          itemName: item.itemName,
          scoreSubjectType: item.scoreSubjectType,
          scoreSubjectId: item.scoreSubjectId,
          craveScore: item.craveScore,
          rising: item.rising,
        }));

      const primaryLocation = place.primaryLocation;
      const locationResult = primaryLocation
        ? this.mapLocation(primaryLocation)
        : null;
      const placeScore = placeScores.get(place.entityId);

      results.push({
        placeId: place.entityId,
        placeName: place.name,
        scoreSubjectType: 'restaurant',
        scoreSubjectId: place.entityId,
        // F604: null (not thrown) when unscored — RestaurantResult.craveScore
        // is `number | null` by design; an unscored SAVED restaurant still
        // renders in the list, it just shows no score, same as the preview path.
        craveScore: this.toPublicScoreValue(placeScore),
        craveScoreExact: this.toPublicScoreExact(placeScore),
        rising: this.toPublicScoreDelta(placeScore),
        mentionCount: undefined,
        totalUpvotes: place.generalPraiseUpvotes ?? undefined,
        latitude: primaryLocation?.latitude
          ? Number(primaryLocation.latitude)
          : null,
        longitude: primaryLocation?.longitude
          ? Number(primaryLocation.longitude)
          : null,
        address: primaryLocation?.address ?? place.address ?? null,
        placeLocationId: primaryLocation?.locationId ?? null,
        priceLevel: place.priceLevel ?? null,
        priceSymbol: null,
        priceText: null,
        priceLevelUpdatedAt: place.priceLevelUpdatedAt?.toISOString() ?? null,
        topItem: topItemSnippets,
        totalDishCount: topItemSnippets.length,
        operatingStatus: null,
        distanceMiles: null,
        displayLocation: locationResult,
        locations: locationResult ? [locationResult] : [],
        locationCount: locationResult ? 1 : 0,
        // Detail-path parity with the results path (spec B.1.5): the saver's
        // note + the backing UserListItem id ride every axis row.
        note: item.note ?? null,
        userListItemId: item.itemId,
      });
    }

    return results;
  }

  async mapItemResults(items: UserListItemDetail[]): Promise<ItemResult[]> {
    const results: ItemResult[] = [];
    const connectionScores = await this.loadPublicScores(
      CraveScoreSubjectType.connection,
      items
        .map((item) => item.connection?.connectionId)
        .filter((id): id is string => typeof id === 'string'),
    );
    const placeScores = await this.loadPublicScores(
      CraveScoreSubjectType.restaurant,
      items
        .map((item) => item.connection?.placeId)
        .filter((id): id is string => typeof id === 'string'),
    );
    // F604: FoodResult.craveScore / .restaurantCraveScore are non-nullable
    // (unlike RestaurantResult.craveScore) — a saved dish with either score
    // missing is DROPPED here + counted, never thrown. Mirrors the sibling
    // preview path's policy (buildListSummary) instead of 500-ing the whole
    // list detail on one unscored favorite.
    const missingScoreSubjects: string[] = [];
    items.forEach((item) => {
      const connection = item.connection;
      if (!connection || !connection.item || !connection.place) {
        return;
      }
      const primaryLocation = connection.place.primaryLocation;
      const connectionScore = connectionScores.get(connection.connectionId);
      const placeScore = placeScores.get(connection.placeId);
      const craveScore = this.toPublicScoreValue(connectionScore);
      const placeCraveScore = this.toPublicScoreValue(placeScore);
      if (craveScore === null) {
        missingScoreSubjects.push(`connection:${connection.connectionId}`);
        return;
      }
      if (placeCraveScore === null) {
        missingScoreSubjects.push(`restaurant:${connection.placeId}`);
        return;
      }
      results.push({
        connectionId: connection.connectionId,
        itemId: connection.itemId,
        itemName: connection.item.name,
        placeId: connection.placeId,
        placeName: connection.place.name,
        placeLocationId: primaryLocation?.locationId ?? undefined,
        scoreSubjectType: 'connection',
        scoreSubjectId: connection.connectionId,
        craveScore,
        craveScoreExact: this.toPublicScoreExact(connectionScore),
        rising: this.toPublicScoreDelta(connectionScore),
        mentionCount: connection.mentionCount ?? 0,
        totalUpvotes: connection.totalUpvotes ?? 0,
        lastMentionedAt: connection.lastMentionedAt?.toISOString() ?? null,
        itemAttributes: connection.itemAttributes ?? [],
        placePriceLevel: connection.place.priceLevel ?? null,
        placePriceSymbol: null,
        placeDistanceMiles: null,
        placeOperatingStatus: null,
        placeCraveScore,
        // Detail-path parity with the results path (spec B.1.5).
        note: item.note ?? null,
        userListItemId: item.itemId,
      });
    });

    if (missingScoreSubjects.length > 0) {
      this.logger.warn(
        `Favorite list dish detail: dropped ${missingScoreSubjects.length} item(s) with no public Crave Score [${missingScoreSubjects.join(', ')}]`,
      );
    }

    return results;
  }

  private mapLocation(location: PlaceLocation): PlaceLocationResult {
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
