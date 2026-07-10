import { Injectable } from '@nestjs/common';
import { PhotoStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CloudinaryService, type PhotoUrls } from './cloudinary.service';

/** The card/strip/gallery-facing photo shape: ready-made URLs + credit. */
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

/** Strip-ordering policy (product/images.md, owner 2026-07-10: cards carry
 *  STRIPS, never single slots): above-quality-floor photos lead (no blurry
 *  photo fronts a strip), then recency; null focus (free-plan) passes the
 *  floor. Position #1 is the old "hero". */
const FOCUS_FLOOR = 0.15;
const STRIP_SIZE = 10;

/**
 * READ paths (plans/images-ideal-shape.md step 3). Only LIVE photos are
 * ever returned from these surfaces; visibility rules for non-live rows
 * live in PhotosService.getPhoto. All URL building rides the ONE
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
   *  keyed by restaurantId / connectionId plus total counts. */
  async stripPhotos(params: {
    restaurantIds?: string[];
    connectionIds?: string[];
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

    const collect = (
      rows: PhotoStripRow[],
      keyOf: (row: PhotoStripRow) => string,
      strips: Map<string, PhotoStripItemDto[]>,
      counts: Map<string, number>,
    ) => {
      const grouped = new Map<string, PhotoStripRow[]>();
      for (const row of rows) {
        const key = keyOf(row);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        const bucket = grouped.get(key) ?? [];
        bucket.push(row);
        grouped.set(key, bucket);
      }
      for (const [key, bucket] of grouped) {
        strips.set(
          key,
          this.orderStrip(bucket).map((r) => this.toStripItem(r)),
        );
      }
    };

    if (params.connectionIds?.length) {
      const rows = await this.prisma.photo.findMany({
        where: {
          connectionId: { in: params.connectionIds },
          status: PhotoStatus.live,
        },
        orderBy: { uploadedAt: 'desc' },
        select: PHOTO_STRIP_SELECT,
      });
      collect(
        rows,
        (row) => row.connectionId!,
        byConnection,
        countsByConnection,
      );
    }
    if (params.restaurantIds?.length) {
      const rows = await this.prisma.photo.findMany({
        where: {
          restaurantId: { in: params.restaurantIds },
          status: PhotoStatus.live,
        },
        orderBy: { uploadedAt: 'desc' },
        select: PHOTO_STRIP_SELECT,
      });
      collect(
        rows,
        (row) => row.restaurantId,
        byRestaurant,
        countsByRestaurant,
      );
    }
    return {
      byRestaurant,
      byConnection,
      countsByRestaurant,
      countsByConnection,
    };
  }

  /** Quality-floor photos lead (within each group recency descending —
   *  rows arrive newest-first), then below-floor; capped at STRIP_SIZE. */
  private orderStrip(rows: PhotoStripRow[]): PhotoStripRow[] {
    const above = rows.filter((row) => this.passesFloor(row.focusScore));
    const below = rows.filter((row) => !this.passesFloor(row.focusScore));
    return [...above, ...below].slice(0, STRIP_SIZE);
  }

  /** The restaurant gallery (selector-row shaped: All + per-dish). */
  async restaurantGallery(
    restaurantId: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<RestaurantGalleryDto> {
    const limit = Math.min(params.limit ?? 60, 120);
    const offset = params.offset ?? 0;
    const [all, totalCount, dishRows] = await Promise.all([
      this.prisma.photo.findMany({
        where: { restaurantId, status: PhotoStatus.live },
        orderBy: { uploadedAt: 'desc' },
        skip: offset,
        take: limit,
        select: PHOTO_STRIP_SELECT,
      }),
      this.prisma.photo.count({
        where: { restaurantId, status: PhotoStatus.live },
      }),
      this.prisma.photo.findMany({
        where: {
          restaurantId,
          status: PhotoStatus.live,
          connectionId: { not: null },
        },
        orderBy: { uploadedAt: 'desc' },
        select: PHOTO_STRIP_SELECT,
      }),
    ]);
    const byDishMap = new Map<string, PhotoStripItemDto[]>();
    for (const row of dishRows) {
      const key = row.connectionId!;
      const bucket = byDishMap.get(key) ?? [];
      if (bucket.length < 20) bucket.push(this.toStripItem(row));
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

  /** The profile food log: grouped by restaurant, newest activity first.
   *  Owner sees everything except removed; visitors see live only. */
  async userFoodLog(
    userId: string,
    viewerUserId: string | undefined,
    params: { limit?: number } = {},
  ): Promise<FoodLogGroupDto[]> {
    const isOwner = userId === viewerUserId;
    const rows = await this.prisma.photo.findMany({
      where: {
        userId,
        status: isOwner
          ? { in: [PhotoStatus.live, PhotoStatus.pending, PhotoStatus.hidden] }
          : PhotoStatus.live,
      },
      orderBy: { uploadedAt: 'desc' },
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

  private passesFloor(focusScore: number | null): boolean {
    return focusScore === null || focusScore >= FOCUS_FLOOR;
  }

  private toStripItem(row: PhotoStripRow): PhotoStripItemDto {
    return {
      photoId: row.photoId,
      userId: row.userId,
      connectionId: row.connectionId,
      caption: row.caption,
      takenAt: row.takenAt,
      uploadedAt: row.uploadedAt,
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
  uploadedAt: true,
  focusScore: true,
} as const;

interface PhotoStripRow {
  photoId: string;
  userId: string;
  restaurantId: string;
  connectionId: string | null;
  publicId: string;
  caption: string | null;
  takenAt: Date | null;
  uploadedAt: Date;
  focusScore: number | null;
}
