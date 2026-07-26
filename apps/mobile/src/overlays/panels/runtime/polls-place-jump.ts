import type { GeoBbox, PlaceLike } from '@crave-search/shared';

import { requestMapCameraFlyToBbox } from '../../../store/map-camera-command-store';

/**
 * THE polls place JUMP (owner-ratified Job 4, 2026-07-26): selecting a place in
 * the polls place chip FLIES THE MAP to it instead of filtering the feed — the
 * feed then follows the viewport naturally (no placeFilterId is sent any more).
 * The selection is momentary: no store write, no persistent selected state.
 *
 * Bbox source: the catalog slice already in the viewport subject store (the
 * placeOptions are viewport-membership places, so the ×3-margin slice contains
 * them in practice). No slice row → honest no-op (returns false; dev warn) —
 * the feed's placeOptions payload carries no geometry of its own (noted gap).
 */
export type PollsPlaceJumpResult = 'dispatched' | 'no-bbox' | 'rejected';

export const executePollsPlaceJump = ({
  placeId,
  slice,
  requestFly = requestMapCameraFlyToBbox,
}: {
  placeId: string;
  slice: readonly PlaceLike[] | null;
  /** Injectable for tests; defaults to the real camera-command seam. */
  requestFly?: (bbox: GeoBbox) => boolean;
}): PollsPlaceJumpResult => {
  const place = slice?.find((candidate) => candidate.placeId === placeId) ?? null;
  if (place == null) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(`[polls-place-jump] no catalog bbox for place ${placeId} — jump skipped`);
    }
    return 'no-bbox';
  }
  return requestFly(place.bbox) ? 'dispatched' : 'rejected';
};
