import { BadRequestException, Injectable } from '@nestjs/common';
import { FavoriteListType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  FilterClause,
  QueryPlan,
  SearchResponse,
  SearchResponseMetadata,
} from '@crave-search/shared';
import { SearchQueryExecutor } from '../search/search-query.executor';
import type { SearchQueryRequestDto } from '../search/dto/search-query.dto';
import { FavoriteListResultsDto } from './dto/favorite-list-results.dto';
import type { FavoriteListItemDetail } from './favorite-list.mappers';

export type FavoriteListSort = 'custom' | 'best' | 'recent';

/** The parameterized source the assembler runs over (concrete or virtual). */
export type ListResultsSource = {
  /** metadata label — the concrete listId or the virtual id. */
  labelId: string;
  listType: FavoriteListType;
  items: FavoriteListItemDetail[];
  updatedAtMs: number;
  /** virtual sources cannot have a custom order. */
  allowCustomSort: boolean;
  defaultSort: FavoriteListSort;
};

/**
 * The favorites results/query engine: hydrates a (concrete or virtual) list
 * source into a FULL SearchResponse with byte-level parity to a real
 * query-search (rank, craveScore order, operatingStatus, price, distance,
 * lat/lng, locations, topFood, pins). We deliberately route through the
 * SEARCH EXECUTOR rather than the hand-rolled detail mappers (which hardcode
 * rank/price/operatingStatus/distance to null).
 *
 * Restaurant lists filter the restaurant axis by r.entity_id = ANY(...);
 * dish lists filter the connection axis by the c.connection_id = ANY(...)
 * builder clause. The executor INNER-JOINs scores/locations, so score-less or
 * un-geocoded favorites are silently dropped — surfaced via droppedItemCount.
 *
 * Access is resolved BEFORE this runs (FavoriteListAccessPolicy); this class
 * knows nothing about viewers.
 */
@Injectable()
export class ListResultsAssembler {
  constructor(
    private readonly searchQueryExecutor: SearchQueryExecutor,
    private readonly prisma: PrismaService,
  ) {}

  async run(
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

    // ListDetail "sliced by city" (§8.16): an EXPLICIT user chip slice. The
    // search engine carries no place conditions (master plan §7), so the
    // slice is an id PRE-FILTER here — same shape as the favorites scoping
    // itself, applied before pagination. Order-preserving. Geometry source is
    // the place catalog's ONE ground (place_geometries, §2.6) — the old
    // core_markets read is dead (markets extermination leg 3).
    const cityPlaceId = dto.cityPlaceId?.trim() || null;
    let sliceAllow: Set<string> | null = null;
    if (cityPlaceId) {
      const candidateRestaurantIds = Array.from(
        new Set([...restaurantIds, ...dishListRestaurantIds]),
      );
      if (candidateRestaurantIds.length) {
        const rows = await this.prisma.$queryRaw<
          Array<{ restaurantId: string }>
        >(Prisma.sql`
          SELECT DISTINCT rl.restaurant_id AS "restaurantId"
          FROM core_restaurant_locations rl
          JOIN place_geometries pg
            ON pg.place_id = ${cityPlaceId}::uuid
          WHERE rl.restaurant_id = ANY(${candidateRestaurantIds}::uuid[])
            AND rl.latitude IS NOT NULL
            AND rl.longitude IS NOT NULL
            AND ST_Covers(
              pg.geometry,
              ST_SetSRID(
                ST_MakePoint(
                  rl.longitude::double precision,
                  rl.latitude::double precision
                ),
                4326
              )
            )
        `);
        sliceAllow = new Set(rows.map((row) => row.restaurantId));
      } else {
        sliceAllow = new Set();
      }
    }
    const restaurantIdByConnectionId = new Map<string, string>();
    for (const item of source.items) {
      const connectionId = item.connection?.connectionId;
      const restaurantIdForItem = item.connection?.restaurantId;
      if (connectionId && restaurantIdForItem) {
        restaurantIdByConnectionId.set(connectionId, restaurantIdForItem);
      }
    }
    const slicedRestaurantIds = sliceAllow
      ? restaurantIds.filter((id) => sliceAllow.has(id))
      : restaurantIds;
    const slicedDishListRestaurantIds = sliceAllow
      ? dishListRestaurantIds.filter((id) => sliceAllow.has(id))
      : dishListRestaurantIds;
    const slicedConnectionIds = sliceAllow
      ? connectionIds.filter((id) => {
          const restaurantIdForConnection = restaurantIdByConnectionId.get(id);
          return restaurantIdForConnection
            ? sliceAllow.has(restaurantIdForConnection)
            : false;
        })
      : connectionIds;

    const requestedIds = isRestaurantAxis
      ? slicedRestaurantIds
      : slicedConnectionIds;

    // The saver's note projects onto the axis rows (spec B.1.5) — first-wins
    // across the virtual union.
    const noteByAxisId = new Map<string, string>();
    // W1 edit mode: each axis row also carries the FavoriteListItem id backing
    // it (first-wins across the virtual union, same law as the note) so the
    // client can build the drag-save's orderedItemIds without a second read.
    const itemIdByAxisId = new Map<string, string>();
    // Location-centric saves (master plan §7): the saved location projects
    // onto the axis rows — ListDetail renders exactly the saved pin, never
    // the search-center-selected sibling. First-wins, same law as the note.
    const savedLocationByAxisId = new Map<
      string,
      NonNullable<FavoriteListItemDetail['location']>
    >();
    for (const item of source.items) {
      const id = axisIdOf(item);
      if (id && item.note != null && !noteByAxisId.has(id)) {
        noteByAxisId.set(id, item.note);
      }
      if (id && !itemIdByAxisId.has(id)) {
        itemIdByAxisId.set(id, item.itemId);
      }
      if (id && item.location && !savedLocationByAxisId.has(id)) {
        savedLocationByAxisId.set(id, item.location);
      }
    }

    // Empty-axis guard: the search builder OMITS the `entity_id = ANY(...)` clause when an id
    // array is empty, which would flood the un-scoped axis with the entire global universe. A
    // favorites list with no items (or a dish list whose connections yield no restaurant ids)
    // must return an EMPTY result set, never the whole DB — short-circuit before executeDual.
    if (
      requestedIds.length === 0 ||
      (!isRestaurantAxis && slicedDishListRestaurantIds.length === 0)
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
    // requestedIds is the SLICED ordered axis list (the city pre-filter is
    // order-preserving) — explicit-order pagination must page over it, never
    // the unsliced ordering (red-team finding on 372dc415).
    const pageAxisIds = explicitOrder
      ? requestedIds.slice(skip, skip + pageSize)
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
    // Leg 11 (sim-caught): the executor's price filter reads priceLevels from a
    // PLAN clause payload (SearchQueryBuilder.extractPriceLevels over
    // plan.restaurantFilters) — request.priceLevels is inert on this path, so the
    // leg-10 plumbing filtered nothing. The payload rides the axis clause here.
    const priceFilterPayload = dto.priceLevels?.length
      ? { priceLevels: dto.priceLevels }
      : undefined;

    const restaurantFilters: FilterClause[] = isRestaurantAxis
      ? [
          {
            scope: 'restaurant',
            description: 'Match favorited restaurant entities',
            entityType: 'restaurant',
            entityIds: explicitOrder ? pageAxisIds : slicedRestaurantIds,
            payload: priceFilterPayload,
          },
        ]
      : [
          {
            scope: 'restaurant',
            description: "Match favorited connections' restaurants",
            entityType: 'restaurant',
            entityIds: slicedDishListRestaurantIds,
            payload: priceFilterPayload,
          },
        ];
    const connectionFilters: FilterClause[] = isRestaurantAxis
      ? []
      : [
          {
            scope: 'connection',
            description: 'Match favorited connections',
            entityType: 'connection',
            entityIds: explicitOrder ? pageAxisIds : slicedConnectionIds,
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
      priceLevels: dto.priceLevels,
      userLocation: dto.userLocation,
    };

    const pagination = explicitOrder
      ? { skip: 0, take: Math.max(pageAxisIds.length, 1) }
      : { skip, take: pageSize };

    // NO directives: the city slice is the id pre-filter above; v1 fits the
    // map to the list extent (no bounds).
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
          ...this.projectSavedLocationOntoDishRow(
            dish,
            savedLocationByAxisId.get(dish.connectionId),
          ),
          note: noteByAxisId.get(dish.connectionId) ?? null,
          favoriteListItemId: itemIdByAxisId.get(dish.connectionId) ?? null,
        }));
    const restaurants = isRestaurantAxis
      ? orderExplicitly(exec.restaurants, (r) => r.restaurantId).map(
          (restaurant) => ({
            ...this.projectSavedLocationOntoRestaurantRow(
              restaurant,
              savedLocationByAxisId.get(restaurant.restaurantId),
            ),
            note: noteByAxisId.get(restaurant.restaurantId) ?? null,
            favoriteListItemId:
              itemIdByAxisId.get(restaurant.restaurantId) ?? null,
          }),
        )
      : exec.restaurants;

    const totalFoodResults = isRestaurantAxis
      ? 0
      : explicitOrder
        ? requestedIds.length
        : exec.totalDishCount;
    const totalRestaurantResults =
      isRestaurantAxis && explicitOrder
        ? requestedIds.length
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

  /** Shared coordinate parse for the saved-pin projections: null unless the
   *  saved location has finite lat/lng. */
  private resolveSavedCoordinate(
    saved:
      | {
          latitude: unknown;
          longitude: unknown;
        }
      | undefined,
  ): { lat: number; lng: number } | null {
    if (!saved) {
      return null;
    }
    const lat = saved.latitude != null ? Number(saved.latitude) : null;
    const lng = saved.longitude != null ? Number(saved.longitude) : null;
    if (
      lat == null ||
      lng == null ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      return null;
    }
    return { lat, lng };
  }

  /** Location-centric saves (master plan §7): the saved location REPLACES the
   *  restaurant row's display location + array — ListDetail shows exactly the
   *  saved pin. Skipped when the saved location lacks coordinates OR a
   *  googlePlaceId: the mobile pin resolver (resolveRestaurantMapLocations →
   *  isValidMapLocation) rejects placeId-less locations, so projecting one
   *  would ERASE the row's pin instead of moving it. */
  private projectSavedLocationOntoRestaurantRow<
    T extends {
      restaurantId: string;
      latitude?: number | null;
      longitude?: number | null;
      address?: string | null;
      restaurantLocationId?: string | null;
      displayLocation?: unknown;
      locations?: unknown[];
      locationCount?: number | null;
    },
  >(
    row: T,
    saved:
      | {
          locationId: string;
          latitude: unknown;
          longitude: unknown;
          address: string | null;
          googlePlaceId: string | null;
        }
      | undefined,
  ): T {
    const coordinate = this.resolveSavedCoordinate(saved);
    if (!saved || !coordinate || !saved.googlePlaceId) {
      return row;
    }
    const savedDisplayLocation = {
      ...(typeof row.displayLocation === 'object' && row.displayLocation
        ? row.displayLocation
        : {}),
      locationId: saved.locationId,
      googlePlaceId: saved.googlePlaceId,
      latitude: coordinate.lat,
      longitude: coordinate.lng,
      address: saved.address ?? null,
    };
    return {
      ...row,
      latitude: coordinate.lat,
      longitude: coordinate.lng,
      address: saved.address ?? row.address ?? null,
      restaurantLocationId: saved.locationId,
      displayLocation: savedDisplayLocation,
      locations: [savedDisplayLocation],
      locationCount: 1,
    };
  }

  /** Dish-axis twin of the projection. FoodResult rows carry their map pin as
   *  restaurantLatitude/restaurantLongitude (+ restaurantLocationId) — NOT
   *  latitude/longitude/displayLocation — so the override targets those fields
   *  (the mobile dish-pin read model consumes exactly them). */
  private projectSavedLocationOntoDishRow<
    T extends {
      connectionId: string;
      restaurantLocationId?: string | null;
      restaurantLatitude?: number | null;
      restaurantLongitude?: number | null;
    },
  >(
    row: T,
    saved:
      | {
          locationId: string;
          latitude: unknown;
          longitude: unknown;
        }
      | undefined,
  ): T {
    const coordinate = this.resolveSavedCoordinate(saved);
    if (!saved || !coordinate) {
      return row;
    }
    return {
      ...row,
      restaurantLocationId: saved.locationId,
      restaurantLatitude: coordinate.lat,
      restaurantLongitude: coordinate.lng,
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
}
