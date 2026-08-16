import { Injectable } from '@nestjs/common';
import { CraveScoreSubjectType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { PhotoStripItemDto } from '../photos/photo-read.service';
import { UserListMapper, hasCustomOrder } from './user-list.mappers';
import { PhotoReads } from '../photos/photo-reads';

/** One 2x2 home-tile slot (wave2 §7, plans/media-images-ledger.md §3):
 *  slots fill TL(0)→TR(1)→BL(2)→BR(3). Default lists are sparse-at-the-end
 *  (a photo-less restaurant yields its slot). "Use your photos" lists can
 *  be sparse ANYWHERE — a top-4 restaurant the owner hasn't photographed
 *  keeps its slot EMPTY (deliberate incompleteness: the placeholder shows
 *  what's left to shoot). The client must place tiles by `slot`, never by
 *  array index (BookmarksPanel's bySlot map already does). */
export interface UserListTileImageDto {
  slot: 0 | 1 | 2 | 3;
  placeId: string;
  photoId: string;
  thumbUrl: string;
}

/** What the gallery needs to know about each list — the caller (the lists
 *  read path) already holds these rows; no re-query. */
export interface TileGalleryListRef {
  listId: string;
  ownerUserId: string;
  useOwnPhotos: boolean;
}

const TILE_SLOTS = 4;

/**
 * The 2x2 list-tile gallery projection (wave2 charter §7): per list, the
 * TOP PHOTO of each of the list's top-4 restaurants — custom rank (item
 * position) when the list is custom-ordered, else crave rank (public
 * display score). Dish-side items resolve to their connection's
 * restaurant; a restaurant reached via several dishes fills ONE slot.
 * Photo choice rides the ONE shipped strip policy (PhotoReadService:
 * quality-floor first, then recency; eng_score after the ranking
 * equation is ratified — this call site does not change).
 *
 * "Use your photos" (wave2 §2, audit ND #2): when the list's
 * `useOwnPhotos` flag is on, the SAME top-4 restaurants rank the slots,
 * but each slot draws only from photos uploaded by the LIST OWNER
 * (stripPhotos userId filter — same ordering policy, restricted pool),
 * and a restaurant without an own photo leaves its slot EMPTY instead of
 * yielding it — the sparse slot is the product (placeholder = "you
 * haven't shot this one yet").
 */
@Injectable()
export class UserListTileGalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: UserListMapper,
    private readonly photoReads: PhotoReads,
  ) {}

  /**
   * VIEWER-SCOPED (red team 2026-08-02). This read went straight to
   * PhotoReadService, so a blocked author's photo could front a tile in the
   * viewer's own list — the photo seam had closed that door only for
   * PhotosController. A second door is not a boundary.
   */
  async loadTileImages(
    lists: TileGalleryListRef[],
    viewerUserId: string | null,
  ): Promise<Map<string, UserListTileImageDto[]>> {
    const scoped = this.photoReads.forViewer(viewerUserId);
    const result = new Map<string, UserListTileImageDto[]>();
    if (!lists.length) {
      return result;
    }
    const listById = new Map(lists.map((list) => [list.listId, list]));

    const items = await this.prisma.userListItem.findMany({
      where: { listId: { in: lists.map((list) => list.listId) } },
      select: {
        listId: true,
        itemId: true,
        position: true,
        createdAt: true,
        placeId: true,
        connection: { select: { placeId: true } },
      },
    });

    type ItemRow = (typeof items)[number];
    const byList = new Map<string, ItemRow[]>();
    const placeIds = new Set<string>();
    /** Restaurants needing an OWN-photo strip, per owner. */
    const ownPoolByOwner = new Map<string, Set<string>>();
    for (const item of items) {
      const bucket = byList.get(item.listId) ?? [];
      bucket.push(item);
      byList.set(item.listId, bucket);
      const placeId = item.placeId ?? item.connection?.placeId;
      if (placeId) {
        placeIds.add(placeId);
        const list = listById.get(item.listId);
        if (list?.useOwnPhotos) {
          const pool = ownPoolByOwner.get(list.ownerUserId) ?? new Set();
          pool.add(placeId);
          ownPoolByOwner.set(list.ownerUserId, pool);
        }
      }
    }
    if (!placeIds.size) {
      return result;
    }

    const ownStripsPromise = Promise.all(
      [...ownPoolByOwner.entries()].map(([userId, pool]) =>
        scoped
          .stripPhotos({ placeIds: [...pool], userId })
          .then((own) => [userId, own.byPlace] as const),
      ),
    );
    const [scores, strips] = await Promise.all([
      this.mapper.loadPublicScores(CraveScoreSubjectType.restaurant, [
        ...placeIds,
      ]),
      scoped.stripPhotos({ placeIds: [...placeIds] }),
    ]);
    const ownByOwner = new Map<string, Map<string, PhotoStripItemDto[]>>(
      await ownStripsPromise,
    );

    for (const [listId, listItems] of byList) {
      const list = listById.get(listId);
      const ownOnly = Boolean(list?.useOwnPhotos);
      const photoPool = ownOnly
        ? (ownByOwner.get(list!.ownerUserId) ??
          new Map<string, PhotoStripItemDto[]>())
        : strips.byPlace;

      const custom = hasCustomOrder(listItems);
      const ordered = [...listItems].sort((a, b) => {
        if (custom) {
          return (
            a.position - b.position ||
            a.createdAt.valueOf() - b.createdAt.valueOf()
          );
        }
        const scoreOf = (item: ItemRow): number => {
          const placeId = item.placeId ?? item.connection?.placeId;
          const score = placeId ? scores.get(placeId) : undefined;
          return score ? Number(score.displayScore) : -1;
        };
        return scoreOf(b) - scoreOf(a);
      });

      const tiles: UserListTileImageDto[] = [];
      const seenPlaces = new Set<string>();
      let slot = 0;
      for (const item of ordered) {
        if (slot >= TILE_SLOTS) {
          break;
        }
        const placeId = item.placeId ?? item.connection?.placeId;
        if (!placeId || seenPlaces.has(placeId)) {
          continue;
        }
        seenPlaces.add(placeId);
        const topPhoto = photoPool.get(placeId)?.[0];
        if (!topPhoto) {
          if (ownOnly) {
            // Own-photos law: the un-shot restaurant KEEPS its slot, empty —
            // the client renders a placeholder there (sparse mid-grid).
            slot += 1;
          }
          continue;
        }
        tiles.push({
          slot: slot as UserListTileImageDto['slot'],
          placeId,
          photoId: topPhoto.photoId,
          thumbUrl: topPhoto.urls.thumb,
        });
        slot += 1;
      }
      if (tiles.length) {
        result.set(listId, tiles);
      }
    }
    return result;
  }
}
