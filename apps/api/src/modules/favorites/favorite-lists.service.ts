import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FavoriteListType,
  FavoriteListVisibility,
  type FavoriteList,
  type FavoriteListItem,
  Prisma,
} from '@prisma/client';
import type { SearchResponse } from '@crave-search/shared';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFavoriteListDto } from './dto/create-favorite-list.dto';
import { UpdateFavoriteListDto } from './dto/update-favorite-list.dto';
import { AddFavoriteListItemDto } from './dto/add-favorite-list-item.dto';
import { UpdateFavoriteListItemDto } from './dto/update-favorite-list-item.dto';
import { ShareFavoriteListDto } from './dto/share-favorite-list.dto';
import { ListFavoriteListsDto } from './dto/list-favorite-lists.dto';
import { FavoriteListResultsDto } from './dto/favorite-list-results.dto';
import {
  FavoriteListAccessPolicy,
  type FavoriteListViewerRole,
} from './favorite-list-access.policy';
import {
  ListResultsAssembler,
  type FavoriteListSort,
  type ListResultsSource,
} from './favorite-list-results.assembler';
import {
  FavoriteListMapper,
  hasCustomOrder,
  type FavoriteListWithDetailItems,
} from './favorite-list.mappers';
import { FavoriteListTileGalleryService } from './favorite-list-tile-gallery.service';
import { SignalsService } from '../signals/signals.service';

export type { FavoriteListViewerRole, FavoriteListSort };

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

/**
 * Virtual "All" lists (spec B.1.6 / page-registry §8.16): no stored row —
 * the union of the target user's lists of one type, run through the SAME
 * executor path. `all:restaurants` / `all:dishes`.
 */
const VIRTUAL_ALL_IDS: Record<string, FavoriteListType> = {
  'all:restaurants': FavoriteListType.restaurant,
  'all:dishes': FavoriteListType.dish,
};

/**
 * Favorite lists orchestration + CRUD. The natural seams live elsewhere:
 * access law in FavoriteListAccessPolicy, the results/query engine in
 * ListResultsAssembler, DTO projection in FavoriteListMapper.
 */
@Injectable()
export class FavoriteListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: FavoriteListAccessPolicy,
    private readonly resultsAssembler: ListResultsAssembler,
    private readonly mapper: FavoriteListMapper,
    private readonly tileGallery: FavoriteListTileGalleryService,
    private readonly signals: SignalsService,
  ) {}

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

    const [previewScores, tileImages] = await Promise.all([
      this.mapper.loadPreviewScoreMaps(lists),
      this.tileGallery.loadTileImages(
        lists.map((list) => ({
          listId: list.listId,
          ownerUserId: list.ownerUserId,
          useOwnPhotos: list.useOwnPhotos,
        })),
      ),
    ]);
    return this.orderHomeLists(lists).map((list) => ({
      ...this.mapper.buildListSummary(list, previewScores, 'owner'),
      tileImages: tileImages.get(list.listId) ?? [],
    }));
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
    // Wave-2 §2: system defaults are REGULAR lists — no pinned prefix. Every list
    // participates in the one ordering: the user's custom order when one exists
    // (positions diverge from creation order), else recently updated. Provisioning
    // assigns creation-ordered positions, so the divergence test holds unchanged.
    const byPosition = [...lists].sort(
      (a, b) =>
        a.position - b.position ||
        a.createdAt.valueOf() - b.createdAt.valueOf(),
    );
    const byCreated = [...lists].sort(
      (a, b) =>
        a.createdAt.valueOf() - b.createdAt.valueOf() ||
        a.position - b.position,
    );
    const hasCustomHomeOrder = byPosition.some(
      (list, index) => list.listId !== byCreated[index].listId,
    );
    return hasCustomHomeOrder
      ? byPosition
      : [...lists].sort(
          (a, b) => b.updatedAt.valueOf() - a.updatedAt.valueOf(),
        );
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
      this.mapper.loadPreviewScoreMaps(ordered),
      this.loadMajorityCities(ordered.map((list) => list.listId)),
    ]);
    // 'publicProfile' projection: shareSlug is the join/read CAPABILITY —
    // it must never ride a stranger-visible payload (red-team finding 1).
    return ordered.map((list) => ({
      ...this.mapper.buildListSummary(list, previewScores, 'publicProfile'),
      city: cityByList.get(list.listId) ?? null,
    }));
  }

  /**
   * Red-team W2 (page-registry §8.4 Overview element 1): the viewer's lists
   * containing an entity — restaurant entities match items.restaurantId,
   * dish connections match items.connectionId — including the saved note.
   * "Yours" = owner OR collaborator (full-parity co-editors see the note).
   */
  async listMembershipsForEntity(userId: string, entityId: string) {
    const items = await this.prisma.favoriteListItem.findMany({
      where: {
        OR: [{ restaurantId: entityId }, { connectionId: entityId }],
        list: {
          OR: [
            { ownerUserId: userId },
            { collaborators: { some: { userId } } },
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        itemId: true,
        listId: true,
        note: true,
        list: {
          select: { name: true, listType: true, systemKind: true },
        },
      },
    });
    return items.map((item) => ({
      itemId: item.itemId,
      listId: item.listId,
      listName: item.list.name,
      listType: item.list.listType,
      systemKind: item.list.systemKind,
      note: item.note,
    }));
  }

  /**
   * §8.15 city grouping: a list's city = the majority city of its items
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
    this.access.assertConcreteListId(listId);
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            location: true,
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

    const viewerRole = await this.access.resolveViewerRole(
      list,
      userId,
      shareSlug,
    );
    return this.buildListDetail(list, viewerRole);
  }

  /**
   * Hydrate a favorites list into a FULL SearchResponse via the results
   * assembler (see ListResultsAssembler for the executor-parity rationale).
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
    return this.resultsAssembler.run(source, dto);
  }

  /**
   * The City chip's option vocabulary (§8.16 "sliced by city" — markets
   * extermination leg 3): the CITIES PRESENT IN THE LIST, i.e. the distinct
   * municipality-level catalog places whose §2.6 ground covers a location of
   * the list's restaurants. Self-provisioning from the list's own rows (no
   * global market table); ordered by how much of the list each city holds.
   * Same access/virtual-All resolution as getListResults.
   */
  async listCitiesForList(
    userId: string,
    listId: string,
    dto: FavoriteListResultsDto,
  ): Promise<
    Array<{ placeId: string; name: string; restaurantCount: number }>
  > {
    const source = await this.resolveResultsSource(userId, listId, dto);
    const restaurantIds = Array.from(
      new Set(
        source.items
          .map((item) => item.restaurantId ?? item.connection?.restaurantId)
          .filter((id): id is string => Boolean(id)),
      ),
    );
    if (!restaurantIds.length) {
      return [];
    }
    const rows = await this.prisma.$queryRaw<
      Array<{ placeId: string; name: string; restaurantCount: bigint | number }>
    >(Prisma.sql`
      SELECT p.place_id AS "placeId",
             p.name,
             COUNT(DISTINCT rl.restaurant_id) AS "restaurantCount"
      FROM core_restaurant_locations rl
      JOIN place_geometries pg
        ON ST_Covers(
             pg.geometry,
             ST_SetSRID(
               ST_MakePoint(
                 rl.longitude::double precision,
                 rl.latitude::double precision
               ),
               4326
             )
           )
      JOIN places p
        ON p.place_id = pg.place_id
       AND p.provider_level_code = 'municipality'
      WHERE rl.restaurant_id = ANY(${restaurantIds}::uuid[])
        AND rl.latitude IS NOT NULL
        AND rl.longitude IS NOT NULL
      GROUP BY p.place_id, p.name
      ORDER BY COUNT(DISTINCT rl.restaurant_id) DESC, p.name ASC
    `);
    return rows.map((row) => ({
      placeId: row.placeId,
      name: row.name,
      restaurantCount: Number(row.restaurantCount),
    }));
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
    this.access.assertConcreteListId(listId);
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            location: true,
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

    await this.access.resolveViewerRole(list, userId, dto.shareSlug);

    return {
      labelId: listId,
      listType: list.listType,
      items: list.items,
      updatedAtMs: (list.updatedAt ?? new Date()).valueOf(),
      allowCustomSort: true,
      defaultSort: hasCustomOrder(list.items) ? 'custom' : 'best',
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
            location: true,
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

  async getSharedList(shareSlug: string) {
    const list = await this.prisma.favoriteList.findFirst({
      // RT-18: match on the slug ALONE so a dead slug (sharing turned off)
      // is distinguishable — 410 {state:'private'} vs a plain 404 for a slug
      // that never existed / was rotated away. Visibility is never consulted:
      // private = unlisted, not locked (visibility canon 2026-07-12).
      where: { shareSlug },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            location: true,
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
    await this.access.recordShareOpenEvent(list.listId, shareSlug, null);

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

    return list;
  }

  async updateList(userId: string, listId: string, dto: UpdateFavoriteListDto) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId, ownerUserId: userId },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }

    // Visibility canon (owner 2026-07-12, supersedes the RT-18 private-flip
    // cascade): visibility controls DISCOVERY, never ACCESS. Flipping private
    // only removes the list from the owner's profile — share links stay live
    // and collaborator seats survive until the owner revokes them
    // individually (disableShare / removeCollaborator).
    return this.prisma.favoriteList.update({
      where: { listId },
      data: {
        name: dto.name?.trim() ?? undefined,
        description:
          dto.description !== undefined
            ? dto.description?.trim() || null
            : undefined,
        visibility: dto.visibility ?? undefined,
        pinned: dto.pinned ?? undefined,
        useOwnPhotos: dto.useOwnPhotos ?? undefined,
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
    // Wave-2 §2: Been/Want-to-go (and the dish-side pair) are REGULAR lists —
    // default-CREATED per user, but renamable, movable, and deletable like any
    // other list. The systemKind permanence guard is deleted; systemKind survives
    // only as provisioning provenance (the once-ever (owner, systemKind) unique).

    await this.prisma.favoriteList.delete({
      where: { listId },
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
    await this.access.assertOwnerOrCollaborator(list, userId);

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

    // The existence check doubles as the restaurant resolution for the
    // locationId validation below — one query, not two.
    let connectionRestaurantId: string | null = null;
    if (connectionId) {
      const connection = await this.prisma.connection.findUnique({
        where: { connectionId },
        select: { connectionId: true, restaurantId: true },
      });
      if (!connection) {
        throw new NotFoundException('Connection not found');
      }
      connectionRestaurantId = connection.restaurantId;
    }

    // Location-centric saves (master plan §7): validate the saved location
    // belongs to the item's restaurant (directly, or via the connection).
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
      const expectedRestaurantId = restaurantId ?? connectionRestaurantId;
      if (
        !location ||
        !expectedRestaurantId ||
        location.restaurantId !== expectedRestaurantId
      ) {
        throw new BadRequestException(
          'locationId does not belong to the saved restaurant',
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
          locationId: validatedLocationId,
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

    // DUAL-WRITE (delete with old logging — master plan §22, one-milestone hard deletion)
    // §3 signals: a list add is the favorite_added act. Subject = the saved
    // restaurant (a connection item resolves to its restaurant). Geo = the
    // saved location's point, else the restaurant's primary location.
    const signalRestaurantId = restaurantId ?? connectionRestaurantId;
    if (signalRestaurantId) {
      this.signals.record({
        kind: 'favorite_added',
        userId,
        subject: { entityId: signalRestaurantId },
        geo: validatedLocationPoint
          ? this.signals.bboxFromPoint(
              validatedLocationPoint.lat,
              validatedLocationPoint.lng,
            )
          : this.signals.bboxFromRestaurantLocation({
              restaurantId: signalRestaurantId,
            }),
        meta: { locationId: validatedLocationId ?? undefined },
      });
    }

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
    await this.access.assertOwnerOrCollaborator(list, userId);

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
    await this.access.assertOwnerOrCollaborator(list, userId);
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
  }

  /**
   * Batch reorder (spec B.1.4): one PATCH for a drag-save instead of N item
   * PATCHes. orderedItemIds must be a duplicate-free SUBSET of the current
   * membership (finding 2: clients order from executor-backed rows, which
   * silently drop score-less/un-geocoded items — demanding strict set
   * equality bricked those lists). Items not listed keep their relative
   * order and are appended after the ordered ones (deterministic tail);
   * positions are rewritten 1..n in one transaction. A foreign itemId is
   * still a loud 400; an item deleted concurrently mid-write is a 409
   * (finding 3), never a 500.
   */
  async reorderItems(userId: string, listId: string, orderedItemIds: string[]) {
    const list = await this.prisma.favoriteList.findFirst({
      where: { listId },
      select: { listId: true, ownerUserId: true },
    });
    if (!list) {
      throw new NotFoundException('Favorite list not found');
    }
    await this.access.assertOwnerOrCollaborator(list, userId);

    const currentItems = await this.prisma.favoriteListItem.findMany({
      where: { listId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: { itemId: true },
    });
    const currentIds = new Set(currentItems.map((item) => item.itemId));
    const orderedSet = new Set(orderedItemIds);
    if (
      orderedSet.size !== orderedItemIds.length ||
      orderedItemIds.some((itemId) => !currentIds.has(itemId))
    ) {
      throw new BadRequestException(
        'orderedItemIds must be a duplicate-free subset of the current list membership',
      );
    }

    // Deterministic tail: unlisted items keep their current relative order
    // (position asc, createdAt tiebreak) after the client-ordered head.
    const tailIds = currentItems
      .map((item) => item.itemId)
      .filter((itemId) => !orderedSet.has(itemId));
    const finalOrder = [...orderedItemIds, ...tailIds];

    try {
      await this.prisma.$transaction(
        finalOrder.map((itemId, index) =>
          this.prisma.favoriteListItem.update({
            where: { itemId },
            data: { position: index + 1 },
          }),
        ),
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        // An item was removed between the membership read and the write —
        // the client's picture is stale, not broken. Loud, retryable.
        throw new ConflictException('list changed, retry');
      }
      throw error;
    }

    return { listId, itemCount: finalOrder.length };
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
    await this.access.resolveViewerRole(list, userId, shareSlug);
    return {
      owner: list.owner,
      collaborators: list.collaborators.map((row) => row.user),
    };
  }

  /**
   * Join as collaborator (spec B.1.3): the invite IS the share slug presented
   * with intent. Idempotent via the composite PK (P2002 = already a member =
   * success, RT-10 precedent). Dead slug (sharing off) = 410 {state:'private'};
   * wrong/rotated slug = 404 (fail-closed); a blocked pair with the owner
   * gets the same 410 {state:'private'} (§8.6 — the block never leaks).
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
    await this.access.assertNotBlockedPair(userId, list.ownerUserId);
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

    // Visibility canon: sharing mints/returns the link CAPABILITY and never
    // mutates visibility (discovery) — a private (unlisted) list stays
    // shareable without being flipped onto the profile.
    const updated = await this.prisma.favoriteList.update({
      where: { listId },
      data: {
        shareSlug,
        shareEnabled: true,
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

  private async buildListDetail(
    list: FavoriteListWithDetailItems,
    viewerRole: FavoriteListViewerRole,
  ) {
    // The detail is owner/collaborator/slug-granted (never the public
    // profile), so the full 'owner' projection — including the slug the
    // grant already implies — is correct here.
    const summary = this.mapper.buildListSummary(
      list,
      await this.mapper.loadPreviewScoreMaps([list]),
      'owner',
    );
    // defaultSort (spec B.1.2 / registry §8.14): the saver's ranking is the
    // default whenever a custom order exists; otherwise crave-score 'best'.
    const defaultSort: FavoriteListSort = hasCustomOrder(list.items)
      ? 'custom'
      : 'best';
    if (list.listType === FavoriteListType.restaurant) {
      const restaurantItems = list.items.filter((item) => item.restaurant);
      const results = await this.mapper.mapRestaurantResults(restaurantItems);
      return { list: summary, viewerRole, defaultSort, restaurants: results };
    }
    const connectionItems = list.items.filter((item) => item.connection);
    const results = await this.mapper.mapFoodResults(connectionItems);
    return { list: summary, viewerRole, defaultSort, dishes: results };
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
