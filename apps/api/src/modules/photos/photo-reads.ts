import { Injectable } from '@nestjs/common';
import { UserBlockService } from '../identity/user-block.service';
import {
  PhotoReadService,
  type CardStripDto,
  type FoodLogGroupDto,
  type PhotoStripItemDto,
  type RestaurantGalleryDto,
} from './photo-read.service';

/**
 * VIEWER-SCOPED PHOTO READS — the abstraction named after the INVARIANT.
 *
 * WHY THIS EXISTS (derived from scratch, 2026-08-02).
 *
 * Blocking was enforced at CALL SITES. Some controllers remembered
 * (`isBlockedPair` before the food log), and `PhotoReadService` itself
 * contained zero block logic — `cardStrips` did not even take a viewer, so it
 * was structurally INCAPABLE of enforcing the rule while still returning each
 * photo's `userId`. "Did we remember the block check?" was answerable only by
 * reading every call site and trusting the reader, and every new read endpoint
 * was a fresh chance to forget.
 *
 * A repository named after storage operations (`findById`, `findMany`) cannot
 * fix that, because the invariant is not about storage. The right seam is
 * named after the RULE: you cannot obtain a photo read without naming a
 * viewer, and the viewer's blocked peers are removed inside the read. Forgetting
 * becomes unrepresentable rather than reviewable.
 *
 * This deliberately WRAPS PhotoReadService rather than replacing it. The
 * queries, ordering policy and DTO shapes are already correct and hard-won;
 * what was missing was a boundary that makes the viewer mandatory. Wrapping
 * keeps one authority for how photos are fetched and adds one authority for
 * who may see them.
 */
@Injectable()
export class PhotoReads {
  constructor(
    private readonly reads: PhotoReadService,
    private readonly blocks: UserBlockService,
  ) {}

  /**
   * The ONLY way to obtain photo reads. There is no viewer-less overload on
   * purpose: an anonymous surface must pass an explicit `null` and thereby
   * state that it has no viewer to filter against.
   */
  forViewer(viewerUserId: string | null): ViewerScopedPhotoReads {
    return new ViewerScopedPhotoReads(this.reads, this.blocks, viewerUserId);
  }
}

export class ViewerScopedPhotoReads {
  constructor(
    private readonly reads: PhotoReadService,
    private readonly blocks: UserBlockService,
    private readonly viewerUserId: string | null,
  ) {}

  async cardStrips(
    refs: Array<{ restaurantId: string; connectionId?: string }>,
  ): Promise<{ strips: CardStripDto[] }> {
    const hidden = await this.hiddenAuthors();
    const { strips } = await this.reads.cardStrips(refs);
    return {
      strips: strips.map((strip) => ({
        ...strip,
        photos: this.visible(strip.photos, hidden),
        // totalCount must reflect what the viewer can SEE. Reporting the
        // unfiltered count leaks the existence of hidden photos and makes
        // "N photos" disagree with the N rendered.
        totalCount: this.visible(strip.photos, hidden).length,
      })),
    };
  }

  async restaurantGallery(
    ...args: Parameters<PhotoReadService['restaurantGallery']>
  ): Promise<RestaurantGalleryDto> {
    const hidden = await this.hiddenAuthors();
    const gallery = await this.reads.restaurantGallery(...args);
    const all = this.visible(gallery.all, hidden);
    return {
      ...gallery,
      all,
      totalCount: all.length,
      byDish: gallery.byDish.map((section) => ({
        ...section,
        photos: this.visible(section.photos, hidden),
      })),
    };
  }

  async userFoodLog(
    ...args: Parameters<PhotoReadService['userFoodLog']>
  ): Promise<FoodLogGroupDto[]> {
    const hidden = await this.hiddenAuthors();
    const groups = await this.reads.userFoodLog(...args);
    return groups
      .map((group) => ({
        ...group,
        photos: this.visible(group.photos, hidden),
      }))
      .filter((group) => group.photos.length > 0);
  }

  /**
   * Both directions. A block hides the pair from each other, so this is the
   * viewer's blocked-peer set, not just the people the viewer blocked.
   * Empty for an anonymous viewer — there is no relationship to filter on.
   */
  private async hiddenAuthors(): Promise<Set<string>> {
    if (!this.viewerUserId) return new Set();
    return this.blocks.blockedPeerIds(this.viewerUserId);
  }

  private visible(
    photos: PhotoStripItemDto[],
    hidden: Set<string>,
  ): PhotoStripItemDto[] {
    if (hidden.size === 0) return photos;
    return photos.filter((photo) => !hidden.has(photo.userId));
  }
}
