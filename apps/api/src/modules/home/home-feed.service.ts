/**
 * HOME feed + list-detail reads (plans/home-surface-charter.md).
 *
 * Viewport → the EXISTING ViewportVerdictService (one law, never forked),
 * then rolled UP to the containing live city with curated content (walk the
 * place DAG upward from the header place). Content floors at CITY; the
 * header may be finer — and when it is, the near-you shelf derives finer
 * lists at read time by filtering the city lists' restaurant items to the
 * header place's ground (no extra materialization).
 */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FavoriteListType, Prisma } from '@prisma/client';
import { GeoBbox } from '@crave-search/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { ViewportVerdictService } from '../places/viewport-verdict.service';
import {
  MIN_VIABLE_LIST_ITEMS,
  RECIPE_CUISINE_BEST_PREFIX,
  RECIPE_DISH_BEST_PREFIX,
  RECIPE_HIDDEN_GEMS,
  RECIPE_TRENDING,
} from './curated-lists.constants';

const PREVIEW_NAMES_COUNT = 3;
const MAX_ROLLUP_DEPTH = 8;

export interface HomeShelfList {
  listId: string;
  title: string;
  subtitle: string | null;
  iconKey: string;
  listType: string;
  itemCount: number;
  previewNames: string[];
}

export interface HomeShelf {
  key: string;
  title: string;
  lists: HomeShelfList[];
}

export interface HomeFeedResponse {
  resolvedCity: { placeId: string; name: string } | null;
  shelves: HomeShelf[];
  /** Live cities with curated content — the 'pick a city' vocabulary. */
  liveCities: Array<{ placeId: string; name: string }>;
}

export interface CuratedListDetailItem {
  rank: number;
  entityId: string;
  restaurantId: string | null;
  /** Dish items: the resolved Connection id ((restaurantId, foodId) unique —
   *  the same read the dish search uses); null when no connection row exists.
   *  Restaurant items: always null. Lets client hearts/saves on curated dish
   *  rows speak the real connection vocabulary. */
  connectionId: string | null;
  label: string;
  subLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  craveScore: number | null;
  craveScoreExact: number | null;
  rising: number | null;
}

export interface CuratedListDetailResponse {
  listId: string;
  title: string;
  subtitle: string | null;
  iconKey: string;
  listType: string;
  recipeKey: string;
  rotationKey: string;
  scope: string;
  city: { placeId: string; name: string };
  itemCount: number;
  builtAt: Date;
  /** ListDetail reuse: app-curated lists always render read-only. */
  viewerRole: 'viewer';
  items: CuratedListDetailItem[];
}

type CuratedListRow = {
  listId: string;
  recipeKey: string;
  scope: string;
  ownerUserId: string | null;
  listType: string;
  title: string;
  subtitle: string | null;
  iconKey: string;
  itemCount: number;
};

@Injectable()
export class HomeFeedService {
  private readonly logger: LoggerService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly viewportVerdict: ViewportVerdictService,
    loggerService: LoggerService,
  ) {
    this.logger = loggerService.setContext('HomeFeedService');
  }

  async getFeed(view: GeoBbox, userId: string): Promise<HomeFeedResponse> {
    const [verdict, liveCities] = await Promise.all([
      this.viewportVerdict.resolveViewportVerdict(view),
      this.listCities(),
    ]);
    const cityIds = new Set(liveCities.map((city) => city.placeId));
    const resolvedCityId = verdict.headerPlace
      ? await this.rollupToListCity(verdict.headerPlace.placeId, cityIds)
      : null;
    if (!resolvedCityId) {
      // Honest fallback: no containing city with content — the client shows
      // the pick-a-city shelf from liveCities.
      return { resolvedCity: null, shelves: [], liveCities };
    }
    const resolvedCity = liveCities.find(
      (city) => city.placeId === resolvedCityId,
    ) as { placeId: string; name: string };

    const lists = await this.prisma.curatedList.findMany({
      where: {
        cityPlaceId: resolvedCityId,
        OR: [{ scope: 'global' }, { ownerUserId: userId }],
      },
      orderBy: [{ recipeKey: 'asc' }],
      select: {
        listId: true,
        recipeKey: true,
        scope: true,
        ownerUserId: true,
        listType: true,
        title: true,
        subtitle: true,
        iconKey: true,
        itemCount: true,
      },
    });
    const previews = await this.previewNamesByList(
      lists.map((list) => list.listId),
    );
    const toShelfList = (list: CuratedListRow): HomeShelfList => ({
      listId: list.listId,
      title: list.title,
      subtitle: list.subtitle,
      iconKey: list.iconKey,
      listType: list.listType,
      itemCount: list.itemCount,
      previewNames: previews.get(list.listId) ?? [],
    });

    const personal = lists.filter((list) => list.scope === 'personal');
    const globals = lists.filter((list) => list.scope === 'global');
    const shelves: HomeShelf[] = [];
    // Made-for-you FIRST when personal lists exist for the requesting user.
    if (personal.length) {
      shelves.push({
        key: 'made_for_you',
        title: 'Made for you',
        lists: personal.map(toShelfList),
      });
    }
    const nearYou = await this.buildNearYouShelf(
      verdict.headerPlace,
      resolvedCityId,
      globals,
    );
    if (nearYou) {
      shelves.push(nearYou);
    }
    const sections: Array<{
      key: string;
      title: string;
      match: (list: CuratedListRow) => boolean;
    }> = [
      {
        key: 'best_of',
        title: `Best of ${resolvedCity.name}`,
        match: (list) =>
          list.recipeKey.startsWith(RECIPE_CUISINE_BEST_PREFIX) ||
          list.recipeKey.startsWith(RECIPE_DISH_BEST_PREFIX),
      },
      {
        key: 'trending',
        title: 'Trending',
        match: (list) => list.recipeKey === RECIPE_TRENDING,
      },
      {
        key: 'hidden_gems',
        title: 'Hidden gems',
        match: (list) => list.recipeKey === RECIPE_HIDDEN_GEMS,
      },
      {
        key: 'moments',
        title: 'For the moment',
        match: (list) =>
          !list.recipeKey.startsWith(RECIPE_CUISINE_BEST_PREFIX) &&
          !list.recipeKey.startsWith(RECIPE_DISH_BEST_PREFIX) &&
          list.recipeKey !== RECIPE_TRENDING &&
          list.recipeKey !== RECIPE_HIDDEN_GEMS,
      },
    ];
    for (const section of sections) {
      const sectionLists = globals.filter(section.match);
      if (sectionLists.length) {
        shelves.push({
          key: section.key,
          title: section.title,
          lists: sectionLists.map(toShelfList),
        });
      }
    }
    return { resolvedCity, shelves, liveCities };
  }

  async getListDetail(
    listId: string,
    userId: string,
  ): Promise<CuratedListDetailResponse> {
    const list = await this.prisma.curatedList.findFirst({
      where: {
        listId,
        OR: [{ scope: 'global' }, { ownerUserId: userId }],
      },
      include: {
        city: { select: { placeId: true, name: true } },
        items: {
          orderBy: { rank: 'asc' },
          include: {
            entity: {
              select: {
                entityId: true,
                name: true,
                city: true,
                latitude: true,
                longitude: true,
              },
            },
            restaurant: {
              select: {
                entityId: true,
                name: true,
                latitude: true,
                longitude: true,
              },
            },
          },
        },
      },
    });
    if (!list) {
      throw new NotFoundException('Curated list not found');
    }

    let scores: Map<
      string,
      {
        displayScore: number;
        percentileRank: number | null;
        rising: number | null;
      }
    >;
    let connectionIdByItemKey = new Map<string, string>();
    if (list.listType === 'dish') {
      // Dish items: (restaurantId, foodId) resolves the Connection — the
      // same dish→restaurant model the search read uses; the connection
      // carries the ranked public score.
      connectionIdByItemKey = await this.resolveDishConnectionIds(list.items);
      scores = await this.loadScores('connection', [
        ...connectionIdByItemKey.values(),
      ]);
    } else {
      scores = await this.loadScores(
        'restaurant',
        list.items.map((item) => item.entityId),
      );
    }

    const items: CuratedListDetailItem[] = list.items.map((item) => {
      if (list.listType === 'dish') {
        const connectionId = item.restaurantId
          ? connectionIdByItemKey.get(`${item.restaurantId}:${item.entityId}`)
          : undefined;
        const score = connectionId ? scores.get(connectionId) : undefined;
        return {
          rank: item.rank,
          entityId: item.entityId,
          restaurantId: item.restaurantId,
          connectionId: connectionId ?? null,
          label: item.entity.name,
          subLabel: item.restaurant?.name ?? null,
          latitude: toNumberOrNull(item.restaurant?.latitude),
          longitude: toNumberOrNull(item.restaurant?.longitude),
          craveScore: score?.displayScore ?? null,
          craveScoreExact: score?.percentileRank ?? null,
          rising: score?.rising ?? null,
        };
      }
      const score = scores.get(item.entityId);
      return {
        rank: item.rank,
        entityId: item.entityId,
        restaurantId: null,
        connectionId: null,
        label: item.entity.name,
        subLabel: item.entity.city,
        latitude: toNumberOrNull(item.entity.latitude),
        longitude: toNumberOrNull(item.entity.longitude),
        craveScore: score?.displayScore ?? null,
        craveScoreExact: score?.percentileRank ?? null,
        rising: score?.rising ?? null,
      };
    });

    return {
      listId: list.listId,
      title: list.title,
      subtitle: list.subtitle,
      iconKey: list.iconKey,
      listType: list.listType,
      recipeKey: list.recipeKey,
      rotationKey: list.rotationKey,
      scope: list.scope,
      city: { placeId: list.city.placeId, name: list.city.name },
      itemCount: list.itemCount,
      builtAt: list.builtAt,
      viewerRole: 'viewer',
      items,
    };
  }

  /**
   * Save-a-copy (list-detail verbs leg, Job 2): copy the curated list's CURRENT
   * items into a NEW favorites list owned by the caller. Access mirrors the
   * detail read (global lists, or the caller's own personal list) — a foreign
   * personal list 404s. Items that cannot be expressed as favorites rows (dish
   * items with no resolvable connection) are skipped; itemCount is the honest
   * copied count. Name conflict on the caller's (owner, type, name) unique
   * retries once with a " (copy)" suffix.
   */
  async saveListToFavorites(
    listId: string,
    userId: string,
  ): Promise<{ listId: string; name: string; itemCount: number }> {
    const list = await this.prisma.curatedList.findFirst({
      where: { listId, OR: [{ scope: 'global' }, { ownerUserId: userId }] },
      include: { items: { orderBy: { rank: 'asc' } } },
    });
    if (!list) {
      throw new NotFoundException('Curated list not found');
    }
    const listType =
      list.listType === 'dish'
        ? FavoriteListType.dish
        : FavoriteListType.restaurant;
    const connectionIdByItemKey =
      listType === FavoriteListType.dish
        ? await this.resolveDishConnectionIds(list.items)
        : new Map<string, string>();
    const rows = list.items.flatMap(
      (
        item,
      ): Array<{
        restaurantId?: string;
        connectionId?: string;
        position: number;
      }> => {
        if (listType === FavoriteListType.dish) {
          const connectionId = item.restaurantId
            ? connectionIdByItemKey.get(`${item.restaurantId}:${item.entityId}`)
            : undefined;
          return connectionId ? [{ connectionId, position: item.rank }] : [];
        }
        return [{ restaurantId: item.entityId, position: item.rank }];
      },
    );

    const maxPosition = await this.prisma.favoriteList.aggregate({
      where: { ownerUserId: userId },
      _max: { position: true },
    });
    const position = (maxPosition._max.position ?? 0) + 1;
    const createList = (name: string) =>
      this.prisma.favoriteList.create({
        data: { ownerUserId: userId, name, listType, position },
      });
    let created: { listId: string; name: string };
    try {
      created = await createList(list.title);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        try {
          created = await createList(`${list.title} (copy)`);
        } catch (retryError) {
          if (
            retryError instanceof Prisma.PrismaClientKnownRequestError &&
            retryError.code === 'P2002'
          ) {
            throw new BadRequestException('List name already exists');
          }
          throw retryError;
        }
      } else {
        throw error;
      }
    }
    if (rows.length) {
      await this.prisma.favoriteListItem.createMany({
        data: rows.map((row) => ({
          ...row,
          listId: created.listId,
          addedByUserId: userId,
        })),
      });
      await this.prisma.favoriteList.update({
        where: { listId: created.listId },
        data: { itemCount: rows.length },
      });
    }
    return {
      listId: created.listId,
      name: created.name,
      itemCount: rows.length,
    };
  }

  // ---------- internals ----------

  /** Dish items → Connection ids via the (restaurantId, foodId) unique — ONE
   *  resolution law for the detail read and the save copy. */
  private async resolveDishConnectionIds(
    items: Array<{ entityId: string; restaurantId: string | null }>,
  ): Promise<Map<string, string>> {
    const pairs = items
      .filter((item) => item.restaurantId)
      .map((item) => ({
        restaurantId: item.restaurantId as string,
        foodId: item.entityId,
      }));
    const connections = pairs.length
      ? await this.prisma.connection.findMany({
          where: { OR: pairs },
          select: { connectionId: true, restaurantId: true, foodId: true },
        })
      : [];
    return new Map(
      connections.map((row) => [
        `${row.restaurantId}:${row.foodId}`,
        row.connectionId,
      ]),
    );
  }

  /** Distinct cities that carry GLOBAL curated content (name-joined). */
  private async listCities(): Promise<
    Array<{ placeId: string; name: string }>
  > {
    const rows = await this.prisma.$queryRaw<
      Array<{ place_id: string; name: string }>
    >(Prisma.sql`
      /*curated:feed_cities*/
      SELECT DISTINCT cl.city_place_id AS place_id, p.name
      FROM curated_lists cl
      JOIN places p ON p.place_id = cl.city_place_id
      WHERE cl.scope = 'global'
      ORDER BY p.name ASC
    `);
    return rows.map((row) => ({ placeId: row.place_id, name: row.name }));
  }

  /**
   * Roll the header place UP the containment DAG to the first ancestor (or
   * itself) that carries curated content. Bounded upward BFS over
   * parent_place_ids — the same walk shape as isSubdivisionOrBigger.
   */
  private async rollupToListCity(
    headerPlaceId: string,
    listCityIds: Set<string>,
  ): Promise<string | null> {
    let frontier = [headerPlaceId];
    const visited = new Set(frontier);
    for (let depth = 0; depth <= MAX_ROLLUP_DEPTH; depth += 1) {
      const hit = frontier.find((placeId) => listCityIds.has(placeId));
      if (hit) {
        return hit;
      }
      if (!frontier.length) {
        return null;
      }
      const rows = await this.prisma.place.findMany({
        where: { placeId: { in: frontier } },
        select: { placeId: true, parentPlaceIds: true },
      });
      const next: string[] = [];
      for (const row of rows) {
        for (const parentId of new Set(row.parentPlaceIds)) {
          if (!visited.has(parentId)) {
            visited.add(parentId);
            next.push(parentId);
          }
        }
      }
      frontier = next;
    }
    return null;
  }

  /** Top-3 item names per list, one batch query. */
  private async previewNamesByList(
    listIds: string[],
  ): Promise<Map<string, string[]>> {
    if (!listIds.length) {
      return new Map();
    }
    const items = await this.prisma.curatedListItem.findMany({
      where: { listId: { in: listIds }, rank: { lte: PREVIEW_NAMES_COUNT } },
      orderBy: [{ rank: 'asc' }],
      select: { listId: true, entity: { select: { name: true } } },
    });
    const previews = new Map<string, string[]>();
    for (const item of items) {
      const bucket = previews.get(item.listId);
      if (bucket) {
        bucket.push(item.entity.name);
      } else {
        previews.set(item.listId, [item.entity.name]);
      }
    }
    return previews;
  }

  /**
   * The dynamic near-you shelf: when the header place is FINER than the
   * resolved city, filter the city's global RESTAURANT lists' items to
   * restaurants inside the header place's ground at read time (bbox arms +
   * ST_Covers when a polygon exists — same containment law as the builder).
   * A filtered list only appears when it passes the SAME min-viable gate —
   * a derived view, never a thin fake list.
   */
  private async buildNearYouShelf(
    headerPlace: { placeId: string; name: string } | null,
    resolvedCityId: string,
    globalLists: CuratedListRow[],
  ): Promise<HomeShelf | null> {
    if (!headerPlace || headerPlace.placeId === resolvedCityId) {
      return null;
    }
    const restaurantLists = globalLists.filter(
      (list) => list.listType === 'restaurant',
    );
    if (!restaurantLists.length) {
      return null;
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ list_id: string; rank: number; name: string }>
    >(Prisma.sql`
      /*curated:near_you_items*/
      SELECT i.list_id, i.rank, e.name
      FROM curated_list_items i
      JOIN core_entities e ON e.entity_id = i.entity_id
      JOIN places hp ON hp.place_id = ${headerPlace.placeId}::uuid
      WHERE i.list_id = ANY(${restaurantLists.map((list) => list.listId)}::uuid[])
        AND e.latitude IS NOT NULL
        AND e.longitude IS NOT NULL
        AND hp.bbox_min_lat IS NOT NULL
        AND e.latitude BETWEEN hp.bbox_min_lat AND hp.bbox_max_lat
        AND ((hp.bbox_min_lng <= hp.bbox_max_lng
              AND e.longitude BETWEEN hp.bbox_min_lng AND hp.bbox_max_lng)
             OR (hp.bbox_min_lng > hp.bbox_max_lng
                 AND (e.longitude >= hp.bbox_min_lng OR e.longitude <= hp.bbox_max_lng)))
        AND (NOT EXISTS (
               SELECT 1 FROM place_geometries pg WHERE pg.place_id = hp.place_id
             )
             OR EXISTS (
               SELECT 1 FROM place_geometries pg
               WHERE pg.place_id = hp.place_id
                 AND ST_Covers(
                   pg.geometry,
                   ST_SetSRID(ST_MakePoint(e.longitude::float8, e.latitude::float8), 4326)
                 )
             ))
      ORDER BY i.list_id, i.rank
    `);
    const byList = new Map<string, string[]>();
    for (const row of rows) {
      const bucket = byList.get(row.list_id);
      if (bucket) {
        bucket.push(row.name);
      } else {
        byList.set(row.list_id, [row.name]);
      }
    }
    const shelfLists: HomeShelfList[] = [];
    for (const list of restaurantLists) {
      const names = byList.get(list.listId) ?? [];
      if (names.length < MIN_VIABLE_LIST_ITEMS) {
        continue;
      }
      shelfLists.push({
        listId: list.listId,
        title: list.title,
        subtitle: list.subtitle,
        iconKey: list.iconKey,
        listType: list.listType,
        itemCount: names.length,
        previewNames: names.slice(0, PREVIEW_NAMES_COUNT),
      });
    }
    if (!shelfLists.length) {
      return null;
    }
    return {
      key: 'near_you',
      title: `Best near you in ${headerPlace.name}`,
      lists: shelfLists,
    };
  }

  private async loadScores(
    subjectType: 'restaurant' | 'connection',
    subjectIds: string[],
  ): Promise<
    Map<
      string,
      {
        displayScore: number;
        percentileRank: number | null;
        rising: number | null;
      }
    >
  > {
    if (!subjectIds.length) {
      return new Map();
    }
    const rows = await this.prisma.publicEntityScore.findMany({
      where: { subjectType, subjectId: { in: subjectIds } },
      select: {
        subjectId: true,
        displayScore: true,
        percentileRank: true,
        rising: true,
      },
    });
    return new Map(
      rows.map((row) => [
        row.subjectId,
        {
          displayScore: Number(row.displayScore),
          percentileRank:
            row.percentileRank == null ? null : Number(row.percentileRank),
          rising: row.rising == null ? null : Number(row.rising),
        },
      ]),
    );
  }
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
