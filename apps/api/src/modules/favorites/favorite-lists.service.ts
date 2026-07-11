import {
  BadRequestException,
  GoneException,
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
  FilterClause,
  FoodResult,
  QueryPlan,
  RestaurantFoodSnippet,
  RestaurantLocationResult,
  RestaurantResult,
  SearchResponse,
  SearchResponseMetadata,
} from '@crave-search/shared';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LoggerService } from '../../shared';
import { UserStatsService } from '../identity/user-stats.service';
import { CreateFavoriteListDto } from './dto/create-favorite-list.dto';
import { UpdateFavoriteListDto } from './dto/update-favorite-list.dto';
import { AddFavoriteListItemDto } from './dto/add-favorite-list-item.dto';
import { UpdateFavoriteListItemDto } from './dto/update-favorite-list-item.dto';
import { ShareFavoriteListDto } from './dto/share-favorite-list.dto';
import { ListFavoriteListsDto } from './dto/list-favorite-lists.dto';
import { FavoriteListResultsDto } from './dto/favorite-list-results.dto';
import { SearchQueryExecutor } from '../search/search-query.executor';
import type { SearchQueryRequestDto } from '../search/dto/search-query.dto';
import { systemKindRank } from './favorite-list-provisioning.service';

export type FavoriteListViewerRole = 'owner' | 'collaborator' | 'viewer';
export type FavoriteListSort = 'custom' | 'best' | 'recent';

/** The person-rows shape (matches user-follow's select). */
export type FavoriteListPersonDto = {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

const PERSON_SELECT = {
  userId: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Virtual "All" lists (spec B.1.6 / page-registry §8.16): no stored row —
 * the union of the target user's lists of one type, run through the SAME
 * executor path. `all:restaurants` / `all:dishes`.
 */
const VIRTUAL_ALL_IDS: Record<string, FavoriteListType> = {
  'all:restaurants': FavoriteListType.restaurant,
  'all:dishes': FavoriteListType.dish,
};

type ListAccessRow = Pick<
  FavoriteList,
  'listId' | 'ownerUserId' | 'shareSlug' | 'shareEnabled'
>;

/** The parameterized source getListResults runs over (concrete or virtual). */
type ListResultsSource = {
  /** metadata label — the concrete listId or the virtual id. */
  labelId: string;
  listType: FavoriteListType;
  items: FavoriteListItemDetail[];
  updatedAtMs: number;
  /** virtual sources cannot have a custom order. */
  allowCustomSort: boolean;
  defaultSort: FavoriteListSort;
};

type FavoriteListSummary = {
  listId: string;
  name: string;
  description?: string | null;
  listType: FavoriteListType;
  visibility: FavoriteListVisibility;
  itemCount: number;
  position: number;
  systemKind: string | null;
  /** Profile-gallery pin (§8.12/§8.14) — owner curation, floats first there. */
  pinned: boolean;
  /** Majority market of the list's items (profile city grouping, §8.15).
   *  Only computed on the public profile read; null elsewhere. */
  city?: string | null;
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
  'subjectId' | 'displayScore' | 'percentileRank' | 'rising'
>;

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
    private readonly searchQueryExecutor: SearchQueryExecutor,
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
    return this.orderHomeLists(lists).map((list) =>
      this.buildListSummary(list, previewScores),
    );
  }

  /**
   * Home / save-sheet list ordering (page-registry §8.7/§8.8): system default
   * lists pin to the top in their fixed rank (Been, Want to go, Tried, Want
   * to try), then the user's lists in their custom home order if one exists,
   * else the home default — recently updated. "Custom order set" = the user
   * lists' positions diverge from their creation order (updateListPosition is
   * the only perturbation; provisioning positions never count — system lists
   * are excluded from the divergence test).
   */
  private orderHomeLists<
    T extends Pick<
      FavoriteList,
      'listId' | 'systemKind' | 'position' | 'createdAt' | 'updatedAt'
    >,
  >(lists: T[]): T[] {
    const systemLists = lists
      .filter((list) => list.systemKind != null)
      .sort(
        (a, b) => systemKindRank(a.systemKind) - systemKindRank(b.systemKind),
      );
    const userLists = lists.filter((list) => list.systemKind == null);
    const byPosition = [...userLists].sort(
      (a, b) =>
        a.position - b.position ||
        a.createdAt.valueOf() - b.createdAt.valueOf(),
    );
    const byCreated = [...userLists].sort(
      (a, b) =>
        a.createdAt.valueOf() - b.createdAt.valueOf() ||
        a.position - b.position,
    );
    const hasCustomHomeOrder = byPosition.some(
      (list, index) => list.listId !== byCreated[index].listId,
    );
    const orderedUserLists = hasCustomHomeOrder
      ? byPosition
      : [...userLists].sort(
          (a, b) => b.updatedAt.valueOf() - a.updatedAt.valueOf(),
        );
    return [...systemLists, ...orderedUserLists];
  }

  async listPublicForUser(userId: string, query: ListFavoriteListsDto) {
    const lists = await this.prisma.favoriteList.findMany({
      where: {
        ownerUserId: userId,
        listType: query.listType,
        visibility: FavoriteListVisibility.public,
      },
      include: {
        items: {
          orderBy: { position: 'asc' },
          take: 5,
          include: {
            restaurant: {
              select: { entityId: true, name: true, city: true },
            },
            connection: {
              select: {
                connectionId: true,
                food: { select: { entityId: true, name: true } },
                restaurant: { select: { entityId: true, name: true } },
              },
            },
          },
        },
      },
    });

    // Profile-gallery order (§8.12/§8.14): owner pins first, then
    // reverse-chronological. The own-home custom order never applies here.
    const ordered = [...lists].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.updatedAt.valueOf() - a.updatedAt.valueOf(),
    );

    const [previewScores, cityByList] = await Promise.all([
      this.loadPreviewScoreMaps(ordered),
      this.loadMajorityCities(ordered.map((list) => list.listId)),
    ]);
    return ordered.map((list) => ({
      ...this.buildListSummary(list, previewScores),
      city: cityByList.get(list.listId) ?? null,
    }));
  }

  /**
   * §8.15 city grouping: a list's city = the majority market of its items
   * (restaurant items directly; dish items via their connection's
   * restaurant). Ties break arbitrarily-but-stably; the client renders the
   * "Multiple cities"/flat decisions on top of this.
   */
  private async loadMajorityCities(
    listIds: string[],
  ): Promise<Map<string, string | null>> {
    if (listIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ list_id: string; city: string | null }>
    >(Prisma.sql`
      SELECT list_id, city FROM (
        SELECT li.list_id,
               COALESCE(er.city, ecr.city) AS city,
               ROW_NUMBER() OVER (
                 PARTITION BY li.list_id
                 ORDER BY COUNT(*) DESC, COALESCE(er.city, ecr.city) ASC
               ) AS rn
        FROM favorite_list_items li
        LEFT JOIN core_entities er ON er.entity_id = li.restaurant_id
        LEFT JOIN core_restaurant_items c ON c.connection_id = li.connection_id
        LEFT JOIN core_entities ecr ON ecr.entity_id = c.restaurant_id
        WHERE li.list_id IN (${Prisma.join(listIds.map((id) => Prisma.sql`${id}::uuid`))})
        GROUP BY li.list_id, COALESCE(er.city, ecr.city)
      ) ranked
      WHERE rn = 1
    `);
    return new Map(rows.map((row) => [row.list_id, row.city]));
  }

  /**
   * RT-18: the slug IS the capability. Access = owner OR collaborator OR
   * presented-shareSlug-matches (rotation = revocation falls out). Fail-closed:
   * everything else is a 404; a presented slug that matches a list whose
   * sharing has been turned off is a 410 {state:'private'} (the client's
   * "this list is private" body — distinct from 404).
   */
  async getListForUser(userId: string, listId: string, shareSlug?: string) {
    this.assertConcreteListId(listId);
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
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

    const viewerRole = await this.resolveViewerRole(list, userId, shareSlug);
    return this.buildListDetail(list, viewerRole);
  }

  /**
   * Resolves the viewer's role against the RT-18 capability model. Throws
   * NotFound (fail-closed) when no grant applies, Gone({state:'private'})
   * when the presented slug matches but sharing is off. A slug-granted read
   * records a deduped 'opened' share event (slug+viewer).
   */
  private async resolveViewerRole(
    list: ListAccessRow,
    viewerUserId: string | null,
    presentedSlug?: string,
  ): Promise<FavoriteListViewerRole> {
    if (viewerUserId && list.ownerUserId === viewerUserId) {
      return 'owner';
    }
    if (viewerUserId) {
      const collaborator =
        await this.prisma.favoriteListCollaborator.findUnique({
          where: {
            listId_userId: { listId: list.listId, userId: viewerUserId },
          },
          select: { userId: true },
        });
      if (collaborator) {
        return 'collaborator';
      }
    }
    if (presentedSlug && list.shareSlug === presentedSlug) {
      if (!list.shareEnabled) {
        // Dead slug: the row is kept so the client can render the
        // "this list is private" body instead of a generic not-found.
        throw new GoneException({ state: 'private' });
      }
      await this.recordShareOpenEvent(list.listId, presentedSlug, viewerUserId);
      return 'viewer';
    }
    throw new NotFoundException('Favorite list not found');
  }

  /** Mutation grant: owner or collaborator only — never the slug. */
  private async assertOwnerOrCollaborator(
    list: Pick<FavoriteList, 'listId' | 'ownerUserId'>,
    userId: string,
  ): Promise<void> {
    if (list.ownerUserId === userId) {
      return;
    }
    const collaborator = await this.prisma.favoriteListCollaborator.findUnique({
      where: { listId_userId: { listId: list.listId, userId } },
      select: { userId: true },
    });
    if (!collaborator) {
      throw new NotFoundException('Favorite list not found');
    }
  }

  /**
   * Share-open telemetry with the RT-18 flood fix: idempotent via the
   * dedupe_key unique constraint (P2002 = already counted = no-op).
   * Key = slug+viewer for authed reads, slug+day for anonymous ones
   * (anchor adjudication, w1 spec D.8).
   */
  private async recordShareOpenEvent(
    listId: string,
    shareSlug: string,
    viewerUserId: string | null,
  ): Promise<void> {
    const dedupeKey = viewerUserId
      ? `opened:${shareSlug}:${viewerUserId}`
      : `opened:${shareSlug}:${new Date().toISOString().slice(0, 10)}`;
    try {
      await this.prisma.favoriteListShareEvent.create({
        data: {
          listId,
          shareSlug,
          eventType: 'opened',
          dedupeKey,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return;
      }
      throw error;
    }
  }

  private assertConcreteListId(listId: string): void {
    if (!UUID_RE.test(listId)) {
      throw new BadRequestException('Invalid list id');
    }
  }

  /**
   * 'custom' order exists iff position order diverges from insertion
   * (createdAt) order — positions are assigned append-only (max+1) until a
   * reorder/explicit position write perturbs them.
   */
  private hasCustomOrder(
    items: Array<Pick<FavoriteListItem, 'itemId' | 'position' | 'createdAt'>>,
  ): boolean {
    const byPosition = [...items].sort(
      (a, b) =>
        a.position - b.position ||
        a.createdAt.valueOf() - b.createdAt.valueOf(),
    );
    const byCreated = [...items].sort(
      (a, b) =>
        a.createdAt.valueOf() - b.createdAt.valueOf() ||
        a.position - b.position,
    );
    return byPosition.some(
      (item, index) => item.itemId !== byCreated[index].itemId,
    );
  }

  /**
   * Hydrate a favorites list into a FULL SearchResponse with byte-level parity
   * to a real query-search (rank, craveScore order, operatingStatus, price,
   * distance, lat/lng, locations, topFood, pins). We deliberately route through
   * the SEARCH EXECUTOR rather than the hand-rolled mapRestaurantResults/
   * mapFoodResults (which hardcode rank/price/operatingStatus/distance to null).
   *
   * Restaurant lists filter the restaurant axis by r.entity_id = ANY(...);
   * dish lists filter the connection axis by the new c.connection_id = ANY(...)
   * builder clause. The executor INNER-JOINs scores/locations, so score-less or
   * un-geocoded favorites are silently dropped — surfaced via droppedItemCount.
   *
   * Access is the RT-18 capability model (owner OR collaborator OR presented
   * slug). Also accepts the virtual All-list ids (`all:restaurants` /
   * `all:dishes`, optional dto.targetUserId for a profile's All) — the union
   * of the target's lists resolved through this same executor path.
   */
  async getListResults(
    userId: string,
    listId: string,
    dto: FavoriteListResultsDto,
  ): Promise<SearchResponse> {
    const source = await this.resolveResultsSource(userId, listId, dto);
    return this.runListResults(source, dto);
  }

  private async resolveResultsSource(
    userId: string,
    listId: string,
    dto: FavoriteListResultsDto,
  ): Promise<ListResultsSource> {
    const virtualType = VIRTUAL_ALL_IDS[listId];
    if (virtualType) {
      return this.buildVirtualAllSource(userId, listId, virtualType, dto);
    }
    this.assertConcreteListId(listId);
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
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

    await this.resolveViewerRole(list, userId, dto.shareSlug);

    return {
      labelId: listId,
      listType: list.listType,
      items: list.items,
      updatedAtMs: (list.updatedAt ?? new Date()).valueOf(),
      allowCustomSort: true,
      defaultSort: this.hasCustomOrder(list.items) ? 'custom' : 'best',
    };
  }

  private async buildVirtualAllSource(
    userId: string,
    labelId: string,
    listType: FavoriteListType,
    dto: FavoriteListResultsDto,
  ): Promise<ListResultsSource> {
    const targetUserId = dto.targetUserId ?? userId;
    const lists = await this.prisma.favoriteList.findMany({
      where:
        targetUserId === userId
          ? { ownerUserId: userId, listType }
          : // Profile-All: only the target's PUBLIC lists — fail-closed by
            // construction, nothing private can leak into the union.
            {
              ownerUserId: targetUserId,
              listType,
              visibility: FavoriteListVisibility.public,
            },
      orderBy: { position: 'asc' },
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

    const items = lists.flatMap((list) => list.items);
    const updatedAtMs = lists.reduce(
      (max, list) => Math.max(max, list.updatedAt?.valueOf() ?? 0),
      0,
    );

    return {
      labelId,
      listType,
      items,
      updatedAtMs: updatedAtMs || Date.now(),
      allowCustomSort: false,
      defaultSort: 'best',
    };
  }

  private async runListResults(
    source: ListResultsSource,
    dto: FavoriteListResultsDto,
  ): Promise<SearchResponse> {
    const isRestaurantAxis = source.listType === FavoriteListType.restaurant;

    const sort: FavoriteListSort = dto.sort ?? source.defaultSort;
    if (sort === 'custom' && !source.allowCustomSort) {
      throw new BadRequestException(
        'Custom sort requires a concrete list (the virtual All list has no custom order)',
      );
    }

    const axisIdOf = (item: FavoriteListItemDetail): string | null =>
      isRestaurantAxis ? item.restaurantId : item.connectionId;

    // Items arrive position-asc per list; explicit sorts re-derive the order.
    // 'best' keeps the executor's crave-score ordering (id order irrelevant).
    const sortedItems =
      sort === 'custom'
        ? [...source.items].sort(
            (a, b) =>
              a.position - b.position ||
              a.createdAt.valueOf() - b.createdAt.valueOf(),
          )
        : sort === 'recent'
          ? [...source.items].sort(
              (a, b) => b.createdAt.valueOf() - a.createdAt.valueOf(),
            )
          : source.items;

    // First-wins dedupe preserving sorted order (the virtual union can repeat
    // an entity across lists).
    const orderedAxisIds: string[] = [];
    const seenAxisIds = new Set<string>();
    for (const item of sortedItems) {
      const id = axisIdOf(item);
      if (id && !seenAxisIds.has(id)) {
        seenAxisIds.add(id);
        orderedAxisIds.push(id);
      }
    }

    const restaurantIds = isRestaurantAxis ? orderedAxisIds : [];
    const connectionIds = isRestaurantAxis ? [] : orderedAxisIds;

    // For a DISH list the map PINS + restaurant cards come from response.restaurants,
    // and each favorited dish lives at its restaurant's location. Scope the restaurant
    // axis to the DISTINCT restaurants of the favorited connections so it does not flood
    // with the global universe. The connections were loaded with connection.restaurant,
    // so connection.restaurantId is available here.
    const dishListRestaurantIds = isRestaurantAxis
      ? []
      : Array.from(
          new Set(
            source.items
              .map((item) => item.connection?.restaurantId)
              .filter((id): id is string => Boolean(id)),
          ),
        );

    const requestedIds = isRestaurantAxis ? restaurantIds : connectionIds;

    // The saver's note projects onto the axis rows (spec B.1.5) — first-wins
    // across the virtual union.
    const noteByAxisId = new Map<string, string>();
    // W1 edit mode: each axis row also carries the FavoriteListItem id backing
    // it (first-wins across the virtual union, same law as the note) so the
    // client can build the drag-save's orderedItemIds without a second read.
    const itemIdByAxisId = new Map<string, string>();
    for (const item of source.items) {
      const id = axisIdOf(item);
      if (id && item.note != null && !noteByAxisId.has(id)) {
        noteByAxisId.set(id, item.note);
      }
      if (id && !itemIdByAxisId.has(id)) {
        itemIdByAxisId.set(id, item.itemId);
      }
    }

    // Empty-axis guard: the search builder OMITS the `entity_id = ANY(...)` clause when an id
    // array is empty, which would flood the un-scoped axis with the entire global universe. A
    // favorites list with no items (or a dish list whose connections yield no restaurant ids)
    // must return an EMPTY result set, never the whole DB — short-circuit before executeDual.
    if (
      requestedIds.length === 0 ||
      (!isRestaurantAxis && dishListRestaurantIds.length === 0)
    ) {
      return this.buildEmptyListResponse(source, requestedIds.length);
    }

    const page =
      dto.pagination?.page && dto.pagination.page > 0 ? dto.pagination.page : 1;
    const pageSize =
      dto.pagination?.pageSize && dto.pagination.pageSize > 0
        ? dto.pagination.pageSize
        : Math.max(requestedIds.length, 1);
    const skip = (page - 1) * pageSize;

    // Explicit orderings ('custom'/'recent') paginate OURSELVES over the
    // ordered ids and hand the executor exactly the page's ids (skip 0) —
    // the executor can only order by score. 'best' keeps the executor's
    // score pagination untouched.
    const explicitOrder = sort !== 'best';
    const pageAxisIds = explicitOrder
      ? orderedAxisIds.slice(skip, skip + pageSize)
      : requestedIds;
    if (explicitOrder && pageAxisIds.length === 0) {
      // Page past the end: never hand the executor an empty id array (the
      // builder would drop the clause and flood the axis).
      return this.buildEmptyListResponse(source, requestedIds.length);
    }

    // Scope the axis we run. Restaurant list: restaurantFilters = favorited
    // restaurants; connectionFilters stay empty and the dish axis is never
    // executed (executeSingle below). Dish list: connectionFilters = favorited
    // connections AND restaurantFilters = those connections' distinct
    // restaurants (the restaurant axis feeds the map pins).
    const restaurantFilters: FilterClause[] = isRestaurantAxis
      ? [
          {
            scope: 'restaurant',
            description: 'Match favorited restaurant entities',
            entityType: 'restaurant',
            entityIds: explicitOrder ? pageAxisIds : restaurantIds,
          },
        ]
      : [
          {
            scope: 'restaurant',
            description: "Match favorited connections' restaurants",
            entityType: 'restaurant',
            entityIds: dishListRestaurantIds,
          },
        ];
    const connectionFilters: FilterClause[] = isRestaurantAxis
      ? []
      : [
          {
            scope: 'connection',
            description: 'Match favorited connections',
            entityType: 'connection',
            entityIds: explicitOrder ? pageAxisIds : connectionIds,
          },
        ];

    const plan: QueryPlan = {
      format: 'dual_list',
      restaurantFilters,
      connectionFilters,
      ranking: {
        foodOrder: 'crave_score DESC',
        restaurantOrder: 'crave_score DESC',
      },
      diagnostics: {
        missingEntities: [],
        notes: [`favorites:${source.listType}`, `favorites:sort:${sort}`],
      },
    };

    // Build a minimal SearchQueryRequestDto for the executor. No bounds/polygon:
    // v1 fits the map to the list extent. entities are empty — all matching is
    // driven by the hand-built plan filters above.
    const request: SearchQueryRequestDto = {
      entities: {},
      openNow: dto.openNow,
      userLocation: dto.userLocation,
    };

    const pagination = explicitOrder
      ? { skip: 0, take: Math.max(pageAxisIds.length, 1) }
      : { skip, take: pageSize };

    // NO bounds directives passed (directives omitted entirely).
    //
    // A RESTAURANT list only consumes the restaurant axis (dishes are discarded
    // below), so run a single-axis query and skip the throwaway dish SQL. A DISH
    // list, by contrast, consumes BOTH axes — `exec.dishes` for the list AND
    // `exec.restaurants` for the map pins/restaurant cards (the restaurant axis
    // is scoped to the favorited connections' restaurants above) — so it keeps
    // the dual path.
    const exec = isRestaurantAxis
      ? await this.searchQueryExecutor.executeSingle({
          axis: 'restaurant',
          plan,
          request,
          pagination,
        })
      : await this.searchQueryExecutor.executeDual({
          plan,
          request,
          pagination,
        });

    const requestedForRun = explicitOrder ? pageAxisIds : requestedIds;
    const returnedIds = isRestaurantAxis
      ? exec.restaurants
          .map((r) => r.restaurantId)
          .filter((id): id is string => typeof id === 'string')
      : exec.dishes
          .map((d) => d.connectionId)
          .filter((id): id is string => typeof id === 'string');
    const droppedItemCount = Math.max(
      requestedForRun.length - new Set(returnedIds).size,
      0,
    );

    // Re-impose the explicit ordering on the executor's score-ordered rows.
    const axisRank = new Map(pageAxisIds.map((id, index) => [id, index]));
    const orderExplicitly = <T>(rows: T[], idOf: (row: T) => string): T[] =>
      explicitOrder
        ? [...rows].sort(
            (a, b) =>
              (axisRank.get(idOf(a)) ?? Number.MAX_SAFE_INTEGER) -
              (axisRank.get(idOf(b)) ?? Number.MAX_SAFE_INTEGER),
          )
        : rows;

    // A restaurant list never runs the dish axis (executeSingle above), so
    // exec.dishes is already [] and exec.totalDishCount is 0 for that path; the
    // explicit zeroes below keep the response shape unambiguous regardless.
    // Note projection (spec B.1.5): the saver's note rides each axis row.
    const dishes = isRestaurantAxis
      ? []
      : orderExplicitly(exec.dishes, (d) => d.connectionId).map((dish) => ({
          ...dish,
          note: noteByAxisId.get(dish.connectionId) ?? null,
          favoriteListItemId: itemIdByAxisId.get(dish.connectionId) ?? null,
        }));
    const restaurants = isRestaurantAxis
      ? orderExplicitly(exec.restaurants, (r) => r.restaurantId).map(
          (restaurant) => ({
            ...restaurant,
            note: noteByAxisId.get(restaurant.restaurantId) ?? null,
            favoriteListItemId:
              itemIdByAxisId.get(restaurant.restaurantId) ?? null,
          }),
        )
      : exec.restaurants;

    const totalFoodResults = isRestaurantAxis
      ? 0
      : explicitOrder
        ? orderedAxisIds.length
        : exec.totalDishCount;
    const totalRestaurantResults =
      isRestaurantAxis && explicitOrder
        ? orderedAxisIds.length
        : exec.totalRestaurantCount;

    const searchRequestId = `favorites:${source.labelId}:${source.updatedAtMs}`;

    const metadata: SearchResponseMetadata = {
      totalFoodResults,
      totalRestaurantResults,
      queryExecutionTimeMs: 0,
      searchRequestId,
      boundsApplied: false,
      openNowApplied: exec.metadata.openNowApplied,
      openNowSupportedRestaurants: exec.metadata.openNowSupportedRestaurants,
      openNowUnsupportedRestaurants:
        exec.metadata.openNowUnsupportedRestaurants,
      openNowUnsupportedRestaurantIds:
        exec.metadata.openNowUnsupportedRestaurantIds,
      openNowFilteredOut: exec.metadata.openNowFilteredOut,
      priceFilterApplied: exec.metadata.priceFilterApplied,
      minimumVotesApplied: exec.metadata.minimumVotesApplied,
      page,
      pageSize,
      resultCoverageStatus: 'full',
      analysisMetadata: {
        favorites: {
          listId: source.labelId,
          listType: source.listType,
          sort,
          requestedItemCount: requestedForRun.length,
          returnedItemCount: new Set(returnedIds).size,
          droppedItemCount,
        },
      },
    };

    return {
      format: plan.format,
      plan,
      dishes,
      restaurants,
      sqlPreview: null,
      metadata,
    };
  }

  private buildEmptyListResponse(
    source: ListResultsSource,
    requestedItemCount: number,
  ): SearchResponse {
    return {
      format: 'dual_list',
      plan: {
        format: 'dual_list',
        restaurantFilters: [],
        connectionFilters: [],
        ranking: {
          foodOrder: 'crave_score DESC',
          restaurantOrder: 'crave_score DESC',
        },
        diagnostics: {
          missingEntities: [],
          notes: [`favorites:${source.listType}:empty`],
        },
      },
      dishes: [],
      restaurants: [],
      sqlPreview: null,
      metadata: {
        totalFoodResults: 0,
        totalRestaurantResults: 0,
        queryExecutionTimeMs: 0,
        searchRequestId: `favorites:${source.labelId}:${source.updatedAtMs}`,
        boundsApplied: false,
        openNowApplied: false,
        openNowSupportedRestaurants: 0,
        openNowUnsupportedRestaurants: 0,
        openNowFilteredOut: 0,
        priceFilterApplied: false,
        minimumVotesApplied: false,
        page: 1,
        pageSize: 1,
        resultCoverageStatus: 'full',
        emptyQueryMessage:
          'This list has no items yet — add favorites to see them here.',
        analysisMetadata: {
          favorites: {
            listId: source.labelId,
            listType: source.listType,
            requestedItemCount,
            returnedItemCount: 0,
            droppedItemCount: requestedItemCount,
          },
        },
      },
    };
  }

  async getSharedList(shareSlug: string) {
    const list = await this.prisma.favoriteList.findFirst({
      // RT-18: match on the slug ALONE so a dead slug (sharing turned off /
      // list flipped private) is distinguishable — 410 {state:'private'} vs
      // a plain 404 for a slug that never existed / was rotated away.
      where: { shareSlug },
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
    if (!list.shareEnabled) {
      throw new GoneException({ state: 'private' });
    }

    // Anonymous surface: dedupe by slug+day (anchor adjudication).
    await this.recordShareOpenEvent(list.listId, shareSlug, null);

    return this.buildListDetail(list, 'viewer');
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

    // RT-18 private flip: going private also turns sharing off AND deletes
    // every collaborator (the slug row stays, dead, so the share GET can
    // answer 410 {state:'private'}).
    const flippingPrivate = dto.visibility === FavoriteListVisibility.private;
    return this.prisma.$transaction(async (tx) => {
      if (flippingPrivate) {
        await tx.favoriteListCollaborator.deleteMany({ where: { listId } });
      }
      return tx.favoriteList.update({
        where: { listId },
        data: {
          name: dto.name?.trim() ?? undefined,
          description:
            dto.description !== undefined
              ? dto.description?.trim() || null
              : undefined,
          visibility: dto.visibility ?? undefined,
          pinned: dto.pinned ?? undefined,
          shareEnabled: flippingPrivate ? false : undefined,
        },
      });
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
      select: { listId: true, itemCount: true, systemKind: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    if (list.systemKind != null) {
      // Page-registry §8.7: the four auto-created defaults are permanent.
      throw new BadRequestException('System default lists cannot be deleted');
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
    // Full-parity collaborators (spec B.1.3): item mutations are
    // owner-OR-collaborator, never slug-granted.
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      select: { listId: true, ownerUserId: true, listType: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    await this.assertOwnerOrCollaborator(list, userId);

    if (!dto.restaurantId && !dto.connectionId) {
      throw new BadRequestException('Missing list item target');
    }
    if (dto.restaurantId && dto.connectionId) {
      throw new BadRequestException('Only one list item target is allowed');
    }

    let restaurantId = dto.restaurantId ?? null;
    let connectionId = dto.connectionId ?? null;

    // Save-sheet side flip (page-registry §8.8): a dish-triggered save flipped
    // to the restaurant side targets the RESTAURANT OF THE TRIGGERING DISH.
    // The client only carries the connectionId, so a connection target on a
    // restaurant list resolves server-side to that connection's restaurant.
    if (list.listType === FavoriteListType.restaurant && connectionId) {
      const connection = await this.prisma.connection.findUnique({
        where: { connectionId },
        select: { restaurantId: true },
      });
      if (!connection) {
        throw new NotFoundException('Connection not found');
      }
      restaurantId = connection.restaurantId;
      connectionId = null;
    }

    if (list.listType === FavoriteListType.restaurant && !restaurantId) {
      throw new BadRequestException(
        'Restaurant list items require a restaurant',
      );
    }
    if (list.listType === FavoriteListType.dish && !connectionId) {
      throw new BadRequestException('Dish list items require a connection');
    }

    if (restaurantId) {
      const exists = await this.prisma.entity.findUnique({
        where: { entityId: restaurantId },
        select: { entityId: true },
      });
      if (!exists) {
        throw new NotFoundException('Restaurant not found');
      }
    }

    if (connectionId) {
      const exists = await this.prisma.connection.findUnique({
        where: { connectionId },
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
          restaurantId,
          connectionId,
          note: dto.note?.slice(0, 512) ?? null,
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

  async updateItem(
    userId: string,
    listId: string,
    itemId: string,
    dto: UpdateFavoriteListItemDto,
  ) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      select: { listId: true, ownerUserId: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    await this.assertOwnerOrCollaborator(list, userId);

    const result = await this.prisma.favoriteListItem.updateMany({
      where: { itemId, listId },
      data: {
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        // Toolkit: explicit null clears the note.
        ...(dto.note !== undefined
          ? { note: dto.note?.slice(0, 512) ?? null }
          : {}),
      },
    });
    if (result.count === 0) {
      throw new NotFoundException('Favorite list item not found');
    }
    return { itemId };
  }

  async removeItem(userId: string, listId: string, itemId: string) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      select: { listId: true, ownerUserId: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    await this.assertOwnerOrCollaborator(list, userId);
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

  /**
   * Batch reorder (spec B.1.4): one PATCH for a drag-save instead of N item
   * PATCHes. orderedItemIds must be EXACTLY the current membership (set
   * equality — loud contract, no silent partial writes); positions are
   * rewritten 1..n in one transaction.
   */
  async reorderItems(userId: string, listId: string, orderedItemIds: string[]) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      select: { listId: true, ownerUserId: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    await this.assertOwnerOrCollaborator(list, userId);

    const currentItems = await this.prisma.favoriteListItem.findMany({
      where: { listId },
      select: { itemId: true },
    });
    const currentIds = new Set(currentItems.map((item) => item.itemId));
    const orderedSet = new Set(orderedItemIds);
    if (
      orderedSet.size !== orderedItemIds.length ||
      orderedSet.size !== currentIds.size ||
      orderedItemIds.some((itemId) => !currentIds.has(itemId))
    ) {
      throw new BadRequestException(
        'orderedItemIds must be exactly the current list membership',
      );
    }

    await this.prisma.$transaction(
      orderedItemIds.map((itemId, index) =>
        this.prisma.favoriteListItem.update({
          where: { itemId },
          data: { position: index + 1 },
        }),
      ),
    );

    return { listId, itemCount: orderedItemIds.length };
  }

  /**
   * Collaborator roster (spec B.1.3). Readable under the same RT-18
   * capability as the list itself (owner / collaborator / presented slug).
   */
  async getCollaborators(
    userId: string,
    listId: string,
    shareSlug?: string,
  ): Promise<{
    owner: FavoriteListPersonDto;
    collaborators: FavoriteListPersonDto[];
  }> {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      include: {
        owner: { select: PERSON_SELECT },
        collaborators: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: PERSON_SELECT } },
        },
      },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    await this.resolveViewerRole(list, userId, shareSlug);
    return {
      owner: list.owner,
      collaborators: list.collaborators.map((row) => row.user),
    };
  }

  /**
   * Join as collaborator (spec B.1.3): the invite IS the share slug presented
   * with intent. Idempotent via the composite PK (P2002 = already a member =
   * success, RT-10 precedent). Dead slug (sharing off) = 410 {state:'private'};
   * wrong/rotated slug = 404 (fail-closed).
   */
  async joinCollaborators(userId: string, listId: string, shareSlug: string) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      select: {
        listId: true,
        ownerUserId: true,
        shareSlug: true,
        shareEnabled: true,
      },
    });
    if (!list || list.shareSlug !== shareSlug) {
      throw new NotFoundException('Favorite list not found');
    }
    if (!list.shareEnabled) {
      throw new GoneException({ state: 'private' });
    }
    if (list.ownerUserId === userId) {
      return { listId, role: 'owner' as const };
    }
    try {
      await this.prisma.favoriteListCollaborator.create({
        data: {
          listId,
          userId,
          invitedByUserId: list.ownerUserId,
        },
      });
    } catch (error) {
      if (
        !(
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
      ) {
        throw error;
      }
    }
    return { listId, role: 'collaborator' as const };
  }

  /** Self-leave (actor === target) or owner-kick. Fail-closed otherwise. */
  async removeCollaborator(
    actorUserId: string,
    listId: string,
    targetUserId: string,
  ) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      select: { listId: true, ownerUserId: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    const isOwner = list.ownerUserId === actorUserId;
    if (!isOwner && actorUserId !== targetUserId) {
      // Fail-closed: a non-owner may only remove THEMSELVES; leak nothing.
      throw new NotFoundException('Favorite list not found');
    }
    const result = await this.prisma.favoriteListCollaborator.deleteMany({
      where: { listId, userId: targetUserId },
    });
    if (result.count === 0) {
      throw new NotFoundException('Collaborator not found');
    }
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
      systemKind: list.systemKind,
      pinned: list.pinned,
      shareEnabled: list.shareEnabled,
      shareSlug: list.shareSlug,
      updatedAt: list.updatedAt,
      previewItems,
    };
  }

  private async buildListDetail(
    list: FavoriteListWithDetailItems,
    viewerRole: FavoriteListViewerRole,
  ) {
    const summary = this.buildListSummary(
      list,
      await this.loadPreviewScoreMaps([list]),
    );
    // defaultSort (spec B.1.2 / registry §8.14): the saver's ranking is the
    // default whenever a custom order exists; otherwise crave-score 'best'.
    const defaultSort: FavoriteListSort = this.hasCustomOrder(list.items)
      ? 'custom'
      : 'best';
    if (list.listType === FavoriteListType.restaurant) {
      const restaurantItems = list.items.filter((item) => item.restaurant);
      const results = await this.mapRestaurantResults(restaurantItems);
      return { list: summary, viewerRole, defaultSort, restaurants: results };
    }
    const connectionItems = list.items.filter((item) => item.connection);
    const results = await this.mapFoodResults(connectionItems);
    return { list: summary, viewerRole, defaultSort, dishes: results };
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
      this.loadPublicScores(CraveScoreSubjectType.restaurant, [
        ...restaurantIds,
      ]),
      this.loadPublicScores(CraveScoreSubjectType.connection, [
        ...connectionIds,
      ]),
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
      });
    }

    return results;
  }

  private async mapFoodResults(
    items: FavoriteListItemDetail[],
  ): Promise<FoodResult[]> {
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
