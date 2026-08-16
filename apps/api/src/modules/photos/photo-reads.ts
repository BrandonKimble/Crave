import { Injectable } from '@nestjs/common';
import { UserBlockService } from '../identity/user-block.service';
import {
  PhotoReadService,
  type CardStripDto,
  type ItemLogGroupDto,
  type PlaceGalleryDto,
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
 *
 * THE EXCLUSION IS PUSHED DOWN, NOT APPLIED UP (red team 2026-08-02). The
 * first version of this seam filtered the RESULT in memory. That was wrong in
 * two ways at once: strips are capped at STRIP_SIZE by a ROW_NUMBER window
 * and the gallery is a LIMIT/OFFSET page, so removing rows afterwards returned
 * SHORT pages with no way to backfill; and `totalCount` — which came from a
 * real COUNT over every photo — got replaced by the length of the truncated
 * page, so a 200-photo restaurant reported 60 and a card strip could never
 * report more than 10. An exclusion applied after LIMIT is not an exclusion,
 * it is a truncation. The blocked set now travels into the WHERE clause of
 * both the page and the count.
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
    refs: Array<{ placeId: string; connectionId?: string }>,
  ): Promise<{ strips: CardStripDto[] }> {
    return this.reads.cardStrips(refs, {
      excludeUserIds: await this.hiddenAuthors(),
    });
  }

  /**
   * The raw strip read. Wrapped because the list-tile gallery consumes it
   * directly — a second door into unfiltered photos that the first version of
   * this seam left open while claiming forgetting was unrepresentable.
   */
  async stripPhotos(
    params: Omit<
      Parameters<PhotoReadService['stripPhotos']>[0],
      'excludeUserIds'
    >,
  ): ReturnType<PhotoReadService['stripPhotos']> {
    return this.reads.stripPhotos({
      ...params,
      excludeUserIds: await this.hiddenAuthors(),
    });
  }

  async placeGallery(
    placeId: string,
    params: { limit?: number; offset?: number } = {},
  ): Promise<PlaceGalleryDto> {
    return this.reads.placeGallery(placeId, {
      ...params,
      excludeUserIds: await this.hiddenAuthors(),
    });
  }

  /**
   * NOT author-filtered, deliberately. A food log is scoped to ONE person, so
   * every photo in it has the same author — an author exclusion is either a
   * no-op or it empties the whole log. The meaningful gate is the blocked-PAIR
   * check the controller already performs, which returns an empty log so the
   * profile can render "unavailable".
   */
  async userItemLog(
    ...args: Parameters<PhotoReadService['userItemLog']>
  ): Promise<ItemLogGroupDto[]> {
    return this.reads.userItemLog(...args);
  }

  /**
   * Both directions. A block hides the pair from each other, so this is the
   * viewer's blocked-peer set, not just the people the viewer blocked.
   * Empty for an anonymous viewer — there is no relationship to filter on.
   */
  private async hiddenAuthors(): Promise<readonly string[]> {
    if (!this.viewerUserId) return EMPTY;
    return [...(await this.blocks.blockedPeerIds(this.viewerUserId))];
  }
}

const EMPTY: readonly string[] = [];
