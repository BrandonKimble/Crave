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

/** Hero-photo policy (product/images.md): most recent LIVE photo above the
 *  quality floor; photos with no focus score (free-plan nulls) pass the
 *  floor — recency is the tiebreak until tap-rate v2. */
const FOCUS_FLOOR = 0.15;

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

  /** Batched hero lookup for result cards: one query per entity kind.
   *  Returns maps keyed by restaurantId / connectionId. */
  async heroPhotos(params: {
    restaurantIds?: string[];
    connectionIds?: string[];
  }): Promise<{
    byRestaurant: Map<string, PhotoStripItemDto>;
    byConnection: Map<string, PhotoStripItemDto>;
    countsByRestaurant: Map<string, number>;
    countsByConnection: Map<string, number>;
  }> {
    const byRestaurant = new Map<string, PhotoStripItemDto>();
    const byConnection = new Map<string, PhotoStripItemDto>();
    const countsByRestaurant = new Map<string, number>();
    const countsByConnection = new Map<string, number>();

    if (params.connectionIds?.length) {
      const rows = await this.prisma.photo.findMany({
        where: {
          connectionId: { in: params.connectionIds },
          status: PhotoStatus.live,
        },
        orderBy: { uploadedAt: 'desc' },
        select: PHOTO_STRIP_SELECT,
      });
      for (const row of rows) {
        const key = row.connectionId!;
        countsByConnection.set(key, (countsByConnection.get(key) ?? 0) + 1);
        if (!byConnection.has(key) && this.passesFloor(row.focusScore)) {
          byConnection.set(key, this.toStripItem(row));
        }
      }
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
      for (const row of rows) {
        const key = row.restaurantId;
        countsByRestaurant.set(key, (countsByRestaurant.get(key) ?? 0) + 1);
        if (!byRestaurant.has(key) && this.passesFloor(row.focusScore)) {
          byRestaurant.set(key, this.toStripItem(row));
        }
      }
    }
    return {
      byRestaurant,
      byConnection,
      countsByRestaurant,
      countsByConnection,
    };
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
