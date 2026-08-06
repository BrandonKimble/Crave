import { Injectable } from '@nestjs/common';
import { PhotoStatus, PhotoVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService, type PhotoUrls } from './cloudinary.service';

/** The card/strip/gallery-facing photo shape: ready-made URLs + credit.
 *  `uploadedAt` is the client-facing field name (unchanged contract); it is
 *  sourced from the Photo row's `ticketedAt` (stamped at upload-ticket
 *  mint — see schema.prisma Photo.ticketedAt / F623). */
export interface PhotoStripItemDto {
  photoId: string;
  userId: string;
  connectionId: string | null;
  caption: string | null;
  takenAt: Date | null;
  uploadedAt: Date;
  urls: PhotoUrls;
}

export interface RestaurantGalleryDto {
  restaurantId: string;
  totalCount: number;
  /** "All photos" — newest first, paged. */
  all: PhotoStripItemDto[];
  /** Per-dish sections (only dishes that HAVE photos). The client orders
   *  these by the ranked dish list it already holds from the restaurant
   *  profile — ranking logic lives in ONE place (the profile), not here. */
  byDish: Array<{ connectionId: string; photos: PhotoStripItemDto[] }>;
}

export interface FoodLogGroupDto {
  restaurantId: string;
  restaurantName: string;
  photos: PhotoStripItemDto[];
}

/** One card's strip in the batch card-strip response. `key` echoes the
 *  request ref's identity: connectionId when the ref carried one (dish
 *  card), else restaurantId (restaurant card). */
export interface CardStripDto {
  key: string;
  totalCount: number;
  photos: PhotoStripItemDto[];
}

/** Strip-ordering policy (product/images.md, owner 2026-07-10: cards carry
 *  STRIPS, never single slots): above-quality-floor photos lead (no blurry
 *  photo fronts a strip), then recency; null focus (free-plan) passes the
 *  floor. Position #1 is the old "hero". */
const FOCUS_FLOOR = 0.15;
const STRIP_SIZE = 10;

/**
 * READ paths (plans/images-ideal-shape.md step 3). Only LIVE + PUBLIC
 * photos are ever returned from these surfaces (private photos surface
 * only to their uploader — food log below, single-photo read in
 * PhotosService.getPhoto). All URL building rides the ONE
 * CloudinaryService builder.
 */
@Injectable()
export class PhotoReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  /** Batched STRIP lookup for result cards (cards always carry a
   *  horizontal strip — never a single slot): the first STRIP_SIZE photos
   *  per entity, quality-floor photos leading, then recency. Returns maps
   *  keyed by restaurantId / connectionId plus total counts.
   *  `userId` narrows the strips to ONE uploader's photos (the "Use your
   *  photos" tile-gallery law) — same ordering policy, restricted pool. */
  async stripPhotos(params: {
    /** Authors the viewer must not see. Applied IN the query so the page and
     *  the count agree; see windowedStrip. */
    excludeUserIds?: readonly string[];
    restaurantIds?: string[];
    connectionIds?: string[];
    userId?: string;
  }): Promise<{
    byRestaurant: Map<string, PhotoStripItemDto[]>;
    byConnection: Map<string, PhotoStripItemDto[]>;
    countsByRestaurant: Map<string, number>;
    countsByConnection: Map<string, number>;
  }> {
    const byRestaurant = new Map<string, PhotoStripItemDto[]>();
    const byConnection = new Map<string, PhotoStripItemDto[]>();
    const countsByRestaurant = new Map<string, number>();
    const countsByConnection = new Map<string, number>();

    if (params.connectionIds?.length) {
      const [rows, counts] = await Promise.all([
        this.windowedStrip('connection_id', params.connectionIds, {
          userId: params.userId,
          excludeUserIds: params.excludeUserIds,
        }),
        this.prisma.photo.groupBy({
          by: ['connectionId'],
          where: {
            connectionId: { in: params.connectionIds },
            status: PhotoStatus.live,
            visibility: PhotoVisibility.public,
            ...(params.userId ? { userId: params.userId } : {}),
            // The count must exclude what the page excludes, or "N photos"
            // disagrees with what renders.
            ...(params.excludeUserIds?.length
              ? { userId: { notIn: [...params.excludeUserIds] } }
              : {}),
          },
          _count: { photoId: true },
        }),
      ]);
      for (const row of rows) {
        const key = row.connectionId!;
        const bucket = byConnection.get(key) ?? [];
        bucket.push(this.toStripItem(row));
        byConnection.set(key, bucket);
      }
      for (const count of counts) {
        countsByConnection.set(count.connectionId!, count._count.photoId);
      }
    }
    if (params.restaurantIds?.length) {
      const [rows, counts] = await Promise.all([
        this.windowedStrip('restaurant_id', params.restaurantIds, {
          userId: params.userId,
          excludeUserIds: params.excludeUserIds,
        }),
        this.prisma.photo.groupBy({
          by: ['restaurantId'],
          where: {
            restaurantId: { in: params.restaurantIds },
            status: PhotoStatus.live,
            visibility: PhotoVisibility.public,
            ...(params.userId ? { userId: params.userId } : {}),
            ...(params.excludeUserIds?.length
              ? { userId: { notIn: [...params.excludeUserIds] } }
              : {}),
          },
          _count: { photoId: true },
        }),
      ]);
      for (const row of rows) {
        const key = row.restaurantId;
        const bucket = byRestaurant.get(key) ?? [];
        bucket.push(this.toStripItem(row));
        byRestaurant.set(key, bucket);
      }
      for (const count of counts) {
        countsByRestaurant.set(count.restaurantId, count._count.photoId);
      }
    }
    return {
      byRestaurant,
      byConnection,
      countsByRestaurant,
      countsByConnection,
    };
  }

  /** The batch card-strip endpoint's shape (POST /photos/strips): one call
   *  per visible screen of cards, one strip per ref. A ref WITH connectionId
   *  is a dish card (dish-linked photos only); without, a restaurant card
   *  (all the restaurant's photos). Rides the same windowed strip query +
   *  ordering policy as everything else. */
  async cardStrips(
    refs: Array<{ restaurantId: string; connectionId?: string }>,
    options: { excludeUserIds?: readonly string[] } = {},
  ): Promise<{ strips: CardStripDto[] }> {
    const connectionIds = [
      ...new Set(
        refs.flatMap((ref) => (ref.connectionId ? [ref.connectionId] : [])),
      ),
    ];
    const restaurantIds = [
      ...new Set(
        refs.flatMap((ref) => (ref.connectionId ? [] : [ref.restaurantId])),
      ),
    ];
    const {
      byRestaurant,
      byConnection,
      countsByRestaurant,
      countsByConnection,
    } = await this.stripPhotos({
      restaurantIds,
      connectionIds,
      excludeUserIds: options.excludeUserIds,
    });
    return {
      strips: refs.map((ref) => {
        const key = ref.connectionId ?? ref.restaurantId;
        const photos = ref.connectionId
          ? (byConnection.get(ref.connectionId) ?? [])
          : (byRestaurant.get(ref.restaurantId) ?? []);
        const totalCount = ref.connectionId
          ? (countsByConnection.get(ref.connectionId) ?? 0)
          : (countsByRestaurant.get(ref.restaurantId) ?? 0);
        return { key, totalCount, photos };
      }),
    };
  }

  /** ROW_NUMBER window: at most STRIP_SIZE rows PER KEY leave the database
   *  (the hottest read path in the app must not scan a 5k-photo restaurant
   *  per card render). Ordering matches the strip policy: above-quality-
   *  floor first, then recency. */
  private async windowedStrip(
    keyColumn: 'restaurant_id' | 'connection_id',
    ids: string[],
    options: {
      perKey?: number;
      userId?: string;
      excludeUserIds?: readonly string[];
    } = {},
  ): Promise<PhotoStripRow[]> {
    const perKey = options.perKey ?? STRIP_SIZE;
    const column = Prisma.raw(keyColumn);
    const uploaderFilter = options.userId
      ? Prisma.sql`AND user_id = ${options.userId}::uuid`
      : Prisma.empty;
    // BLOCKED AUTHORS ARE EXCLUDED INSIDE THE WINDOW, before ROW_NUMBER caps
    // the strip (red team 2026-08-02). Filtering the RESULT instead returned
    // short strips — 3 of 10 when a prolific author was blocked — because the
    // window had already discarded the next eligible rows, and it made the
    // count uncomputable. An exclusion applied after LIMIT is not an
    // exclusion; it is a truncation.
    const blockFilter = options.excludeUserIds?.length
      ? Prisma.sql`AND user_id <> ALL(${[...options.excludeUserIds]}::uuid[])`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<RawStripRow[]>`
      SELECT photo_id, user_id, restaurant_id, connection_id, public_id,
             caption, taken_at, ticketed_at, focus_score
      FROM (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY ${column}
          ORDER BY (focus_score IS NULL OR focus_score >= ${FOCUS_FLOOR}) DESC,
                   ticketed_at DESC,
                   photo_id DESC
        ) AS rn
        FROM photos
        WHERE ${column} = ANY(${ids}::uuid[])
          AND status = 'live' AND visibility = 'public'
          ${uploaderFilter}
          ${blockFilter}
      ) windowed
      WHERE rn <= ${perKey}
      ORDER BY rn ASC
    `;
    return rows.map((row) => this.fromRaw(row));
  }

  private fromRaw(row: RawStripRow): PhotoStripRow {
    return {
      photoId: row.photo_id,
      userId: row.user_id,
      restaurantId: row.restaurant_id,
      connectionId: row.connection_id,
      publicId: row.public_id,
      caption: row.caption,
      takenAt: row.taken_at,
      ticketedAt: row.ticketed_at,
      focusScore: row.focus_score,
    };
  }

  /** The restaurant gallery (selector-row shaped: All + per-dish). */
  async restaurantGallery(
    restaurantId: string,
    params: {
      limit?: number;
      offset?: number;
      excludeUserIds?: readonly string[];
    } = {},
  ): Promise<RestaurantGalleryDto> {
    const limit = Math.min(params.limit ?? 60, 120);
    const offset = params.offset ?? 0;
    // The exclusion goes in the WHERE of both the page and the count, so
    // pagination stays full and "N photos" matches what renders. Filtering
    // the result instead produced short pages and a totalCount that was
    // really the page length (red team 2026-08-02).
    const blocked = params.excludeUserIds?.length
      ? { userId: { notIn: [...params.excludeUserIds] } }
      : {};
    const visibleWhere = {
      restaurantId,
      status: PhotoStatus.live,
      visibility: PhotoVisibility.public,
      ...blocked,
    };
    const [all, totalCount, dishRows] = await Promise.all([
      this.prisma.photo.findMany({
        where: visibleWhere,
        orderBy: [{ ticketedAt: 'desc' }, { photoId: 'desc' }],
        skip: offset,
        take: limit,
        select: PHOTO_STRIP_SELECT,
      }),
      this.prisma.photo.count({ where: visibleWhere }),
      this.dishSlices(restaurantId, params.excludeUserIds),
    ]);
    const byDishMap = new Map<string, PhotoStripItemDto[]>();
    for (const row of dishRows) {
      const key = row.connectionId!;
      const bucket = byDishMap.get(key) ?? [];
      bucket.push(this.toStripItem(row));
      byDishMap.set(key, bucket);
    }
    return {
      restaurantId,
      totalCount,
      all: all.map((row) => this.toStripItem(row)),
      byDish: [...byDishMap.entries()].map(([connectionId, photos]) => ({
        connectionId,
        photos,
      })),
    };
  }

  /** Windowed per-dish slices for the gallery selector (≤20/dish leave the
   *  DB — never a full scan of a photo-heavy restaurant). */
  private async dishSlices(
    restaurantId: string,
    excludeUserIds?: readonly string[],
    perDish = 20,
  ): Promise<PhotoStripRow[]> {
    const blockFilter = excludeUserIds?.length
      ? Prisma.sql`AND user_id <> ALL(${[...excludeUserIds]}::uuid[])`
      : Prisma.empty;
    const rows = await this.prisma.$queryRaw<RawStripRow[]>`
      SELECT photo_id, user_id, restaurant_id, connection_id, public_id,
             caption, taken_at, ticketed_at, focus_score
      FROM (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY connection_id
          ORDER BY (focus_score IS NULL OR focus_score >= ${FOCUS_FLOOR}) DESC,
                   ticketed_at DESC,
                   photo_id DESC
        ) AS rn
        FROM photos
        WHERE restaurant_id = ${restaurantId}::uuid
          ${blockFilter}
          AND status = 'live' AND visibility = 'public'
          AND connection_id IS NOT NULL
      ) windowed
      WHERE rn <= ${perDish}
      ORDER BY rn ASC
    `;
    return rows.map((row) => this.fromRaw(row));
  }

  /** The profile food log: grouped by restaurant, newest activity first.
   *  Owner sees everything except removed (including their private photos);
   *  visitors see live + public only. */
  async userFoodLog(
    userId: string,
    viewerUserId: string | undefined,
    params: { limit?: number } = {},
  ): Promise<FoodLogGroupDto[]> {
    const isOwner = userId === viewerUserId;
    const rows = await this.prisma.photo.findMany({
      where: isOwner
        ? {
            userId,
            status: {
              in: [PhotoStatus.live, PhotoStatus.pending, PhotoStatus.hidden],
            },
          }
        : {
            userId,
            status: PhotoStatus.live,
            visibility: PhotoVisibility.public,
          },
      orderBy: [{ ticketedAt: 'desc' }, { photoId: 'desc' }],
      take: Math.min(params.limit ?? 200, 500),
      select: {
        ...PHOTO_STRIP_SELECT,
        restaurant: { select: { name: true } },
      },
    });
    const groups = new Map<string, FoodLogGroupDto>();
    for (const row of rows) {
      const group = groups.get(row.restaurantId) ?? {
        restaurantId: row.restaurantId,
        restaurantName:
          (row as { restaurant?: { name: string } }).restaurant?.name ?? '',
        photos: [],
      };
      group.photos.push(this.toStripItem(row));
      groups.set(row.restaurantId, group);
    }
    return [...groups.values()];
  }

  private toStripItem(row: PhotoStripRow): PhotoStripItemDto {
    return {
      photoId: row.photoId,
      userId: row.userId,
      connectionId: row.connectionId,
      caption: row.caption,
      takenAt: row.takenAt,
      // ticketedAt -> the client-facing `uploadedAt` field (contract
      // unchanged; see PhotoStripItemDto doc comment / F623).
      uploadedAt: row.ticketedAt,
      urls: this.cloudinary.buildUrls(row.publicId),
    };
  }
}

const PHOTO_STRIP_SELECT = {
  photoId: true,
  userId: true,
  restaurantId: true,
  connectionId: true,
  publicId: true,
  caption: true,
  takenAt: true,
  ticketedAt: true,
  focusScore: true,
} as const;

interface RawStripRow {
  photo_id: string;
  user_id: string;
  restaurant_id: string;
  connection_id: string | null;
  public_id: string;
  caption: string | null;
  taken_at: Date | null;
  ticketed_at: Date;
  focus_score: number | null;
}

interface PhotoStripRow {
  photoId: string;
  userId: string;
  restaurantId: string;
  connectionId: string | null;
  publicId: string;
  caption: string | null;
  takenAt: Date | null;
  ticketedAt: Date;
  focusScore: number | null;
}
